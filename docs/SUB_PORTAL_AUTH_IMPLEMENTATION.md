# Sub-Portal Authentication Implementation Strategy

> **Canonical source of truth:** [`cyclescope-doc/docs/UNIFIED_AUTH_STRATEGY.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
>
> This document is derived from the unified strategy. If anything here conflicts, the unified strategy wins.
>
> Both OptionStrategy and SwingTrade MUST follow this spec identically (differing only in service-specific constants).
>
> Last updated: 2026-02-20

---

## 1. Architecture Overview

The authentication flow follows these steps:

1. User clicks "Launch [Service]" in Member Portal
2. Portal verifies session and tier access
3. Portal generates 5-minute handoff JWT signed with per-service secret
4. Browser redirects to sub-portal with token in URL
5. Sub-portal verifies handoff token, validates service claim matches, checks tier authorization
6. Sub-portal creates local 7-day session JWT and sets httpOnly cookie
7. All subsequent API calls include session cookie
8. RequireAuth middleware validates cookie on every `/api/*` request (except `/api/health`)

**Key principles:** Sub-portals never handle passwords, signup, or OAuth. All user authentication UI lives exclusively in the Member Portal. Patreon serves only as a subscription data source managed by the Portal.

---

## 2. Service-Specific Constants

Each sub-portal uses identical implementation patterns with different constants:

| Constant | OptionStrategy | SwingTrade |
|----------|----------------|-----------|
| `SERVICE_ID` | `'option_strategy'` | `'swingtrade'` |
| `SESSION_COOKIE_NAME` | `'option_strategy_session'` | `'swingtrade_session'` |
| `ALLOWED_TIERS` | `['basic', 'stocks_and_options']` | `['basic', 'stocks_and_options']` |
| Portal secret name | `OPTION_STRATEGY_TOKEN_SECRET` | `SWINGTRADE_TOKEN_SECRET` |
| Local env var | `PREMIUM_TOKEN_SECRET` | `PREMIUM_TOKEN_SECRET` |
| Launch endpoint | `POST /api/launch/option-strategy` | `POST /api/launch/swingtrade` |

---

## 3. Subscription Tiers (Canonical)

Only two tier values exist system-wide:

| Tier | Description |
|------|-------------|
| `'basic'` | Default for all portal users |
| `'stocks_and_options'` | Premium tier from Patreon subscription |

Note: `'free'`, `'premium'`, and `'stocks'` tiers are deprecated. Patreon tier mapping (portal-side only): Basic → `'basic'`; Premium/Stocks + Options → `'stocks_and_options'`; unmapped/null → `'basic'` (default).

Current business policy grants promotional access to basic members. Restrict access later by removing `'basic'` from `ALLOWED_TIERS` — no code or DB changes needed.

---

## 4. Dependencies

```bash
npm install jose cookie-parser
```

| Package | Purpose |
|---------|---------|
| `jose` | JWT signing and verification (HS256) |
| `cookie-parser` | Parse cookies from requests |

> **OptionStrategy** (TypeScript) additionally requires: `npm install -D @types/cookie-parser`
>
> **SwingTrade** (CommonJS JavaScript) does not need type packages.

---

## 5. Environment Variables

### Backend (.env)

```env
# Handoff token verification — MUST match portal's per-service secret
# SwingTrade: must match portal's SWINGTRADE_TOKEN_SECRET
# OptionStrategy: must match portal's OPTION_STRATEGY_TOKEN_SECRET
PREMIUM_TOKEN_SECRET=<per-service-secret>

# Local session signing — unique to this service, never shared
JWT_SECRET=<generate: openssl rand -base64 32>

# Portal URL for redirects and CORS
MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

### Frontend (.env)

```env
VITE_MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

**Critical rules:**
- Each sub-portal's `PREMIUM_TOKEN_SECRET` matches a different portal secret (per-service isolation). Compromise of one sub-portal doesn't affect the other.
- Each sub-portal has its own unique `JWT_SECRET` never shared between services.
- `PREMIUM_TOKEN_SECRET` and `JWT_SECRET` MUST be different values — compromise of the handoff secret should not compromise local sessions.

### Startup Validation

Services must fail fast if required auth vars are missing:

```js
const REQUIRED_AUTH_VARS = ['PREMIUM_TOKEN_SECRET', 'JWT_SECRET', 'MEMBER_PORTAL_URL'];

for (const varName of REQUIRED_AUTH_VARS) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
```

---

## 6. JWT Specifications

### 6.1 Handoff Token (Portal → Sub-Portal)

Issued by Member Portal, verified by sub-portal.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Secret | Per-service (`SWINGTRADE_TOKEN_SECRET` or `OPTION_STRATEGY_TOKEN_SECRET`) |
| Expiration | 5 minutes |

**Canonical payload:**

```json
{
  "sub": "<userId>",
  "email": "<user email>",
  "tier": "basic | stocks_and_options",
  "service": "swingtrade | option_strategy",
  "iat": 1234567890,
  "exp": 1234568190
}
```

**Important:** The `sub` claim is set via `.setSubject()` — not as a payload field. Don't expect `userId` or `patreonId`; use `payload.sub` for identification.

### 6.2 Local Session Token (Sub-Portal)

Created by sub-portal after successful handoff, stored as httpOnly cookie.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Secret | Sub-portal's own `JWT_SECRET` |
| Expiration | 7 days |

**Canonical payload:**

```json
{
  "sub": "<userId from handoff>",
  "email": "<email from handoff>",
  "tier": "basic | stocks_and_options",
  "iat": 1234567890,
  "exp": 1235172690
}
```

**Important:** Use `.setSubject(payload.sub)` — do NOT put user ID in payload body.

---

## 7. Cookie Specifications

| Property | Value |
|----------|-------|
| Name | `swingtrade_session` or `option_strategy_session` |
| `httpOnly` | `true` (prevents XSS JavaScript access) |
| `secure` | `true` in production (HTTPS only) |
| `sameSite` | `'lax'` (CSRF protection) |
| `path` | `'/'` |
| `maxAge` | 7 days (604800000 milliseconds) |

**Railway note:** Behind Railway proxy, the `secure` flag may need to check `X-Forwarded-Proto` header instead of just `NODE_ENV`.

---

## 8. Implementation

### 8.1 Token Exchange Endpoint

**Route:** `GET /auth/handoff?token=xxx`

```js
// Sub-Portal: server/auth.js (SwingTrade) or server/auth.ts (OptionStrategy)

const { jwtVerify, SignJWT } = require('jose');  // SwingTrade (CommonJS)
// import { jwtVerify, SignJWT } from 'jose';    // OptionStrategy (ESM/TS)

const SERVICE_ID = 'swingtrade';                           // or 'option_strategy'
const SESSION_COOKIE_NAME = 'swingtrade_session';          // or 'option_strategy_session'
const ALLOWED_TIERS = ['basic', 'stocks_and_options'];

async function handleAuthHandoff(req, res) {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=missing_token`);
  }

  try {
    // 1. Verify handoff token from Member Portal
    const premiumSecret = new TextEncoder().encode(process.env.PREMIUM_TOKEN_SECRET);
    const { payload } = await jwtVerify(token, premiumSecret);

    // 2. Validate the token is intended for this service
    if (payload.service && payload.service !== SERVICE_ID) {
      console.error(`[Auth] Token service mismatch: expected ${SERVICE_ID}, got ${payload.service}`);
      return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=invalid_service`);
    }

    // 3. Check tier authorization
    if (!ALLOWED_TIERS.includes(payload.tier)) {
      return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=upgrade_required`);
    }

    // 4. Create local session token
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

  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=invalid_token`);
  }
}
```

### 8.2 Auth Middleware

**Applies to:** All `/api/*` routes except `/api/health`

```js
async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    req.user = payload;  // { sub, email, tier, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: 'session_expired' });
  }
}

// Mount in Express app
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  return requireAuth(req, res, next);
});
```

### 8.3 CORS Configuration

Configure CORS to accept requests from the Member Portal URL only, allowing credentials (cookies) in cross-origin requests:

```js
const cors = require('cors');

app.use(cors({
  origin: process.env.MEMBER_PORTAL_URL,
  credentials: true,
}));
```

### 8.4 Server Setup Order

1. Load environment variables (dotenv)
2. Validate required auth vars exist
3. Initialize middleware (cookie-parser, CORS)
4. Register auth endpoints (`GET /auth/handoff`)
5. Register API routes with `requireAuth` middleware
6. Register health endpoint (unauthenticated)

### 8.5 Frontend 401 Handling

When API calls return 401, redirect to the portal:

```typescript
// client/src/api.ts — wrap fetch calls

const MEMBER_PORTAL_URL = import.meta.env.VITE_MEMBER_PORTAL_URL
  || 'https://portal.cyclescope.com';

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',  // MUST include cookies
  });

  if (res.status === 401) {
    window.location.href = MEMBER_PORTAL_URL;
    throw new Error('Session expired');
  }

  return res;
}
```

---

## 9. Error Handling

### Sub-Portal API Errors

Return 401 with JSON: `{ error: 'unauthorized' }` or `{ error: 'session_expired' }`

### Auth Redirect Error Parameters

Portal redirects include error query parameters:
- `error=missing_token` — No token in URL
- `error=invalid_token` — Token verification failed
- `error=invalid_service` — Service claim doesn't match sub-portal
- `error=upgrade_required` — Tier not in ALLOWED_TIERS

---

## 10. What Sub-Portals Do NOT Implement

- Password handling or reset flows
- User signup or registration
- OAuth authentication
- Patreon API integration
- Subscription management
- Password validation

All these functions remain exclusively in the Member Portal.

---

## 11. Security Summary

**Token isolation:** Each service uses a unique per-service secret for handoff tokens and a separate JWT_SECRET for session tokens. Compromising one service doesn't expose others.

**Defense in depth:** Sub-portals verify service claim matches their own SERVICE_ID AND check tier authorization independently.

**Session security:** Sessions use httpOnly, secure, and sameSite cookies. Token expiration is enforced (5 min handoff, 7 day session).

**CORS protection:** Only Member Portal origin can access sub-portal APIs with credentials.

---

## 12. Tier Propagation & Revocation

The Member Portal generates handoff tokens reflecting current user tier from Patreon. If tier changes (upgrade/downgrade), the user must re-launch from the portal to receive updated handoff token with new tier. Existing sessions continue with old tier until expiration (7 days) or manual logout.

---

## 13. Implementation Phases

### Phase 1: Dependencies & Config
Install `jose` and `cookie-parser`; set environment variables.

### Phase 2: Backend Auth
Implement token exchange endpoint, auth middleware, and CORS configuration.

### Phase 3: Frontend Auth
Add 401 redirect handler; integrate session management in API client.

### Phase 4: Validation
Test handoff flow, verify tier checks, validate error scenarios.

---

## 14. Staging & Deployment

### Branch Strategy
Feature branches merge to `develop` (staging); `develop` merges to `main` (production).

### Staging Environment
Deploy to staging URLs with test Member Portal for integration testing before production.

### Staging Env Vars
Use staging portal URL and per-service staging secrets for testing.

---

## 15. Current Implementation Status

### SwingTrade — Code Audit (2026-02-20)

| Requirement | Status | Location | Notes |
|-------------|--------|----------|-------|
| `jose` dependency | **Missing** | `package.json` | Not installed |
| `cookie-parser` dependency | **Missing** | `package.json` | Not installed |
| `PREMIUM_TOKEN_SECRET` env var | **Missing** | `.env` | Not set |
| `JWT_SECRET` env var | **Missing** | `.env` | Not set |
| `MEMBER_PORTAL_URL` env var | **Missing** | `.env` | Not set |
| `VITE_MEMBER_PORTAL_URL` env var | **Missing** | `.env` | Not set |
| CORS locked to portal | **Open** | `server/index.js:12` | `app.use(cors())` — allows all origins |
| `GET /auth/handoff` endpoint | **Missing** | — | Not implemented |
| `requireAuth` middleware | **Missing** | — | Not implemented |
| `/api/health` excluded from auth | **Ready** | `server/index.js:34` | Health check exists, just needs exclusion |
| Frontend `credentials: 'include'` | **Missing** | `client/src/api.ts` | All fetch calls lack credentials |
| Frontend 401 → portal redirect | **Missing** | `client/src/api.ts` | No 401 handling |
| Startup env var validation | **Missing** | `server/index.js` | No auth var validation |

**Backend language:** CommonJS JavaScript (`require()`) — code examples use CommonJS syntax.

**Frontend language:** TypeScript (Vite + React) — frontend examples use TypeScript.

### OptionStrategy — Code Audit (2026-02-20)

| Requirement | Status | Notes |
|-------------|--------|-------|
| `jose` dependency | **Missing** | Not installed |
| `cookie-parser` dependency | **Missing** | Not installed |
| Auth endpoint | **Missing** | Not implemented |
| `requireAuth` middleware | **Missing** | Not implemented |
| CORS locked to portal | **Open** | `app.use(cors())` — allows all origins |
| Frontend 401 handling | **Missing** | No 401 handling |

**Backend language:** TypeScript (ESM) — code examples use ESM `import` syntax.

**Neither project has implemented any auth features yet.** Implementation is entirely greenfield for both.

---

## 16. Implementation Checklist (SwingTrade)

- [ ] Install `jose` and `cookie-parser`
- [ ] Add `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL` to `.env`
- [ ] Add `VITE_MEMBER_PORTAL_URL` to frontend `.env`
- [ ] Create `server/auth.js` with `handleAuthHandoff` and `requireAuth`
- [ ] Add `cookie-parser` middleware to `server/index.js`
- [ ] Restrict CORS to `MEMBER_PORTAL_URL` with `credentials: true`
- [ ] Register `GET /auth/handoff` route (before API routes)
- [ ] Apply `requireAuth` to all `/api/*` routes (except `/api/health`)
- [ ] Add startup validation for required auth env vars
- [ ] Add `credentials: 'include'` to all frontend fetch calls
- [ ] Add frontend 401 redirect handler (`client/src/api.ts`)
- [ ] Test end-to-end: portal login → launch → handoff → session → API calls → 401 redirect

---

## 17. Discrepancies Resolved

This specification replaces conflicting implementations. Both OptionStrategy and SwingTrade agents must follow this canonical spec. See [`cyclescope-doc/docs/CROSS_PROJECT_DISCREPANCIES.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md) for the full discrepancy report.

---

**Status:** Canonical — both agents MUST follow this spec
**Last updated:** 2026-02-20
**Supersedes:** Previous auth docs (`SUB_PORTAL_AUTH_INTEGRATION.md`, `AUTH_STRATEGY.md`)
