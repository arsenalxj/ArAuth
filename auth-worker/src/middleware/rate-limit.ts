import type { Context, Next } from 'hono';
import type { Env } from '../types';

// Simple in-memory rate limiter per IP (resets on Worker restart / new instance)
// For production, use Cloudflare Durable Objects or KV for distributed rate limiting.
const ipMap = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30;  // per IP per window for auth endpoints

export function rateLimit(c: Context<{ Bindings: Env }>, next: Next) {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
  const now = Date.now();

  let entry = ipMap.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    ipMap.set(ip, entry);
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return c.json(
      { error: 'rate_limited', message: 'Too many requests, please try again later' },
      429,
    );
  }

  return next();
}
