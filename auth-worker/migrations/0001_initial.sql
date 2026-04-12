-- ArAuth initial schema

-- Registered Flutter apps
CREATE TABLE IF NOT EXISTS apps (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  app_key     TEXT NOT NULL UNIQUE,
  app_secret  TEXT NOT NULL,           -- PBKDF2 hash
  app_secret_salt TEXT NOT NULL,
  status      INTEGER DEFAULT 1,       -- 1=enabled 0=disabled
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apps_key ON apps(app_key);

-- Shared user pool (cross-app)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  status        INTEGER DEFAULT 1,     -- 1=active 0=disabled
  failed_count  INTEGER DEFAULT 0,
  locked_until  TEXT,
  token_version INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Admin accounts (isolated from user pool)
CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
