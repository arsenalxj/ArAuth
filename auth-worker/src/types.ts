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
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  status: number;
  failed_count: number;
  locked_until: string | null;
  token_version: number;
  created_at: string;
  updated_at: string;
};

export type AdminRow = {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
};

export type JwtPayload = {
  sub: string;       // user id
  username: string;
  tv: number;        // token_version
  type: 'user' | 'admin';
  exp: number;
  iat: number;
};
