import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, AppRow, UserRow, SessionRow, AccessJwtPayload } from '../types';
import { hashPassword, randomHex, sha256Hex, verifyPassword } from '../lib/crypto';
import { signJwt, verifyJwt } from '../lib/jwt';
import {
  getUserByUsername,
  getUserById,
  createUser,
  incrementFailedCount,
  lockUser,
  resetFailedCount,
  bumpTokenVersion,
  updatePassword,
  deleteUser,
  createSession,
  getSessionById,
  rotateSessionRefreshToken,
  revokeSession,
  revokeAllSessionsForUser,
  deleteSessionsForUser,
  isSessionExpired,
} from '../lib/db';

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;
const ACCESS_TOKEN_EXPIRES_IN = 15 * 60;
const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60;

const auth = new Hono<{ Bindings: Env }>();
export const authV2 = new Hono<{ Bindings: Env }>();

type SessionTokens = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
};

type AccessAuthResult = {
  user: UserRow;
  session: SessionRow;
  payload: AccessJwtPayload;
  app: AppRow;
};

function jsonError(c: Context<{ Bindings: Env }>, status: number, error: string, message?: string) {
  return c.json({ error, message: message ?? error }, status as any);
}

function getCurrentApp(c: Context<{ Bindings: Env }>): AppRow {
  return c.get('app' as never) as AppRow;
}

function getBearerToken(c: Context<{ Bindings: Env }>): string | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

function formatSqlDate(offsetSeconds: number): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function parseRefreshToken(refreshToken: string): { sessionId: string; secret: string } | null {
  const dotIndex = refreshToken.indexOf('.');
  if (dotIndex <= 0 || dotIndex === refreshToken.length - 1) {
    return null;
  }
  return {
    sessionId: refreshToken.slice(0, dotIndex),
    secret: refreshToken.slice(dotIndex + 1),
  };
}

async function parseJson<T>(c: Context<{ Bindings: Env }>): Promise<T | null> {
  try {
    return await c.req.json<T>();
  } catch {
    return null;
  }
}

function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 32 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return 'Username must be 3-32 alphanumeric characters or underscores';
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

async function issueSessionTokens(
  env: Env,
  app: AppRow,
  user: UserRow,
  options?: { deviceName?: string; clientBuild?: string },
): Promise<SessionTokens> {
  const sessionId = `sess_${randomHex(32)}`;
  const refreshSecret = `rfs_${randomHex(32)}`;
  const refreshHash = await sha256Hex(refreshSecret);

  await createSession(env.DB, {
    id: sessionId,
    user_id: user.id,
    app_id: app.id,
    refresh_token_hash: refreshHash,
    expires_at: formatSqlDate(REFRESH_TOKEN_EXPIRES_IN),
    device_name: options?.deviceName ?? null,
    client_build: options?.clientBuild ?? null,
  });

  const accessToken = await signJwt(
    {
      sub: String(user.id),
      username: user.username,
      sid: sessionId,
      aid: app.id,
      type: 'access',
    },
    env.JWT_SECRET,
    ACCESS_TOKEN_EXPIRES_IN,
  );

  return {
    sessionId,
    accessToken,
    refreshToken: `${sessionId}.${refreshSecret}`,
    accessExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
    refreshExpiresIn: REFRESH_TOKEN_EXPIRES_IN,
  };
}

