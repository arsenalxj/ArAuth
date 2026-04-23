import type { AppRow, UserRow, AdminRow, SessionRow } from '../types';

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ── Apps ────────────────────────────────────────────────────────────────────

export async function getAppByKey(db: D1Database, appKey: string): Promise<AppRow | null> {
  const result = await db
    .prepare('SELECT * FROM apps WHERE app_key = ?')
    .bind(appKey)
    .first<AppRow>();
  return result ?? null;
}

export async function listApps(db: D1Database): Promise<AppRow[]> {
  const result = await db.prepare('SELECT * FROM apps ORDER BY created_at DESC').all<AppRow>();
  return result.results;
}

export async function createApp(db: D1Database, app: Omit<AppRow, 'created_at'>): Promise<void> {
  await db
    .prepare(
      'INSERT INTO apps (id, name, app_key, app_secret, app_secret_salt, status) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(app.id, app.name, app.app_key, app.app_secret, app.app_secret_salt, app.status)
    .run();
}

export async function setAppStatus(db: D1Database, id: string, status: number): Promise<void> {
  await db.prepare('UPDATE apps SET status = ? WHERE id = ?').bind(status, id).run();
}

export async function deleteApp(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM apps WHERE id = ?').bind(id).run();
}

export async function countApps(db: D1Database): Promise<{ total: number; enabled: number }> {
  const row = await db
    .prepare('SELECT COUNT(*) as total, SUM(status) as enabled FROM apps')
    .first<{ total: number; enabled: number }>();
  return { total: row?.total ?? 0, enabled: row?.enabled ?? 0 };
}

// ── Users ───────────────────────────────────────────────────────────────────

export async function getUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE username = ?')
    .bind(username)
    .first<UserRow>();
  return result ?? null;
}

export async function getUserById(db: D1Database, id: string | number): Promise<UserRow | null> {
  const result = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return result ?? null;
}

export async function createUser(
  db: D1Database,
  user: Pick<UserRow, 'username' | 'password_hash' | 'salt'>,
): Promise<number> {
  const result = await db
    .prepare('INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)')
    .bind(user.username, user.password_hash, user.salt)
    .run();
  return result.meta.last_row_id;
}

export async function incrementFailedCount(db: D1Database, id: string | number): Promise<number> {
  await db
    .prepare(
      "UPDATE users SET failed_count = failed_count + 1, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .run();
  const row = await db
    .prepare('SELECT failed_count FROM users WHERE id = ?')
    .bind(id)
    .first<{ failed_count: number }>();
  return row?.failed_count ?? 0;
}

export async function lockUser(db: D1Database, id: string | number, minutes: number): Promise<void> {
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  await db
    .prepare("UPDATE users SET locked_until = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(until, id)
    .run();
}

export async function resetFailedCount(db: D1Database, id: string | number): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET failed_count = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .run();
}

export async function bumpTokenVersion(db: D1Database, id: string | number): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .run();
}

export async function updatePassword(
  db: D1Database,
  id: string | number,
  hash: string,
  salt: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET password_hash = ?, salt = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(hash, salt, id)
    .run();
}

export async function setUserStatus(db: D1Database, id: string | number, status: number): Promise<void> {
  await db
    .prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, id)
    .run();
}

export async function deleteUser(db: D1Database, id: string | number): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
}

export async function listUsers(
  db: D1Database,
  opts: { limit: number; offset: number; search?: string; status?: number },
): Promise<{ rows: UserRow[]; total: number }> {
  let where = '1=1';
  const params: (string | number)[] = [];

  if (opts.search) {
    where += ' AND (u.username LIKE ? OR CAST(u.id AS TEXT) LIKE ?)';
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  if (opts.status !== undefined) {
    where += ' AND u.status = ?';
    params.push(opts.status);
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) as c FROM users u WHERE ${where}`)
    .bind(...params)
    .first<{ c: number }>();

  const rows = await db
    .prepare(
      `SELECT
         u.*,
         COUNT(CASE WHEN s.status = 'active' AND s.expires_at > datetime('now') THEN 1 END) AS active_sessions,
         MAX(s.last_seen_at) AS last_seen_at
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id
       WHERE ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, opts.limit, opts.offset)
    .all<UserRow>();

  return { rows: rows.results, total: countRow?.c ?? 0 };
}

