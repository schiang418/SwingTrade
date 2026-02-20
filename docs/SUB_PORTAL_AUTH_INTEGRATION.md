# SwingTrade — Sub-Portal Authentication Integration

> **SwingTrade-specific** implementation plan for the CycleScope premium service authentication flow.
>
> **Authoritative spec**: [`cyclescope-doc/docs/UNIFIED_AUTH_STRATEGY.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
>
> This document covers **Phase 4** of the unified strategy — the sub-portal side only.
> Phases 1–3 (Portal DB migration, tier mapping, launch endpoints) are prerequisites owned by the Member Portal.
>
> Last updated: 2026-02-20

---

## 1. Current State Assessment

### What Exists

| Component | Status | Details |
|-----------|--------|---------|
| Express server | Exists | `server/index.js` — Express 4.18.2 |
| API routes | Exists | 5 route modules under `/api/*` |
| Health check | Exists | `GET /api/health` |
| CORS | Misconfigured | `app.use(cors())` — allows all origins |
| Frontend | Exists | Vite + React 18 + TypeScript (`client/src/`) |
| API wrapper | Exists | `client/src/api.ts` — 14 fetch functions, no auth handling |
| `jose` package | **Missing** | Not in `package.json` |
| `cookie-parser` package | **Missing** | Not in `package.json` |
| Auth endpoint | **Missing** | No `/auth/handoff` route |
| Auth middleware | **Missing** | All API routes are unprotected |
| Session cookies | **Missing** | No cookie handling |
| Auth env vars | **Missing** | Not in `.env.example` |

### What Needs to Be Built

All auth components are **greenfield** — no existing auth code to refactor.

---

## 2. Architecture Role

SwingTrade is an **enforcer** in the CycleScope auth model. It does not handle user registration, passwords, or Patreon integration.

```
┌────────────────────────┐     5-min JWT handoff     ┌──────────────────┐
│  CycleScope Member     │──────────────────────────►│  SwingTrade      │
│  Portal                │                           │                  │
│  - authenticates users │     redirect on 401       │  - verifies JWT  │
│  - manages tiers       │◄──────────────────────────│  - local session │
│  - issues tokens       │                           │  - enforces tier │
└────────────────────────┘                           └──────────────────┘
```

**Flow**: Portal login → user clicks "SwingTrade" → Portal issues 5-min JWT → browser redirects to `GET /auth/handoff?token=xxx` → SwingTrade verifies → sets 7-day session cookie → user browses freely.

---

## 3. Constants & Configuration

### 3.1 Service Identity

```js
// server/auth.js
const SERVICE_ID = 'swingtrade';
const SESSION_COOKIE_NAME = 'swingtrade_session';
```

### 3.2 Allowed Tiers

Tier-to-service access is a **business decision**, not an architectural constraint. This constant controls which tiers can access SwingTrade. Update it without any DB migration.

```js
// server/auth.js

// Current: Promotional period — all tiers get access
const ALLOWED_TIERS = ['basic', 'stocks_and_options'];

// Future: Restrict to premium only (one-line change)
// const ALLOWED_TIERS = ['stocks_and_options'];
```

> **Reference**: Unified strategy Section 2 — "Tier Check Constants (Sub-Portals)"

### 3.3 Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `PREMIUM_TOKEN_SECRET` | Verify handoff JWTs from Portal. **Must match** Portal's `SWINGTRADE_TOKEN_SECRET` | `openssl rand -base64 32` |
| `JWT_SECRET` | Sign local 7-day session cookies. **Unique to SwingTrade** — never shared | `openssl rand -base64 32` |
| `MEMBER_PORTAL_URL` | Portal URL for CORS origin + redirect on auth failure | `https://portal.cyclescope.com` |
| `VITE_MEMBER_PORTAL_URL` | Frontend — portal redirect target (Vite injects at build time) | `https://portal.cyclescope.com` |

> **Critical**: `PREMIUM_TOKEN_SECRET` and `JWT_SECRET` must be different values. Compromise of one must not affect the other.

---

## 4. Backend Implementation

### 4.1 New Dependencies

```
npm install jose cookie-parser
```

> **Reference**: Unified strategy Section 16 — "Dependencies"

### 4.2 Auth Module — `server/auth.js`

Single file containing the handoff endpoint, middleware, and constants.

```js
const { jwtVerify, SignJWT } = require('jose');

// ── Constants ──
const SERVICE_ID = 'swingtrade';
const SESSION_COOKIE_NAME = 'swingtrade_session';
const ALLOWED_TIERS = ['basic', 'stocks_and_options'];

// ── GET /auth/handoff?token=xxx ──
async function handleAuthHandoff(req, res) {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=missing_token`);
  }

  try {
    // 1. Verify handoff token from Portal
    const premiumSecret = new TextEncoder().encode(process.env.PREMIUM_TOKEN_SECRET);
    const { payload } = await jwtVerify(token, premiumSecret);

    // 2. Validate service claim
    if (payload.service && payload.service !== SERVICE_ID) {
      return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=invalid_service`);
    }

    // 3. Check tier authorization
    if (!ALLOWED_TIERS.includes(payload.tier)) {
      return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=upgrade_required`);
    }

    // 4. Create local 7-day session token
    const sessionSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    const sessionToken = await new SignJWT({
      email: payload.email,
      tier: payload.tier,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(sessionSecret);

    // 5. Set session cookie
    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 6. Redirect to app root
    return res.redirect('/');
  } catch (err) {
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=invalid_token`);
  }
}

// ── requireAuth middleware ──
async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    req.user = payload; // { sub, email, tier, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: 'session_expired' });
  }
}

module.exports = { handleAuthHandoff, requireAuth, SESSION_COOKIE_NAME };
```

> **Reference**: Unified strategy Section 8.1, 8.2

### 4.3 Server Integration — `server/index.js` Changes

```js
// ── New imports ──
const cookieParser = require('cookie-parser');
const { handleAuthHandoff, requireAuth } = require('./auth');

// ── Middleware (add BEFORE routes) ──
app.use(cookieParser());
app.use(cors({
  origin: process.env.MEMBER_PORTAL_URL,
  credentials: true,
}));

// ── Auth handoff route (no auth required) ──
app.get('/auth/handoff', handleAuthHandoff);

// ── Health check (BEFORE auth middleware — must be unauthenticated) ──
app.get('/api/health', (req, res) => { /* existing handler */ });