async function authenticateAccessToken(
  c: Context<{ Bindings: Env }>,
): Promise<AccessAuthResult | Response> {
  const token = getBearerToken(c);
  if (!token) {
    return jsonError(c, 401, 'invalid_token', 'Missing bearer token');
  }

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_token';
    return jsonError(c, 401, code, code);
  }

  if (payload.type !== 'access') {
    return jsonError(c, 401, 'invalid_token', 'Expected access token');
  }

  const app = getCurrentApp(c);
  if (payload.aid !== app.id) {
    return jsonError(c, 403, 'app_mismatch', 'Token does not belong to this app');
  }

  const session = await getSessionById(c.env.DB, payload.sid);
  if (!session || session.status !== 'active' || isSessionExpired(session)) {
    return jsonError(c, 401, 'session_revoked', 'Session is no longer valid');
  }
  if (session.app_id !== app.id) {
    return jsonError(c, 403, 'app_mismatch', 'Session does not belong to this app');
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) {
    return jsonError(c, 404, 'user_not_found', 'User does not exist');
  }
  if (user.status === 0) {
    return jsonError(c, 403, 'account_disabled', 'Account has been disabled');
  }

  return { user, session, payload, app };
}

function buildAuthSuccess(user: UserRow, tokens: SessionTokens) {
  return {
    user: {
      user_id: user.id,
      username: user.username,
    },
    session_id: tokens.sessionId,
    access_token: tokens.accessToken,
    access_expires_in: tokens.accessExpiresIn,
    refresh_token: tokens.refreshToken,
    refresh_expires_in: tokens.refreshExpiresIn,
  };
}

// ── V1 routes ───────────────────────────────────────────────────────────────

auth.post('/register', async (c) => {
  const body = await parseJson<{ username?: string; password?: string }>(c);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return c.json({ error: 'missing_fields', message: 'username and password are required' }, 400);
  }
  const usernameError = validateUsername(username);
  if (usernameError) {
    return c.json({ error: 'invalid_username', message: usernameError }, 400);
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return c.json({ error: 'weak_password', message: passwordError }, 400);
  }

  const existing = await getUserByUsername(c.env.DB, username);
  if (existing) {
    return c.json({ error: 'username_taken', message: 'This username is already taken' }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const id = await createUser(c.env.DB, { username, password_hash: hash, salt });

  const token = await signJwt({ sub: String(id), username, tv: 1, type: 'user' }, c.env.JWT_SECRET);
  return c.json({ user_id: id, token, expires_in: 604800 }, 201);
});

auth.post('/login', async (c) => {
  const body = await parseJson<{ username?: string; password?: string }>(c);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return c.json({ error: 'missing_fields', message: 'username and password are required' }, 400);
  }

  const user = await getUserByUsername(c.env.DB, username);
  if (!user) {
    return c.json({ error: 'invalid_credentials', message: 'Invalid username or password' }, 401);
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    return c.json(
      { error: 'account_locked', message: `Account is locked. Try again in ${remaining} minute(s)` },
      423,
    );
  }
  if (user.status === 0) {
    return c.json({ error: 'account_disabled', message: 'This account has been disabled' }, 403);
  }

  const valid = await verifyPassword(password, user.password_hash, user.salt);
  if (!valid) {
    const count = await incrementFailedCount(c.env.DB, user.id);
    if (count >= LOCK_THRESHOLD) {
      await lockUser(c.env.DB, user.id, LOCK_MINUTES);
      return c.json(
        { error: 'account_locked', message: `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes` },
        423,
      );
    }
    return c.json({ error: 'invalid_credentials', message: 'Invalid username or password' }, 401);
  }

  await resetFailedCount(c.env.DB, user.id);
  const token = await signJwt(
    { sub: String(user.id), username: user.username, tv: user.token_version, type: 'user' },
    c.env.JWT_SECRET,
  );
  return c.json({ user_id: user.id, token, expires_in: 604800 });
});

auth.post('/verify', async (c) => {
  const token = getBearerToken(c);
  if (!token) {
    return c.json({ error: 'missing_token' }, 401);
  }

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'invalid_token';
    return c.json({ error: msg }, 401);
  }

  if (payload.type !== 'user') {
    return c.json({ error: 'invalid_token' }, 401);
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || user.status === 0) {
    return c.json({ error: 'user_not_found' }, 401);
  }
  if (user.token_version !== payload.tv) {
    return c.json({ error: 'token_revoked' }, 401);
  }

  return c.json({ valid: true, user_id: user.id, username: user.username });
});

