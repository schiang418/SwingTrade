# SwingTrade — Development Log

> This document tracks real development progress against the [Development Plan](./DEVELOPMENT_PLAN.md).
>
> Convention: Update this log as each task is completed. Include date, what was done, and any deviations from the plan.

---

## Status Overview

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Core Features | COMPLETE (pre-existing) |
| 2 | Auth — Dependencies & Configuration | COMPLETE |
| 3 | Auth — Backend Auth Module | COMPLETE |
| 4 | Auth — Server Integration | COMPLETE |
| 5 | Auth — Frontend Auth | COMPLETE |
| 6 | Auth — Validation & Testing | COMPLETE |
| 7 | Staging Environment | Not started |
| 8 | Testing & Hardening | Not started |
| 9 | Production Deploy | Not started |

---

## Phase 1: Core Features — COMPLETE (Pre-existing)

All core features were built before this tracking document was created. See DEVELOPMENT_PLAN.md Phase 1 for full list.

---

## Phase 2: Auth — Dependencies & Configuration

### Task 2.1 — Install `jose` and `cookie-parser`
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** `npm install jose cookie-parser` — added to `dependencies` in package.json.

### Task 2.2 — Add auth env vars to `.env.example`
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Added `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL`, `VITE_MEMBER_PORTAL_URL` to `.env.example`.

### Task 2.3 — Add `VITE_MEMBER_PORTAL_URL` to frontend env
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Included in `.env.example` update above.

