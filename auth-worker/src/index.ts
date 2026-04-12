import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { appAuth } from './middleware/app-auth';
import { rateLimit } from './middleware/rate-limit';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin.tsx';

const app = new Hono<{ Bindings: Env }>();

// ── CORS (mobile apps don't need CORS, but keep it for web clients) ──────────
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-App-Key', 'X-App-Secret'],
}));

// ── Rate limit on auth endpoints ─────────────────────────────────────────────
app.use('/api/v1/auth/*', rateLimit);

// ── App authentication for all auth API routes ───────────────────────────────
app.use('/api/v1/auth/*', appAuth);

// ── Auth API routes ───────────────────────────────────────────────────────────
app.route('/api/v1/auth', authRoutes);

// ── Admin routes ──────────────────────────────────────────────────────────────
app.route('/admin', adminRoutes);

// ── Root redirect ─────────────────────────────────────────────────────────────
app.get('/', (c) => c.redirect('/admin/login'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', service: 'ArAuth', version: '1.0.0' }));

export default app;
