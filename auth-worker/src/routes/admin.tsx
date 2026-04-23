/** @jsxImportSource hono/jsx */
import { Hono } from 'hono';
import type { Env } from '../types';
import { signJwt, verifyJwt } from '../lib/jwt';
import { hashPassword, randomHex, verifyPassword } from '../lib/crypto';
import {
  getAdminByUsername,
  createAdmin,
  listApps,
  createApp,
  setAppStatus,
  deleteApp,
  countApps,
  listUsers,
  getUserById,
  setUserStatus,
  updatePassword,
  countUsers,
  revokeAllSessionsForUser,
} from '../lib/db';
import { adminAuth } from '../middleware/admin-auth';
import { LoginPage } from '../views/login';
import { DashboardPage } from '../views/dashboard';
import { AppsPage } from '../views/apps';
import { UsersPage } from '../views/users';

const PAGE_SIZE = 20;

const admin = new Hono<{ Bindings: Env }>();

// ── Helpers ─────────────────────────────────────────────────────────────────

function getAdminCookie(req: Request): string | null {
  const header = req.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k.trim() === 'admin_token') return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function getAdminName(req: Request, secret: string): Promise<string> {
  const token = getAdminCookie(req);
  if (!token) return 'Admin';
  try {
    const p = await verifyJwt(token, secret);
    return p.username;
  } catch {
    return 'Admin';
  }
}

// ── Login ────────────────────────────────────────────────────────────────────

admin.get('/login', async (c) => {
  // If already logged in redirect to dashboard
  const token = getAdminCookie(c.req.raw);
  if (token) {
    try {
      await verifyJwt(token, c.env.JWT_SECRET);
      return c.redirect('/admin/dashboard');
    } catch {}
  }
  return c.html((<LoginPage />) as string);
});

admin.post('/login', async (c) => {
  const body = await c.req.parseBody<{ username: string; password: string }>();
  const { username, password } = body;

  if (!username || !password) {
    return c.html((<LoginPage error="请填写账号和密码" />) as string, 400);
  }

  const adminRow = await getAdminByUsername(c.env.DB, username);
  if (!adminRow) {
    return c.html((<LoginPage error="账号或密码错误" />) as string, 401);
  }

  const valid = await verifyPassword(password, adminRow.password_hash, adminRow.salt);
  if (!valid) {
    return c.html((<LoginPage error="账号或密码错误" />) as string, 401);
  }

  const token = await signJwt(
    { sub: adminRow.id, username: adminRow.username, type: 'admin' },
    c.env.JWT_SECRET,
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin/dashboard',
      'Set-Cookie': `admin_token=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=604800`,
    },
  });
});

// ── Logout ───────────────────────────────────────────────────────────────────

admin.post('/logout', (c) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: '/admin/login',
      'Set-Cookie': 'admin_token=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0',
    },
  }),
);

// ── Protected routes ──────────────────────────────────────────────────────────

admin.use('/dashboard', adminAuth);
admin.use('/apps', adminAuth);
admin.use('/apps/*', adminAuth);
admin.use('/users', adminAuth);
admin.use('/users/*', adminAuth);

// Dashboard
admin.get('/dashboard', async (c) => {
  const [userStats, appStats, { rows: recentUsers }, apps] = await Promise.all([
    countUsers(c.env.DB),
    countApps(c.env.DB),
    listUsers(c.env.DB, { limit: 5, offset: 0 }),
    listApps(c.env.DB),
  ]);
  const adminName = await getAdminName(c.req.raw, c.env.JWT_SECRET);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);

  return c.html(
    (<DashboardPage
      adminName={adminName}
      userStats={userStats}
      appStats={appStats}
      recentUsers={recentUsers}
      apps={apps}
      now={now}
    />) as string,
  );
});

// Apps list
admin.get('/apps', async (c) => {
  const [apps, { total: usersCount }] = await Promise.all([
    listApps(c.env.DB),
    listUsers(c.env.DB, { limit: 1, offset: 0 }),
  ]);
  const adminName = await getAdminName(c.req.raw, c.env.JWT_SECRET);

  // Show newly created secret if present in query params (one-time display)
  const appKey = c.req.query('new_key');
  const appSecret = c.req.query('new_secret');
  const appName = c.req.query('new_name');
  const newSecret =
    appKey && appSecret && appName ? { appKey, appSecret, appName } : null;

  return c.html(
    (<AppsPage apps={apps} adminName={adminName} usersCount={usersCount} newSecret={newSecret} />) as string,
  );
});