// ── Auth middleware on all /api routes (AFTER health check) ──
app.use('/api', requireAuth);

// ── Existing routes (now protected) ──
app.use('/api', analysisRouter);
app.use('/api/rankings', rankingsRouter);
// ... etc
```

### 4.4 Env Var Validation on Startup

```js
// server/index.js — inside start()
const REQUIRED_AUTH_VARS = ['JWT_SECRET', 'PREMIUM_TOKEN_SECRET', 'MEMBER_PORTAL_URL'];
for (const varName of REQUIRED_AUTH_VARS) {
  if (!process.env[varName]) {
    console.warn(`Warning: Missing auth env var: ${varName} — auth will not work`);
  }
}
```

> **Note**: Warn, don't crash — allows existing non-auth workflows (cron jobs, automation) to keep running during rollout.

### 4.5 Automation Routes — Internal Calls

Cron jobs in `server/index.js` call the API via `http://localhost:${PORT}/api/...`. These internal calls won't have a session cookie.

**Options** (pick one during implementation):
1. **Skip auth for localhost** — check `req.ip === '127.0.0.1'` in middleware
2. **Exempt automation routes** — mount `/api/automation` before the auth middleware
3. **Use an internal API key** — add `X-Internal-Key` header to cron calls

Recommended: **Option 2** — simplest, and automation endpoints don't expose user data.

---

## 5. Frontend Implementation

### 5.1 API Wrapper with Auth — `client/src/api.ts`

Add a shared `apiFetch` function that handles credentials and 401 redirects.

```ts
const MEMBER_PORTAL_URL = import.meta.env.VITE_MEMBER_PORTAL_URL
  || 'https://portal.cyclescope.com';

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include', // MUST include cookies
  });

  if (res.status === 401) {
    window.location.href = MEMBER_PORTAL_URL;
    throw new Error('Session expired');
  }

  return res;
}
```

Then update all existing fetch calls to use `apiFetch` instead of `fetch`.

> **Reference**: Unified strategy Section 11

### 5.2 Scope of Changes in `client/src/api.ts`

Every exported function currently uses bare `fetch()`. Each needs two changes:
1. Replace `fetch(url, ...)` with `apiFetch(url, ...)`
2. This automatically adds `credentials: 'include'` and 401 handling

**Functions to update** (14 total):
- `fetchRanking`, `fetchDates`, `fetchPortfolio`, `createPortfolio`
- `updatePortfolioPrices`, `triggerCheckAndDownload`, `triggerForceAnalysis`
- `fetchAutomationStatus`, `fetchEmaAnalysis`, `fetchEmaDates`
- `createEmaPortfolio`, `fetchPortfolioComparison`, `uploadAndAnalyze`

---

## 6. JWT Token Specs (Quick Reference)

### 6.1 Handoff Token (Portal → SwingTrade)

Received at `GET /auth/handoff?token=xxx`. SwingTrade **verifies** this, never generates it.

```
{
  sub: "<userId>",         // User ID (JWT standard claim)
  email: "<email>",
  tier: "basic" | "stocks_and_options",
  service: "swingtrade",   // Must match SERVICE_ID
  iat: <timestamp>,
  exp: <timestamp>         // 5 minutes from issue
}
```

Signed with: Portal's `SWINGTRADE_TOKEN_SECRET` = SwingTrade's `PREMIUM_TOKEN_SECRET`

### 6.2 Local Session Token (SwingTrade internal)

Created after successful handoff. Stored in `swingtrade_session` cookie.

