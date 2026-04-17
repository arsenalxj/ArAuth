import type { AppRow, UserRow, AdminRow } from '../types';

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

export async function createApp(
  db: D1Database,
  app: Omit<AppRow, 'created_at'>,
): Promise<void> {
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

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
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

export async function incrementFailedCount(db: D1Database, id: string): Promise<number> {
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

export async function lockUser(db: D1Database, id: string, minutes: number): Promise<void> {
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  await db
    .prepare(
      "UPDATE users SET locked_until = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(until, id)
    .run();
}

export async function resetFailedCount(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET failed_count = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .run();
}

export async function bumpTokenVersion(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .run();
}

export async function updatePassword(
  db: D1Database,
  id: string,
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

export async function setUserStatus(db: D1Database, id: string, status: number): Promise<void> {
  await db
    .prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, id)
    .run();
}

export async function deleteUser(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
}

export async function listUsers(
  db: D1Database,
  opts: { limit: number; offset: number; search?: string; status?: number },
): Promise<{ rows: UserRow[]; total: number }> {
  let where = '1=1';
  const params: (string | number)[] = [];

  if (opts.search) {
    where += ' AND (username LIKE ? OR id LIKE ?)';
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  if (opts.status !== undefined) {
    where += ' AND status = ?';
    params.push(opts.status);
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) as c FROM users WHERE ${where}`)
    .bind(...params)
    .first<{ c: number }>();

  const rows = await db
    .prepare(
      `SELECT * FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, opts.limit, opts.offset)
    .all<UserRow>();

  return { rows: rows.results, total: countRow?.c ?? 0 };
}

export async function countUsers(
  db: D1Database,
): Promise<{ total: number; locked: number; week: number }> {
  const total = await db
    .prepare('SELECT COUNT(*) as c FROM users')
    .first<{ c: number }>();
  const locked = await db
    .prepare(
      "SELECT COUNT(*) as c FROM users WHERE locked_until IS NOT NULL AND locked_until > datetime('now')",
    )
    .first<{ c: number }>();
  const week = await db
    .prepare(
      "SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')",
    )
    .first<{ c: number }>();
  return {
    total: total?.c ?? 0,
    locked: locked?.c ?? 0,
    week: week?.c ?? 0,
  };
}

// ── Admins ──────────────────────────────────────────────────────────────────

export async function getAdminByUsername(
  db: D1Database,
  username: string,
): Promise<AdminRow | null> {
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
