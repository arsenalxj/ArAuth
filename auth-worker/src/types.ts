export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

export type AppRow = {
  id: string;
  name: string;
  app_key: string;
  app_secret: string;
  app_secret_salt: string;
  status: number;
  created_at: string;
};

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  status: number;
  failed_count: number;
  locked_until: string | null;
  token_version: number;
  created_at: string;
  updated_at: string;
  active_sessions?: number;
  last_seen_at?: string | null;
};

export type AdminRow = {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
};

export type SessionRow = {
  id: string;
  user_id: number;
  app_id: string;
  refresh_token_hash: string;
  status: 'active' | 'revoked';
  device_name: string | null;
  client_build: string | null;
  last_seen_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
};

export type UserJwtPayload = {
  sub: string;
  username: string;
  tv: number;
  type: 'user';
  exp: number;
  iat: number;
};

export type AdminJwtPayload = {
  sub: string;
  username: string;
  type: 'admin';
  exp: number;
  iat: number;
};

export type AccessJwtPayload = {
  sub: string;
  username: string;
  sid: string;
  aid: string;
  type: 'access';
  exp: number;
  iat: number;
};

export type JwtPayload = UserJwtPayload | AdminJwtPayload | AccessJwtPayload;
