# SwingTrade Authentication — Development Plan

> Derived from:
> - **Golden doc:** [`cyclescope-doc/docs/UNIFIED_AUTH_STRATEGY.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
> - **Local spec:** `docs/SUB_PORTAL_AUTH_IMPLEMENTATION.md`
> - **Discrepancies:** [`cyclescope-doc/docs/CROSS_PROJECT_DISCREPANCIES.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md)
>
> Created: 2026-02-21

---

## Current State Summary

| Area | Status |
|------|--------|
| Auth dependencies (`jose`, `cookie-parser`) | Not installed |
| Auth env vars (`PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL`) | Not configured |
| CORS | Wide open (`app.use(cors())`) |
| Handoff endpoint (`GET /auth/handoff`) | Not implemented |
| Auth middleware (`requireAuth`) | Not implemented |
| Frontend credentials / 401 handling | Not implemented |
| Health check | Exists at `/api/health`, needs auth exclusion |

**Backend:** CommonJS JavaScript (Express)
**Frontend:** TypeScript (React + Vite)

---

## Development Phases

### Phase 1: Dependencies & Configuration

**Goal:** Install packages and set up environment for auth development.

| # | Task | Files Affected |
|---|------|---------------|
| 1.1 | Install `jose` and `cookie-parser` | `package.json` |
| 1.2 | Add auth env vars to `.env.example` | `.env.example` |
| 1.3 | Add `VITE_MEMBER_PORTAL_URL` to frontend env | `.env.example` |
| 1.4 | Add startup validation for required auth env vars | `server/index.js` |

**Acceptance criteria:**
- `jose` and `cookie-parser` in `dependencies`
- `.env.example` documents all auth vars
- Server fails fast with clear error if auth vars are missing

---

### Phase 2: Backend Auth Module

**Goal:** Create `server/auth.js` with handoff verification and session middleware.

| # | Task | Files Affected |
|---|------|---------------|
| 2.1 | Create `server/auth.js` with `handleAuthHandoff` function | `server/auth.js` (new) |
| 2.2 | Implement `requireAuth` middleware in `server/auth.js` | `server/auth.js` |
| 2.3 | Export constants: `SERVICE_ID`, `SESSION_COOKIE_NAME`, `ALLOWED_TIERS` | `server/auth.js` |

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

### Phase 3: Server Integration

**Goal:** Wire auth into the Express server.

| # | Task | Files Affected |
|---|------|---------------|
| 3.1 | Add `cookie-parser` middleware | `server/index.js` |
| 3.2 | Restrict CORS to `MEMBER_PORTAL_URL` with `credentials: true` | `server/index.js` |
| 3.3 | Register `GET /auth/handoff` route (before API routes) | `server/index.js` |
| 3.4 | Apply `requireAuth` to all `/api/*` routes (except `/api/health`) | `server/index.js` |

**Setup order (from golden doc):**
1. `dotenv` → 2. Validate auth vars → 3. `cookie-parser` + CORS → 4. `/auth/handoff` → 5. `requireAuth` on `/api/*` → 6. Health check (unauthenticated) → 7. Static files

**Acceptance criteria:**
- CORS only allows `MEMBER_PORTAL_URL` origin
- `/auth/handoff?token=xxx` is accessible without session
- `/api/health` is accessible without session
- All other `/api/*` routes require valid session cookie

---

### Phase 4: Frontend Auth

**Goal:** Update the React frontend to handle authentication.

| # | Task | Files Affected |
|---|------|---------------|
| 4.1 | Create `apiFetch` wrapper with `credentials: 'include'` | `client/src/api.ts` |
| 4.2 | Add 401 → portal redirect logic | `client/src/api.ts` |
| 4.3 | Update all existing fetch calls to use `apiFetch` | `client/src/api.ts` |

**Key specs:**
- All fetch calls must include `credentials: 'include'`
- On 401 response, redirect to `VITE_MEMBER_PORTAL_URL` (or `https://portal.cyclescope.com`)
- Use `import.meta.env.VITE_MEMBER_PORTAL_URL` for portal URL

**Acceptance criteria:**
- Every API call sends cookies cross-origin
- 401 response triggers redirect to portal
- No hardcoded portal URLs (env var driven)

---

### Phase 5: Validation & Testing

**Goal:** End-to-end verification of the complete auth flow.

| # | Task | Details |
|---|------|---------|
| 5.1 | Verify startup validation works (missing vars → crash) | Remove auth vars, confirm error |
| 5.2 | Test handoff flow: portal → token → session cookie | Manual or scripted test |
| 5.3 | Test auth middleware: valid cookie → 200, no cookie → 401, expired → 401 | curl or test script |
| 5.4 | Test tier rejection: token with wrong tier → redirect with `error=upgrade_required` | Manual test |
| 5.5 | Test service mismatch: token with `service=option_strategy` → reject | Manual test |
| 5.6 | Test frontend 401 redirect | Browser test |
| 5.7 | Test `/api/health` remains accessible without auth | curl test |

**Acceptance criteria:**
- Full flow works: portal login → launch → handoff → session → API calls → 401 redirect
- All error scenarios handled per spec

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
| `package.json` | Add `jose`, `cookie-parser` | 1 |
| `.env.example` | Add auth env vars | 1 |
| `server/auth.js` | **New** — handoff + middleware | 2 |
| `server/index.js` | Wire in cookie-parser, CORS, auth routes, middleware | 3 |
| `client/src/api.ts` | Add `apiFetch` wrapper, 401 handling, `credentials: 'include'` | 4 |

---

## Risk Notes

- **No breaking changes to existing functionality** — auth is additive. Existing API routes continue to work; `requireAuth` middleware is the only gate.
- **Env vars must be coordinated with portal deployment** — `PREMIUM_TOKEN_SECRET` must match portal's `SWINGTRADE_TOKEN_SECRET`.
- **Railway proxy** — `secure` cookie flag may need `X-Forwarded-Proto` check instead of `NODE_ENV` check.
- **Promotional access** — Currently both `basic` and `stocks_and_options` tiers are allowed. To restrict later, simply remove `basic` from `ALLOWED_TIERS`.

---

**Status:** Ready for implementation
**Last updated:** 2026-02-21