auth.post('/change-password', async (c) => {
  const token = getBearerToken(c);
  if (!token) {
    return c.json({ error: 'missing_token' }, 401);
  }

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }

  if (payload.type !== 'user') {
    return c.json({ error: 'invalid_token' }, 401);
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || user.token_version !== payload.tv) {
    return c.json({ error: 'token_revoked' }, 401);
  }

  const body = await parseJson<{ old_password?: string; new_password?: string }>(c);
  if (!body?.old_password || !body.new_password) {
    return c.json({ error: 'missing_fields' }, 400);
  }
  const passwordError = validatePassword(body.new_password);
  if (passwordError) {
    return c.json({ error: 'weak_password', message: passwordError }, 400);
  }

  const valid = await verifyPassword(body.old_password, user.password_hash, user.salt);
  if (!valid) {
    return c.json({ error: 'invalid_credentials', message: 'Old password is incorrect' }, 401);
  }

  const { hash, salt } = await hashPassword(body.new_password);
  await updatePassword(c.env.DB, user.id, hash, salt);

  return c.json({ success: true });
});

auth.post('/logout', async (c) => {
  const token = getBearerToken(c);
  if (!token) {
    return c.json({ success: true });
  }

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ success: true });
  }

  if (payload.type !== 'user') {
    return c.json({ success: true });
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (user && user.token_version === payload.tv) {
    await bumpTokenVersion(c.env.DB, user.id);
  }

  return c.json({ success: true });
});

auth.post('/delete-account', async (c) => {
  const token = getBearerToken(c);
  if (!token) {
    return c.json({ error: 'missing_token' }, 401);
  }

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }

  if (payload.type !== 'user') {
    return c.json({ error: 'invalid_token' }, 401);
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || user.token_version !== payload.tv) {
    return c.json({ error: 'token_revoked' }, 401);
  }

  const body = await parseJson<{ password?: string }>(c);
  if (!body?.password) {
    return c.json({ error: 'missing_password', message: 'Password is required to delete account' }, 400);
  }

  const valid = await verifyPassword(body.password, user.password_hash, user.salt);
  if (!valid) {
    return c.json({ error: 'invalid_credentials', message: 'Password is incorrect' }, 401);
  }

  await deleteUser(c.env.DB, user.id);
  return c.json({ success: true });
});

// ── V2 routes ───────────────────────────────────────────────────────────────

authV2.post('/register', async (c) => {
  const body = await parseJson<{
    username?: string;
    password?: string;
    device_name?: string;
    client_build?: string;
  }>(c);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return jsonError(c, 400, 'invalid_request', 'username and password are required');
  }
  const usernameError = validateUsername(username);
  if (usernameError) {
    return jsonError(c, 400, 'invalid_request', usernameError);
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return jsonError(c, 400, 'invalid_request', passwordError);
  }

  const existing = await getUserByUsername(c.env.DB, username);
  if (existing) {
    return jsonError(c, 409, 'username_taken', 'This username is already taken');
  }

  const { hash, salt } = await hashPassword(password);
  const id = await createUser(c.env.DB, { username, password_hash: hash, salt });
  const user = await getUserById(c.env.DB, id);
  if (!user) {
    return jsonError(c, 500, 'server_error', 'Failed to load created user');
  }

  const tokens = await issueSessionTokens(c.env, getCurrentApp(c), user, {
    deviceName: body.device_name,
    clientBuild: body.client_build,
  });
  return c.json(buildAuthSuccess(user, tokens), 201);
});