```
{
  sub: "<userId>",         // From handoff token's sub
  email: "<email>",
  tier: "basic" | "stocks_and_options",
  iat: <timestamp>,
  exp: <timestamp>         // 7 days from issue
}
```

Signed with: SwingTrade's own `JWT_SECRET`

---

## 7. Error Response Format

### 7.1 API Errors (middleware)

```js
// No cookie
res.status(401).json({ error: 'unauthorized' });

// Expired/invalid session
res.status(401).json({ error: 'session_expired' });
```

### 7.2 Handoff Redirect Errors

| Redirect Query Param | Meaning |
|----------------------|---------|
| `?error=missing_token` | No token in request |
| `?error=invalid_token` | JWT verification failed (expired, bad signature) |
| `?error=invalid_service` | Token's `service` claim is not `swingtrade` |
| `?error=upgrade_required` | User's tier not in `ALLOWED_TIERS` |

> **Reference**: Unified strategy Section 14

---

## 8. Cookie Specification

| Property | Value |
|----------|-------|
| Name | `swingtrade_session` |
| `httpOnly` | `true` |
| `secure` | `true` in production |
| `sameSite` | `lax` |
| `path` | `/` |
| `maxAge` | 7 days (604800000 ms) |

> **Reference**: Unified strategy Section 6

---

## 9. CORS Configuration

```js
app.use(cors({
  origin: process.env.MEMBER_PORTAL_URL,
  credentials: true,
}));
```

`MEMBER_PORTAL_URL` serves double duty: CORS origin + redirect target. No separate `PORTAL_ORIGIN` variable needed.

> **Reference**: Unified strategy Section 9

---

## 10. Files Changed Summary

| File | Type | Change |
|------|------|--------|
| `package.json` | Modify | Add `jose`, `cookie-parser` |
| `server/auth.js` | **New** | `handleAuthHandoff`, `requireAuth`, constants |
| `server/index.js` | Modify | Add `cookie-parser`, lock CORS, mount auth route + middleware, add env validation |
| `client/src/api.ts` | Modify | Add `apiFetch` wrapper, update all 14 fetch functions |
| `.env.example` | Modify | Add `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL`, `VITE_MEMBER_PORTAL_URL` |

**Estimated: ~5 files, ~150 lines of new code.**

---

## 11. Environment Setup

### `.env.example` additions

```env
# ── Auth (CycleScope Portal Integration) ──
# Shared secret — MUST match portal's SWINGTRADE_TOKEN_SECRET
PREMIUM_TOKEN_SECRET=<generate: openssl rand -base64 32>
# SwingTrade's own session secret — NOT shared with any other service
JWT_SECRET=<generate: openssl rand -base64 32>
# Portal URL — used for CORS origin and auth failure redirects
MEMBER_PORTAL_URL=https://portal.cyclescope.com
# Frontend portal URL (Vite injects at build time)
VITE_MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

---

## 12. Prerequisites (Portal Phases 1–3)

SwingTrade auth code can be **written and merged now**, but the full flow requires:

| Phase | Portal Work | Status |
|-------|------------|--------|
| 1 | DB migration: `tier` enum + `patreonTier` columns | Pending |
| 2 | `mapPatreonTierNameToAccess()`, JWT updates, login flow | Pending |
| 3 | `POST /api/launch/swingtrade`, per-service secrets, env vars | Pending |
| **4** | **SwingTrade auth (this document)** | **Ready to implement** |

### Testing Before Portal Is Ready

Generate a test handoff token manually:

```js
const { SignJWT } = require('jose');
const secret = new TextEncoder().encode('test-secret-at-least-32-chars!!');
const token = await new SignJWT({
  email: 'test@example.com',
  tier: 'basic',
  service: 'swingtrade',
})
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('1')
  .setIssuedAt()
  .setExpirationTime('5m')
  .sign(secret);

console.log(`http://localhost:3000/auth/handoff?token=${token}`);
```

Set `PREMIUM_TOKEN_SECRET=test-secret-at-least-32-chars!!` in `.env` to test locally.

---

## 13. Implementation Checklist

- [ ] Install `jose` and `cookie-parser`
- [ ] Create `server/auth.js` — handoff endpoint, requireAuth middleware, constants
- [ ] Update `server/index.js` — cookie-parser, CORS lockdown, mount auth route + middleware
- [ ] Decide automation route auth strategy (exempt `/api/automation` or localhost bypass)
- [ ] Update `client/src/api.ts` — `apiFetch` wrapper with `credentials: 'include'` and 401 redirect
- [ ] Update `.env.example` — add auth env vars
- [ ] Set env vars in Railway: `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL`, `VITE_MEMBER_PORTAL_URL`
- [ ] End-to-end test: handoff → session → API calls → 401 redirect

---

*This document aligns to [UNIFIED_AUTH_STRATEGY.md](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md) (2026-02-20). If the unified strategy changes, update this document accordingly.*