export async function countUsers(db: D1Database): Promise<{ total: number; locked: number; week: number }> {
  const total = await db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>();
  const locked = await db
    .prepare(
      "SELECT COUNT(*) as c FROM users WHERE locked_until IS NOT NULL AND locked_until > datetime('now')",
    )
    .first<{ c: number }>();
  const week = await db
    .prepare("SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')")
    .first<{ c: number }>();
  return {
    total: total?.c ?? 0,
    locked: locked?.c ?? 0,
    week: week?.c ?? 0,
  };
}

// ── Sessions ────────────────────────────────────────────────────────────────

export async function createSession(
  db: D1Database,
  session: Pick<
    SessionRow,
    'id' | 'user_id' | 'app_id' | 'refresh_token_hash' | 'expires_at' | 'device_name' | 'client_build'
  >,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (
         id, user_id, app_id, refresh_token_hash, status, device_name, client_build, last_seen_at, expires_at, created_at
       ) VALUES (?, ?, ?, ?, 'active', ?, ?, datetime('now'), ?, datetime('now'))`,
    )
    .bind(
      session.id,
      session.user_id,
      session.app_id,
      session.refresh_token_hash,
      session.device_name,
      session.client_build,
      session.expires_at,
    )
    .run();
}

export async function getSessionById(db: D1Database, id: string): Promise<SessionRow | null> {
  const result = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<SessionRow>();
  return result ?? null;
}

export async function rotateSessionRefreshToken(
  db: D1Database,
  id: string,
  refreshTokenHash: string,
  expiresAt: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions
       SET refresh_token_hash = ?, expires_at = ?, last_seen_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(refreshTokenHash, expiresAt, id)
    .run();
}

export async function revokeSession(
  db: D1Database,
  id: string,
  reason: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions
       SET status = 'revoked', revoked_at = datetime('now'), revoke_reason = ?
       WHERE id = ? AND status = 'active'`,
    )
    .bind(reason, id)
    .run();
}

export async function revokeAllSessionsForUser(
  db: D1Database,
  userId: string | number,
  reason: string,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE sessions
       SET status = 'revoked', revoked_at = datetime('now'), revoke_reason = ?
       WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')`,
    )
    .bind(reason, userId)
    .run();
  return result.meta.changes ?? 0;
}

export async function deleteSessionsForUser(db: D1Database, userId: string | number): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

export async function cleanupSessions(db: D1Database): Promise<{ expired: number; revoked: number }> {
  const expired = await db
    .prepare("DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days')")
    .run();
  const revoked = await db
    .prepare(
      "DELETE FROM sessions WHERE status = 'revoked' AND revoked_at IS NOT NULL AND revoked_at < datetime('now', '-7 days')",
    )
    .run();
  return {
    expired: expired.meta.changes ?? 0,
    revoked: revoked.meta.changes ?? 0,
  };
}

export function isSessionExpired(session: SessionRow): boolean {
  return session.expires_at <= nowSql();
}

// ── Admins ──────────────────────────────────────────────────────────────────

export async function getAdminByUsername(db: D1Database, username: string): Promise<AdminRow | null> {
  const result = await db
    .prepare('SELECT * FROM admins WHERE username = ?')
    .bind(username)
    .first<AdminRow>();
  return result ?? null;
}

export async function createAdmin(
  db: D1Database,
  admin: Pick<AdminRow, 'id' | 'username' | 'password_hash' | 'salt'>,
): Promise<void> {
  await db
    .prepare('INSERT INTO admins (id, username, password_hash, salt) VALUES (?, ?, ?, ?)')
    .bind(admin.id, admin.username, admin.password_hash, admin.salt)
    .run();
}