authV2.post('/login', async (c) => {
  const body = await parseJson<{
    username?: string;
    password?: string;
    device_name?: string;
    client_build?: string;
  }>(c);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return jsonError(c, 400, 'invalid_request', 'username and password are required');
  }

  const user = await getUserByUsername(c.env.DB, username);
  if (!user) {
    return jsonError(c, 401, 'invalid_credentials', 'Invalid username or password');
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return jsonError(c, 403, 'account_locked', 'Account is temporarily locked');
  }
  if (user.status === 0) {
    return jsonError(c, 403, 'account_disabled', 'This account has been disabled');
  }

  const valid = await verifyPassword(password, user.password_hash, user.salt);
  if (!valid) {
    const count = await incrementFailedCount(c.env.DB, user.id);
    if (count >= LOCK_THRESHOLD) {
      await lockUser(c.env.DB, user.id, LOCK_MINUTES);
      return jsonError(c, 403, 'account_locked', 'Account is temporarily locked');
    }
    return jsonError(c, 401, 'invalid_credentials', 'Invalid username or password');
  }

  await resetFailedCount(c.env.DB, user.id);
  const tokens = await issueSessionTokens(c.env, getCurrentApp(c), user, {
    deviceName: body.device_name,
    clientBuild: body.client_build,
  });
  return c.json(buildAuthSuccess(user, tokens));
});

authV2.post('/refresh', async (c) => {
  const body = await parseJson<{ refresh_token?: string }>(c);
  if (!body?.refresh_token) {
    return jsonError(c, 400, 'invalid_request', 'refresh_token is required');
  }

  const parsed = parseRefreshToken(body.refresh_token);
  if (!parsed) {
    return jsonError(c, 401, 'invalid_refresh_token', 'Refresh token is malformed');
  }

  const app = getCurrentApp(c);
  const session = await getSessionById(c.env.DB, parsed.sessionId);
  if (!session) {
    return jsonError(c, 401, 'invalid_refresh_token', 'Session does not exist');
  }
  if (session.app_id !== app.id) {
    return jsonError(c, 403, 'app_mismatch', 'Refresh token does not belong to this app');
  }
  if (session.status !== 'active') {
    return jsonError(c, 401, 'refresh_token_revoked', 'Refresh token has been revoked');
  }
  if (isSessionExpired(session)) {
    return jsonError(c, 401, 'refresh_token_expired', 'Refresh token has expired');
  }

  const secretHash = await sha256Hex(parsed.secret);
  if (secretHash !== session.refresh_token_hash) {
    return jsonError(c, 401, 'invalid_refresh_token', 'Refresh token is invalid');
  }

  const user = await getUserById(c.env.DB, session.user_id);
  if (!user) {
    return jsonError(c, 404, 'user_not_found', 'User does not exist');
  }
  if (user.status === 0) {
    return jsonError(c, 403, 'account_disabled', 'Account has been disabled');
  }

  const nextRefreshSecret = `rfs_${randomHex(32)}`;
  const nextRefreshHash = await sha256Hex(nextRefreshSecret);
  await rotateSessionRefreshToken(
    c.env.DB,
    session.id,
    nextRefreshHash,
    formatSqlDate(REFRESH_TOKEN_EXPIRES_IN),
  );

  const accessToken = await signJwt(
    {
      sub: String(user.id),
      username: user.username,
      sid: session.id,
      aid: app.id,
      type: 'access',
    },
    c.env.JWT_SECRET,
    ACCESS_TOKEN_EXPIRES_IN,
  );

  return c.json({
    session_id: session.id,
    access_token: accessToken,
    access_expires_in: ACCESS_TOKEN_EXPIRES_IN,
    refresh_token: `${session.id}.${nextRefreshSecret}`,
    refresh_expires_in: REFRESH_TOKEN_EXPIRES_IN,
  });
});

authV2.post('/verify', async (c) => {
  const authResult = await authenticateAccessToken(c);
  if (authResult instanceof Response) {
    return authResult;
  }

  return c.json({
    valid: true,
    user_id: authResult.user.id,
    username: authResult.user.username,
    session_id: authResult.session.id,
  });
});

