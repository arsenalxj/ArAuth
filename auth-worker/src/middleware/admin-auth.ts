import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { verifyJwt } from '../lib/jwt';

export async function adminAuth(c: Context<{ Bindings: Env }>, next: Next) {
  // Check session cookie first, then Authorization header
  const cookie = getCookie(c.req.raw, 'admin_token');
  const authHeader = c.req.header('Authorization');
  const token = cookie ?? (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!token) {
    return redirectToLogin(c);
  }

  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    if (payload.type !== 'admin') {
      return redirectToLogin(c);
    }
    c.set('adminPayload' as never, payload);
    return next();
  } catch {
    return redirectToLogin(c);
  }
}

function redirectToLogin(c: Context) {
  // If it's an API call (JSON), return 401; otherwise redirect to login page
  const accept = c.req.header('Accept') ?? '';
  if (accept.includes('application/json')) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.redirect('/admin/login');
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k.trim() === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
