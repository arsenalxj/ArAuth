# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
auth-worker/   Cloudflare Worker — auth API + admin dashboard
ar_auth/       Flutter Dart SDK package
docs/DanDan/   Design spec (plan.md, ui-preview.html)
```

## auth-worker Commands

All commands run from `auth-worker/`:

```bash
npm install          # install deps (first time)
npx wrangler dev     # local dev (uses local D1)
npx wrangler deploy  # deploy to production
npx wrangler d1 execute auth-db --remote --file=migrations/0001_initial.sql  # run migration on prod
```

## Architecture

### auth-worker (Hono + Cloudflare D1)

Single Worker serving two concerns:

**Auth API** — `POST /api/v1/auth/*`
- All routes require `X-App-Key` / `X-App-Secret` headers (verified by `middleware/app-auth.ts`)
- Rate limited per IP (`middleware/rate-limit.ts`, in-memory, resets on Worker restart)
- Routes: `register`, `login`, `verify`, `change-password`, `logout`, `delete-account`

**Admin dashboard** — `GET|POST /admin/*`
- Protected by `HttpOnly` cookie `admin_token` (`middleware/admin-auth.ts`)
- Server-side rendered with Hono JSX (files must be `.tsx`)
- CSS/layout mirrors `docs/DanDan/ui-preview.html` exactly — Pico.css CDN + custom overrides in `views/layout.tsx`
- Bootstrap endpoint `POST /admin/bootstrap` creates the first admin (no auth required, but safe: errors if admin already exists)

**Key security patterns:**
- Passwords: PBKDF2-SHA256, 100k iterations, 16-byte random salt (`lib/crypto.ts`)
- JWTs: HMAC-SHA256, 7-day expiry, carry `tv` (token_version) field (`lib/jwt.ts`)
- Token invalidation: bumping `users.token_version` in D1 immediately revokes all JWTs for that user — used on logout and password change
- Brute-force lock: 5 failures → 15-minute lock via `users.locked_until`
- `app_secret` is PBKDF2-hashed in D1, never stored in plaintext

**D1 schema** (3 tables): `apps`, `users`, `admins` — see `migrations/0001_initial.sql`

### ar_auth (Flutter SDK)

`ArAuth` extends `ChangeNotifier` — drop into Provider/Riverpod directly.

- `init()` must be called at startup to restore persisted session
- `login()` / `register()` persist token to `SharedPreferences` via `TokenStorage`
- `changePassword()` and `logout()` hit the server then clear local state
- All HTTP errors are mapped to typed exceptions in `src/exceptions.dart`

## Secrets

- `JWT_SECRET` — stored in Cloudflare Secrets (`wrangler secret put JWT_SECRET`), never in code
- `ADMIN_INIT_KEY` — optional; if set, bootstrap endpoint requires it
- D1 database ID: `eddb61a7-40e7-4f7c-a9ab-b17ae20db0db` (in `wrangler.toml`)

## Deployment

Live URL: `https://auth-worker.arsenalxj.workers.dev`
Admin: `/admin/login` → account `arsenalxj`
