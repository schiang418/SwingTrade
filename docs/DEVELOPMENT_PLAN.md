# SwingTrade — Development Plan

> Derived from:
> - **Golden doc:** [`cyclescope-doc/docs/UNIFIED_AUTH_STRATEGY.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
> - **Local spec:** `docs/SUB_PORTAL_AUTH_IMPLEMENTATION.md`
> - **Discrepancies:** [`cyclescope-doc/docs/CROSS_PROJECT_DISCREPANCIES.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md)
> - **Sister project:** OptionStrategy `docs/DEVELOPMENT_PLAN.md` (branch `claude/option-income-strategy-app-xtFx9`)
>
> Created: 2026-02-21

---

## Status Overview

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Core Features (Stock Ranking, Portfolios, EMA, Automation, Cron) | COMPLETE (pre-existing) |
| 2 | Auth — Dependencies & Configuration | Not started |
| 3 | Auth — Backend Auth Module | Not started |
| 4 | Auth — Server Integration | Not started |
| 5 | Auth — Frontend Auth | Not started |
| 6 | Auth — Validation & Testing | Not started |
| 7 | Staging Environment | Not started |
| 8 | Testing & Hardening | Not started |
| 9 | Production Deploy | Not started |

---

## Phase 1: Core Features — COMPLETE (Pre-existing)

These features were built before this plan was created. Listed for completeness and parity with OptionStrategy's plan.

- Stock swing trade ranking system (scoring, indicators, Polygon.io API)
- Portfolio management (creation, holdings, snapshots, price updates)
- EMA technical analysis (scan results, Gemini AI analysis)
- Automated scanning (EarningsBeats, StockCharts integration)
- Cron jobs (daily workflow Mon-Tue 10AM ET, price updates Mon-Fri 5:15PM ET)
- React frontend (ranking table, portfolio section, EMA analysis, performance comparison)
- Database schema (PostgreSQL via Drizzle ORM)
- Health check endpoint (`/api/health`)

---

## Phase 2: Auth — Dependencies & Configuration

**Goal:** Install packages and set up environment for auth development.

| # | Task | Files Affected |
|---|------|---------------|
| 2.1 | Install `jose` and `cookie-parser` | `package.json` |
| 2.2 | Add auth env vars to `.env.example` | `.env.example` |
| 2.3 | Add `VITE_MEMBER_PORTAL_URL` to frontend env | `.env.example` |
| 2.4 | Add startup validation for required auth env vars | `server/index.js` |

