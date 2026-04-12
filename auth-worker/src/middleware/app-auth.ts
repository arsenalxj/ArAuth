import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { getAppByKey } from '../lib/db';
import { verifyPassword } from '../lib/crypto';

export async function appAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const appKey = c.req.header('X-App-Key');
  const appSecret = c.req.header('X-App-Secret');

  if (!appKey || !appSecret) {
    return c.json({ error: 'missing_credentials', message: 'X-App-Key and X-App-Secret are required' }, 401);
  }

  const app = await getAppByKey(c.env.DB, appKey);
  if (!app) {
    return c.json({ error: 'invalid_app_key', message: 'Unknown app key' }, 401);
  }
  if (app.status === 0) {
    return c.json({ error: 'app_disabled', message: 'This app has been disabled' }, 403);
  }

  const valid = await verifyPassword(appSecret, app.app_secret, app.app_secret_salt);
  if (!valid) {
    return c.json({ error: 'invalid_app_secret', message: 'Invalid app secret' }, 401);
  }

  c.set('app' as never, app);
  await next();
}
