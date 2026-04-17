import { Hono } from 'hono';
import type { Env } from '../types';
import { hashPassword, verifyPassword } from '../lib/crypto';
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
} from '../lib/db';

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;

const auth = new Hono<{ Bindings: Env }>();

// POST /api/v1/auth/register
auth.post('/register', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ error: 'missing_fields', message: 'username and password are required' }, 400);
  }
  if (username.length < 3 || username.length > 32 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return c.json(
      { error: 'invalid_username', message: 'Username must be 3-32 alphanumeric characters or underscores' },
      400,
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return c.json(
      { error: 'weak_password', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
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

// POST /api/v1/auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ error: 'missing_fields', message: 'username and password are required' }, 400);
  }

  const user = await getUserByUsername(c.env.DB, username);
  if (!user) {
    return c.json({ error: 'invalid_credentials', message: 'Invalid username or password' }, 401);
  }

  // Check lock
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
    { sub: user.id, username: user.username, tv: user.token_version, type: 'user' },
    c.env.JWT_SECRET,
  );
  return c.json({ user_id: user.id, token, expires_in: 604800 });
});

// POST /api/v1/auth/verify
auth.post('/verify', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'missing_token' }, 401);
  }
  const token = authHeader.slice(7);

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

// POST /api/v1/auth/change-password
auth.post('/change-password', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'missing_token' }, 401);
  }
  const token = authHeader.slice(7);

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || user.token_version !== payload.tv) {
    return c.json({ error: 'token_revoked' }, 401);
  }

  const body = await c.req.json<{ old_password?: string; new_password?: string }>();
  if (!body.old_password || !body.new_password) {
    return c.json({ error: 'missing_fields' }, 400);
  }
  if (body.new_password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: 'weak_password', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
  }

  const valid = await verifyPassword(body.old_password, user.password_hash, user.salt);
  if (!valid) {
    return c.json({ error: 'invalid_credentials', message: 'Old password is incorrect' }, 401);
  }

  const { hash, salt } = await hashPassword(body.new_password);
  await updatePassword(c.env.DB, user.id, hash, salt);

  return c.json({ success: true });
});

// POST /api/v1/auth/logout
auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'missing_token' }, 401);
  }
  const token = authHeader.slice(7);

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ success: true }); // already invalid
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (user && user.token_version === payload.tv) {
    await bumpTokenVersion(c.env.DB, user.id);
  }

  return c.json({ success: true });
});

// POST /api/v1/auth/delete-account
auth.post('/delete-account', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'missing_token' }, 401);
  }
  const token = authHeader.slice(7);

  let payload;
  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || user.token_version !== payload.tv) {
    return c.json({ error: 'token_revoked' }, 401);
  }

  const body = await c.req.json<{ password?: string }>();
  if (!body.password) {
    return c.json({ error: 'missing_password', message: 'Password is required to delete account' }, 400);
  }

  const valid = await verifyPassword(body.password, user.password_hash, user.salt);
  if (!valid) {
    return c.json({ error: 'invalid_credentials', message: 'Password is incorrect' }, 401);
  }

  await deleteUser(c.env.DB, user.id);
  return c.json({ success: true });
});

export default auth;