authV2.post('/logout', async (c) => {
  const body = await parseJson<{ refresh_token?: string }>(c);
  if (!body?.refresh_token) {
    return jsonError(c, 400, 'invalid_request', 'refresh_token is required');
  }

  const parsed = parseRefreshToken(body.refresh_token);
  if (!parsed) {
    return jsonError(c, 400, 'invalid_request', 'Refresh token is malformed');
  }

  const session = await getSessionById(c.env.DB, parsed.sessionId);
  if (!session) {
    return c.json({ success: true });
  }
  if (session.app_id !== getCurrentApp(c).id) {
    return jsonError(c, 403, 'app_mismatch', 'Session does not belong to this app');
  }
  if (session.status !== 'active' || isSessionExpired(session)) {
    return c.json({ success: true });
  }

  const secretHash = await sha256Hex(parsed.secret);
  if (secretHash !== session.refresh_token_hash) {
    return c.json({ success: true });
  }

  await revokeSession(c.env.DB, session.id, 'logout');
  return c.json({ success: true });
});

authV2.post('/logout-all', async (c) => {
  const authResult = await authenticateAccessToken(c);
  if (authResult instanceof Response) {
    return authResult;
  }

  const revokedSessions = await revokeAllSessionsForUser(c.env.DB, authResult.user.id, 'logout_all');
  await bumpTokenVersion(c.env.DB, authResult.user.id);

  return c.json({ success: true, revoked_sessions: revokedSessions });
});

authV2.post('/change-password', async (c) => {
  const authResult = await authenticateAccessToken(c);
  if (authResult instanceof Response) {
    return authResult;
  }

  const body = await parseJson<{
    old_password?: string;
    new_password?: string;
    device_name?: string;
    client_build?: string;
  }>(c);
  if (!body?.old_password || !body.new_password) {
    return jsonError(c, 400, 'invalid_request', 'old_password and new_password are required');
  }
  const passwordError = validatePassword(body.new_password);
  if (passwordError) {
    return jsonError(c, 400, 'invalid_request', passwordError);
  }

  const valid = await verifyPassword(
    body.old_password,
    authResult.user.password_hash,
    authResult.user.salt,
  );
  if (!valid) {
    return jsonError(c, 401, 'wrong_password', 'Old password is incorrect');
  }

  const { hash, salt } = await hashPassword(body.new_password);
  await updatePassword(c.env.DB, authResult.user.id, hash, salt);
  await revokeAllSessionsForUser(c.env.DB, authResult.user.id, 'password_changed');

  const refreshedUser = await getUserById(c.env.DB, authResult.user.id);
  if (!refreshedUser) {
    return jsonError(c, 404, 'user_not_found', 'User does not exist');
  }

  const tokens = await issueSessionTokens(c.env, authResult.app, refreshedUser, {
    deviceName: body.device_name,
    clientBuild: body.client_build,
  });

  return c.json({
    success: true,
    session_id: tokens.sessionId,
    access_token: tokens.accessToken,
    access_expires_in: tokens.accessExpiresIn,
    refresh_token: tokens.refreshToken,
    refresh_expires_in: tokens.refreshExpiresIn,
  });
});

authV2.post('/delete-account', async (c) => {
  const authResult = await authenticateAccessToken(c);
  if (authResult instanceof Response) {
    return authResult;
  }

  const body = await parseJson<{ password?: string }>(c);
  if (!body?.password) {
    return jsonError(c, 400, 'invalid_request', 'password is required');
  }

  const valid = await verifyPassword(
    body.password,
    authResult.user.password_hash,
    authResult.user.salt,
  );
  if (!valid) {
    return jsonError(c, 401, 'wrong_password', 'Password is incorrect');
  }

  await deleteSessionsForUser(c.env.DB, authResult.user.id);
  await deleteUser(c.env.DB, authResult.user.id);
  return c.json({ success: true });
});

export default auth;
