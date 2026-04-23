CREATE TABLE IF NOT EXISTS sessions (
  id                 TEXT PRIMARY KEY,
  user_id            INTEGER NOT NULL,
  app_id             TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active',
  device_name        TEXT,
  client_build       TEXT,
  last_seen_at       TEXT DEFAULT (datetime('now')),
  expires_at         TEXT NOT NULL,
  revoked_at         TEXT,
  revoke_reason      TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (app_id) REFERENCES apps(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_status
ON sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_sessions_app_status
ON sessions(app_id, status);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
ON sessions(expires_at);