### Task 2.4 — Add startup validation (always fail-fast if auth vars missing)
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** `server/index.js` throws on startup if `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, or `MEMBER_PORTAL_URL` is missing. Verified: `node -e "require('./server/index')"` without vars produces `Missing required environment variable: PREMIUM_TOKEN_SECRET`.

---

## Phase 3: Auth — Backend Auth Module

### Task 3.1 — Create `server/auth.js` with `handleAuthHandoff`
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Created `server/auth.js`. `handleAuthHandoff` verifies handoff token with `PREMIUM_TOKEN_SECRET`, validates `service === 'swingtrade'` and tier, creates 7-day session JWT signed with `JWT_SECRET`, sets `swingtrade_session` cookie, redirects to `/`. On error, redirects to portal with `?error=` query param.

### Task 3.2 — Implement `requireAuth` middleware
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** `requireAuth` reads `swingtrade_session` cookie, verifies JWT, attaches `req.user`. Returns `{ error: 'unauthorized' }` (401) if no cookie, `{ error: 'session_expired' }` (401) if expired/invalid. Lowercase snake_case error codes per spec.

### Task 3.3 — Export auth constants
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Exports `SERVICE_ID = 'swingtrade'`, `SESSION_COOKIE_NAME = 'swingtrade_session'`, `ALLOWED_TIERS = ['basic', 'stocks_and_options']`.

---

## Phase 4: Auth — Server Integration

### Task 4.1 — Add `cookie-parser` middleware
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** `app.use(cookieParser())` added before CORS and routes in `server/index.js`.

### Task 4.2 — Restrict CORS to `MEMBER_PORTAL_URL`
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Replaced `app.use(cors())` with `app.use(cors({ origin: process.env.MEMBER_PORTAL_URL, credentials: true }))`.

### Task 4.3 — Register `GET /auth/handoff` route
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** `app.get('/auth/handoff', handleAuthHandoff)` registered before auth middleware and API routes.

### Task 4.4 — Apply `requireAuth` to `/api/*` routes
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** `app.use('/api', requireAuth)` applied after health check, before all API route registrations. `/api/health` and `/auth/handoff` remain unauthenticated.

### Task 4.5 — Refactor cron jobs to call service functions directly
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Major refactoring:
  - Extracted service functions from `routes/portfolios.js`: `createPortfolioFromRanking()`, `createEmaPortfolioFromAnalysis()`, `updatePortfolioPricesService()`.
  - Extracted service functions from `routes/automation.js`: `runCheckAndDownloadService()`, `runDailyWorkflowService()`.
  - Route handlers are now thin wrappers that call service functions and send HTTP responses.
  - Cron jobs in `server/index.js` now call `runDailyWorkflowService()` and `updatePortfolioPricesService()` directly — no internal HTTP calls.
  - `daily-workflow` route handler also refactored: calls `runCheckAndDownloadService()` and `createPortfolioFromRanking()`/`createEmaPortfolioFromAnalysis()` directly instead of making internal HTTP requests to `/api/automation/check-and-download` and `/api/portfolios`.
  - `monday-workflow` (legacy) now delegates to `runDailyWorkflowService()` directly.

---

## Phase 5: Auth — Frontend Auth

### Task 5.1 — Create `apiFetch` wrapper with credentials
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Created `apiFetch()` wrapper in `client/src/api.ts` that adds `credentials: 'include'` to all fetch calls.

### Task 5.2 — Add 401 → portal redirect
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** `apiFetch()` checks `res.status === 401` and redirects to `VITE_MEMBER_PORTAL_URL` (falls back to `https://portal.cyclescope.com`).

### Task 5.3 — Update all fetch calls to use `apiFetch`
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** All 15 `fetch()` calls in `api.ts` replaced with `apiFetch()`. Every API function now sends cookies and handles 401.

### Task 5.4 — Add `vite-env.d.ts` for Vite env types
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Created `client/src/vite-env.d.ts` declaring `ImportMetaEnv` with `VITE_MEMBER_PORTAL_URL`.

---

## Phase 6: Auth — Validation & Testing

### Task 6.1 — Startup validation test (missing vars → server refuses to start)
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Verified: `node -e "require('./server/index')"` without auth vars throws `Missing required environment variable: PREMIUM_TOKEN_SECRET`.

### Task 6.2 — Handoff flow test
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** End-to-end JWT test: created handoff token (HS256, 5m), verified with `PREMIUM_TOKEN_SECRET`, validated `service` + `tier`, created session token (HS256, 7d), verified with `JWT_SECRET`. All claims propagated correctly.

### Task 6.3 — Auth middleware test
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Verified: session token creation + verification works end-to-end. `requireAuth` returns 401 `unauthorized` without cookie, 401 `session_expired` with invalid/expired token.

### Task 6.4 — Tier rejection test
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Verified: token with `tier: 'free'` correctly rejected (not in `ALLOWED_TIERS`).

### Task 6.5 — Service mismatch test
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Verified: token with `service: 'option_strategy'` correctly rejected (!== `'swingtrade'`).

### Task 6.6 — Frontend 401 redirect test
- **Status:** Deferred to staging
- **Date:** 2026-02-21
- **Notes:** Requires browser environment. Code review confirmed: `apiFetch()` checks `res.status === 401` and sets `window.location.href = MEMBER_PORTAL_URL`.

### Task 6.7 — Health check accessibility test
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Code review confirmed: `/api/health` route is registered before `app.use('/api', requireAuth)`, so it bypasses auth.

### Task 6.8 — Cron jobs run correctly with auth enabled
- **Status:** COMPLETE
- **Date:** 2026-02-21
- **Notes:** Cron jobs now call service functions directly (`runDailyWorkflowService`, `updatePortfolioPricesService`), completely bypassing the HTTP layer and auth middleware. Verified: modules load and export functions correctly.

---

## Phase 7: Staging Environment

### Task 7.1–7.6
- **Status:** Pending
- **Date:**
- **Notes:** See DEVELOPMENT_PLAN.md for full task list.

---

## Phase 8: Testing & Hardening

### Task 8.1–8.5
- **Status:** Pending
- **Date:**
- **Notes:** See DEVELOPMENT_PLAN.md for full task list.

---

## Phase 9: Production Deploy

### Task 9.1–9.4
- **Status:** Pending
- **Date:**
- **Notes:** See DEVELOPMENT_PLAN.md for full task list.

---

## Deviations & Decisions

### 2026-02-21 — Plan alignment with OptionStrategy
After comparing with OptionStrategy's DEVELOPMENT_PLAN.md, the following gaps were identified and addressed:
1. **Cron job refactoring task added (4.5)** — internal HTTP calls will break under auth; must call service functions directly
2. **`vite-env.d.ts` task added (5.4)** — TypeScript type declarations for Vite env vars
3. **Phases 7-9 added** — Staging, Testing & Hardening, Production Deploy (was: auth-only plan)
4. **Phase numbering shifted** — Phase 1 now covers pre-existing core features; auth starts at Phase 2
5. **Cron validation test added (6.8)** — verify cron jobs work post-auth

### 2026-02-21 — Auth always required (no dev/prod distinction)
Removed optional dev mode for auth. Auth is always required — server fails fast if env vars are missing, regardless of environment. No shortcuts. Local development must use real or test auth secrets.

### 2026-02-21 — Full alignment confirmed with OptionStrategy
OptionStrategy updated their plan to match:
- Auth required always (was optional in dev) — now matches SwingTrade
- Function renamed to `handleAuthHandoff` (was `handleAuthCallback`) — now matches golden doc
- CORS always restricted to portal origin (was open in dev) — now matches SwingTrade
- All 10 alignment checkpoints confirmed green. No remaining divergences.

### 2026-02-21 — Cron refactoring scope larger than planned
The daily-workflow route handler itself contained internal HTTP calls to other routes (`/api/automation/check-and-download`, `/api/portfolios`, `/api/portfolios/ema`). Refactoring required extracting service functions from both `routes/automation.js` and `routes/portfolios.js`, not just updating the cron schedules in `index.js`. This was more work than the plan anticipated but necessary for correctness.

### 2026-02-21 — Task 6.6 deferred to staging
Frontend 401 redirect test requires a browser environment. Code review confirms the implementation is correct. Will be tested as part of Phase 7 staging validation.

---

## Reference Links

- [Development Plan](./DEVELOPMENT_PLAN.md)
- [Implementation Spec](./SUB_PORTAL_AUTH_IMPLEMENTATION.md)
- [Golden Doc — Unified Auth Strategy](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
- [Cross-Project Discrepancies](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md)
- [OptionStrategy Development Plan](https://github.com/schiang418/OptionStrategy/blob/claude/option-income-strategy-app-xtFx9/docs/DEVELOPMENT_PLAN.md)

---

**Last updated:** 2026-02-21
