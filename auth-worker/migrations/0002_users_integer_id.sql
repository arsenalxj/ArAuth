-- 将 users.id 从 TEXT 改为 INTEGER AUTOINCREMENT，起始值 100000

-- 重建 users 表
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  status        INTEGER DEFAULT 1,
  failed_count  INTEGER DEFAULT 0,
  locked_until  TEXT,
  token_version INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 设置自增起始值为 100000
INSERT INTO sqlite_sequence (name, seq) VALUES ('users', 99999);