**Auth is always required.** Server fails fast on startup if `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, or `MEMBER_PORTAL_URL` is missing — no dev/prod distinction, no optional mode. Local development must use real (or test) auth secrets.

**Acceptance criteria:**
- `jose` and `cookie-parser` in `dependencies`
- `.env.example` documents all auth vars
- Server refuses to start if any auth env var is missing

---

### Phase 3: Auth — Backend Auth Module

**Goal:** Create `server/auth.js` with handoff verification and session middleware.

| # | Task | Files Affected |
|---|------|---------------|
| 3.1 | Create `server/auth.js` with `handleAuthHandoff` function | `server/auth.js` (new) |
| 3.2 | Implement `requireAuth` middleware in `server/auth.js` | `server/auth.js` |
| 3.3 | Export constants: `SERVICE_ID`, `SESSION_COOKIE_NAME`, `ALLOWED_TIERS` | `server/auth.js` |

**Key specs from golden doc:**
- `SERVICE_ID = 'swingtrade'`
- `SESSION_COOKIE_NAME = 'swingtrade_session'`
- `ALLOWED_TIERS = ['basic', 'stocks_and_options']`
- Handoff token: HS256, verified with `PREMIUM_TOKEN_SECRET`, 5-min expiry
- Local session: HS256, signed with `JWT_SECRET`, 7-day expiry
- Cookie: `httpOnly`, `secure` (prod), `sameSite: 'lax'`, `maxAge: 7d`
- Validate `payload.service === 'swingtrade'` (Discrepancy #14)
- Use `payload.sub` for user ID, not `userId` or `patreonId` (Discrepancy #6)

**Acceptance criteria:**
- `handleAuthHandoff` verifies token, validates service claim + tier, creates session cookie, redirects to `/`
- `requireAuth` reads cookie, verifies JWT, attaches `req.user`, returns 401 on failure
- Error codes are lowercase snake_case (Discrepancy #10)

---

### Phase 4: Auth — Server Integration

**Goal:** Wire auth into the Express server and fix cron job auth conflict.

| # | Task | Files Affected |
|---|------|---------------|
| 4.1 | Add `cookie-parser` middleware | `server/index.js` |
| 4.2 | Restrict CORS to `MEMBER_PORTAL_URL` with `credentials: true` | `server/index.js` |
| 4.3 | Register `GET /auth/handoff` route (before API routes) | `server/index.js` |
| 4.4 | Apply `requireAuth` to all `/api/*` routes (except `/api/health`) | `server/index.js` |
| 4.5 | **Refactor cron jobs to call service functions directly (bypass HTTP/auth)** | `server/index.js` |

**Setup order (from golden doc):**
1. `dotenv` → 2. Validate auth vars → 3. `cookie-parser` + CORS → 4. `/auth/handoff` → 5. `requireAuth` on `/api/*` → 6. Health check (unauthenticated) → 7. Static files

**Cron job refactoring (CRITICAL — learned from OptionStrategy):**
The current cron jobs use internal HTTP calls:
```js
await fetch(`http://localhost:${PORT}/api/automation/daily-workflow`, { method: 'POST' });
await fetch(`http://localhost:${PORT}/api/portfolios/${p.id}/update-prices`, { method: 'POST' });
```
Once `requireAuth` is applied, these will fail with 401 because internal HTTP calls have no session cookie. Must refactor to call the underlying service/route handler functions directly, bypassing the HTTP layer entirely — same pattern OptionStrategy uses.

**Acceptance criteria:**
- CORS restricted to `MEMBER_PORTAL_URL` with `credentials: true`
- `/auth/handoff?token=xxx` is accessible without session
- `/api/health` is accessible without session
- All other `/api/*` routes require valid session cookie
- Cron jobs work correctly with auth enabled (no internal HTTP calls)

---

### Phase 5: Auth — Frontend Auth

**Goal:** Update the React frontend to handle authentication.

| # | Task | Files Affected |
|---|------|---------------|
| 5.1 | Create `apiFetch` wrapper with `credentials: 'include'` | `client/src/api.ts` |
| 5.2 | Add 401 → portal redirect logic | `client/src/api.ts` |
| 5.3 | Update all existing fetch calls to use `apiFetch` | `client/src/api.ts` |
| 5.4 | Add `vite-env.d.ts` for Vite env type declarations | `client/src/vite-env.d.ts` (new) |

**Key specs:**
- All fetch calls must include `credentials: 'include'`
- On 401 response, redirect to `VITE_MEMBER_PORTAL_URL` (or `https://portal.cyclescope.com`)
- Use `import.meta.env.VITE_MEMBER_PORTAL_URL` for portal URL
- `vite-env.d.ts` declares `ImportMetaEnv` with `VITE_MEMBER_PORTAL_URL` (aligned with OptionStrategy)

**Acceptance criteria:**
- Every API call sends cookies cross-origin
- 401 response triggers redirect to portal
- No hardcoded portal URLs (env var driven)
- TypeScript recognizes `import.meta.env.VITE_MEMBER_PORTAL_URL`

---

### Phase 6: Auth — Validation & Testing

**Goal:** End-to-end verification of the complete auth flow.

| # | Task | Details |
|---|------|---------|
| 6.1 | Verify startup validation works (missing vars → server refuses to start) | Remove auth vars, confirm crash |
| 6.2 | Test handoff flow: portal → token → session cookie | Manual or scripted test |
| 6.3 | Test auth middleware: valid cookie → 200, no cookie → 401, expired → 401 | curl or test script |
| 6.4 | Test tier rejection: token with wrong tier → redirect with `error=upgrade_required` | Manual test |
| 6.5 | Test service mismatch: token with `service=option_strategy` → reject | Manual test |
| 6.6 | Test frontend 401 redirect | Browser test |
| 6.7 | Test `/api/health` remains accessible without auth | curl test |
| 6.8 | Verify cron jobs still run correctly after auth is added | Start server with auth, check cron execution |

**Acceptance criteria:**
- Full flow works: portal login → launch → handoff → session → API calls → 401 redirect
- All error scenarios handled per spec
- Cron jobs execute without auth failures

---

---

### Phase 7: Staging Environment

**Reference:** Golden doc Section 17, OptionStrategy Phase 7

| # | Task | Details |
|---|------|---------|
| 7.1 | Create Railway staging service | Separate service from production |
| 7.2 | Configure staging environment variables | Auth secrets for staging portal |
| 7.3 | Set up staging database | Isolated from production |
| 7.4 | Configure staging domain/URL and SSL | HTTPS required for secure cookies |
| 7.5 | Test full authentication flow on staging | End-to-end with staging portal |
| 7.6 | Verify cron jobs, API endpoints, and portfolio features | Full regression |

**Branch strategy (aligned with OptionStrategy):**
- Feature branches → `develop` (staging) → `main` (production)
- Staging deploy triggers on push to `develop`

---

### Phase 8: Testing & Hardening

| # | Task | Details |
|---|------|---------|
| 8.1 | Unit tests for auth module | `server/auth.js` functions |
| 8.2 | API route integration tests | All endpoints with/without auth |
| 8.3 | Utility function tests | Scoring, indicators, trading calendar |
| 8.4 | Edge case testing | Market holidays, timezone, expired sessions |
| 8.5 | Error handling review | Graceful degradation, logging |

---

### Phase 9: Production Deploy

| # | Task | Details |
|---|------|---------|
| 9.1 | Pre-production security audit | No hardcoded secrets, env vars correct |
| 9.2 | Configure production Railway service | Database, env vars, domain, SSL |
| 9.3 | Deploy and verify | Health checks, auth flow, cron jobs |
| 9.4 | Post-deploy monitoring | Error logs, performance, cron execution |

---

## Discrepancy Resolutions (Applied in This Plan)

These resolutions from the cross-project discrepancies report are incorporated:

| # | Discrepancy | Resolution for SwingTrade |
|---|-------------|--------------------------|
| 1 | Tier values | Use `'basic'` and `'stocks_and_options'` only |
| 2 | Token secrets | Per-service: `PREMIUM_TOKEN_SECRET` matches portal's `SWINGTRADE_TOKEN_SECRET` |
| 4 | Cookie name | `swingtrade_session` (not generic `session`) |
| 6 | JWT claims | Use `payload.sub` for user ID, validate `service` claim |
| 7 | Session token claims | Include `sub`, `email`, `tier` |
| 9 | CORS variable | Use `MEMBER_PORTAL_URL` (not `PORTAL_ORIGIN`) |
| 10 | Error casing | Lowercase snake_case: `unauthorized`, `session_expired` |
| 11 | Health check | Exclude `/api/health` from auth middleware |
| 14 | Service ID | `'swingtrade'` — validate in handoff |
| 15 | Tier check | Validate against `ALLOWED_TIERS` at handoff time |

---

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `package.json` | Add `jose`, `cookie-parser` | 2 |
| `.env.example` | Add auth env vars | 2 |
| `server/auth.js` | **New** — handoff + middleware | 3 |
| `server/index.js` | Wire in cookie-parser, CORS, auth routes, middleware, refactor cron | 4 |
| `client/src/api.ts` | Add `apiFetch` wrapper, 401 handling, `credentials: 'include'` | 5 |
| `client/src/vite-env.d.ts` | **New** — Vite env type declarations | 5 |

---

## Risk Notes

- **Cron job refactoring required** — Internal HTTP calls must be replaced with direct function calls before auth goes live. Failure to do this will break automated workflows.
- **Auth is always on** — No optional mode. Local development requires auth secrets (use test values).
- **Env vars must be coordinated with portal deployment** — `PREMIUM_TOKEN_SECRET` must match portal's `SWINGTRADE_TOKEN_SECRET`.
- **Railway proxy** — `secure` cookie flag may need `X-Forwarded-Proto` check instead of `NODE_ENV` check.
- **Promotional access** — Currently both `basic` and `stocks_and_options` tiers are allowed. To restrict later, simply remove `basic` from `ALLOWED_TIERS`.

---

## Cross-Project Alignment Notes

Compared against OptionStrategy `docs/DEVELOPMENT_PLAN.md` (branch `claude/option-income-strategy-app-xtFx9`) on 2026-02-21:

| Area | OptionStrategy | SwingTrade | Aligned |
|------|---------------|------------|---------|
| Auth always required (no optional mode) | No (optional in dev) | Yes | **Diverges** — SwingTrade is stricter |
| Cron jobs bypass HTTP when auth enabled | Yes (refactored) | Yes (planned in 4.5) | Yes |
| `vite-env.d.ts` for Vite types | Yes | Yes (planned in 5.4) | Yes |
| Staging/Testing/Production phases | Phases 7-9 | Phases 7-9 (added) | Yes |
| Auth function naming | `handleAuthCallback` | `handleAuthHandoff` | Minor diff — both valid |
| Backend language | TypeScript (ESM) | JavaScript (CommonJS) | Expected — same pattern |
| Frontend 401 + credentials | `fetchJSON` wrapper | `apiFetch` wrapper | Same pattern |
| Error codes: lowercase snake_case | Yes | Yes | Yes |

---

**Status:** Ready for implementation
**Last updated:** 2026-02-21