// Create app
admin.post('/apps', async (c) => {
  const body = await c.req.parseBody<{ name: string }>();
  const name = body.name?.trim();
  if (!name) return c.redirect('/admin/apps');

  const id = randomHex(16);
  const plainKey = `ark_${randomHex(8)}`;
  const plainSecret = `ars_${randomHex(24)}`;
  const { hash: secretHash, salt: secretSalt } = await hashPassword(plainSecret);

  await createApp(c.env.DB, {
    id,
    name,
    app_key: plainKey,
    app_secret: secretHash,
    app_secret_salt: secretSalt,
    status: 1,
  });

  // Redirect with one-time secret in query string
  const params = new URLSearchParams({ new_key: plainKey, new_secret: plainSecret, new_name: name });
  return c.redirect(`/admin/apps?${params.toString()}`);
});

// Toggle app status
admin.post('/apps/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const apps = await listApps(c.env.DB);
  const app = apps.find((a) => a.id === id);
  if (app) await setAppStatus(c.env.DB, id, app.status === 1 ? 0 : 1);
  return c.redirect('/admin/apps');
});

// Delete app
admin.post('/apps/:id/delete', async (c) => {
  await deleteApp(c.env.DB, c.req.param('id'));
  return c.redirect('/admin/apps');
});

// Users list
admin.get('/users', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const search = c.req.query('search') ?? '';
  const statusFilter = c.req.query('status') ?? '';

  const statusNum = statusFilter === '1' ? 1 : statusFilter === '0' ? 0 : undefined;
  const { rows, total } = await listUsers(c.env.DB, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: search || undefined,
    status: statusNum,
  });

  const [adminName, { total: appsCount }] = await Promise.all([
    getAdminName(c.req.raw, c.env.JWT_SECRET),
    countApps(c.env.DB),
  ]);

  return c.html(
    (<UsersPage
      rows={rows}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      search={search}
      statusFilter={statusFilter}
      adminName={adminName}
      appsCount={appsCount}
    />) as string,
  );
});

// Toggle user status
admin.post('/users/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.parseBody<{ redirect?: string }>();
  const user = await getUserById(c.env.DB, id);
  if (user) await setUserStatus(c.env.DB, id, user.status === 1 ? 0 : 1);
  return c.redirect(body.redirect ?? '/admin/users');
});

// Reset user password
admin.post('/users/:id/reset-password', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.parseBody<{ password: string; confirm: string; redirect?: string }>();

  if (!body.password || body.password !== body.confirm || body.password.length < 8) {
    return c.redirect(body.redirect ?? '/admin/users');
  }

  const { hash, salt } = await hashPassword(body.password);
  await updatePassword(c.env.DB, id, hash, salt);
  await revokeAllSessionsForUser(c.env.DB, id, 'admin_password_reset');
  return c.redirect(body.redirect ?? '/admin/users');
});

// Root redirect
admin.get('/', (c) => c.redirect('/admin/login'));

// ── Bootstrap: create first admin ────────────────────────────────────────────
// POST /admin/bootstrap  { username, password, init_key }
// Only works if no admins exist yet.
admin.post('/bootstrap', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string; init_key?: string }>();
  if (!body.username || !body.password) {
    return c.json({ error: 'missing_fields' }, 400);
  }
  // Optional: protect with ADMIN_INIT_KEY env var if set
  const initKey = (c.env as Env & { ADMIN_INIT_KEY?: string }).ADMIN_INIT_KEY;
  if (initKey && body.init_key !== initKey) {
    return c.json({ error: 'invalid_init_key' }, 403);
  }
  const existing = await getAdminByUsername(c.env.DB, body.username);
  if (existing) {
    return c.json({ error: 'admin_exists' }, 409);
  }
  const { hash, salt } = await hashPassword(body.password);
  await createAdmin(c.env.DB, { id: randomHex(16), username: body.username, password_hash: hash, salt });
  return c.json({ success: true });
});

export default admin;
