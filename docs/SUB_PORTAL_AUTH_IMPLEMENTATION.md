# SwingTrade — Sub-Portal Authentication Implementation

> **Canonical spec:** [`cyclescope-doc/docs/UNIFIED_AUTH_STRATEGY.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md) is the single source of truth for cross-project authentication.
>
> This document is a **SwingTrade-specific implementation guide** derived from the canonical spec. If anything here conflicts with the unified strategy, the unified strategy wins.
>
> Last updated: 2026-02-20

---

## SwingTrade Constants

| Constant | Value |
|----------|-------|
| `SERVICE_ID` | `'swingtrade'` |
| `SESSION_COOKIE_NAME` | `'swingtrade_session'` |
| `ALLOWED_TIERS` | `['basic', 'stocks_and_options']` |
| Portal secret name | `SWINGTRADE_TOKEN_SECRET` (portal-side) |
| Local env var | `PREMIUM_TOKEN_SECRET` (must match portal's `SWINGTRADE_TOKEN_SECRET`) |
| Portal launch endpoint | `POST /api/launch/swingtrade` |
| Auth handoff route | `GET /auth/handoff?token=xxx` |

> **Business policy:** Both `basic` and `stocks_and_options` tiers currently have access (promotional). To restrict to premium only, change `ALLOWED_TIERS` to `['stocks_and_options']` — no code or DB changes needed.

---

## Architecture Overview

```
Member Portal                          SwingTrade
─────────────                          ──────────
1. User clicks "Launch SwingTrade"
2. Portal verifies session + tier
3. Portal signs 5-min handoff JWT
   (secret: SWINGTRADE_TOKEN_SECRET)
4. Redirects browser ─────────────────► GET /auth/handoff?token=eyJ...
                                        5. Verify handoff token (PREMIUM_TOKEN_SECRET)
                                        6. Validate service === 'swingtrade'
                                        7. Check tier in ALLOWED_TIERS
                                        8. Create 7-day session JWT (JWT_SECRET)
                                        9. Set httpOnly cookie: swingtrade_session
                                       10. Redirect to /
                                       11. All /api/* calls include cookie
                                       12. requireAuth middleware validates cookie
```

**SwingTrade does NOT implement:** passwords, signup, OAuth, Patreon integration, or subscription management. All of that lives in the Member Portal.

---

## Dependencies

```bash
npm install jose cookie-parser
```

| Package | Purpose |
|---------|---------|
| `jose` | JWT verification and signing (HS256) |
| `cookie-parser` | Parse cookies from incoming requests |

---

## Environment Variables

### Backend (`/.env`)

```env
# Handoff token verification — MUST match portal's SWINGTRADE_TOKEN_SECRET
PREMIUM_TOKEN_SECRET=<same value as portal's SWINGTRADE_TOKEN_SECRET>

# Local session signing — unique to SwingTrade, never shared
JWT_SECRET=<generate: openssl rand -base64 32>

# Portal URL for redirects and CORS
MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

### Frontend (`/.env`)

```env
VITE_MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

**Critical:** `PREMIUM_TOKEN_SECRET` and `JWT_SECRET` must be different values. A compromise of the handoff secret should not compromise local sessions (and vice versa).

---

## Implementation

### Auth Module (`server/auth.js`)

```js
import { jwtVerify, SignJWT } from 'jose';

// ── SwingTrade-specific constants ──
const SERVICE_ID = 'swingtrade';
const SESSION_COOKIE_NAME = 'swingtrade_session';
const ALLOWED_TIERS = ['basic', 'stocks_and_options'];

// ── Token Exchange Endpoint ──
// Route: GET /auth/handoff?token=xxx
export async function handleAuthHandoff(req, res) {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=missing_token`);
  }

  try {
    // 1. Verify handoff token from Member Portal
    const premiumSecret = new TextEncoder().encode(process.env.PREMIUM_TOKEN_SECRET);
    const { payload } = await jwtVerify(token, premiumSecret);

    // 2. Validate service claim matches SwingTrade
    if (payload.service && payload.service !== SERVICE_ID) {
      console.error(`[Auth] Service mismatch: expected ${SERVICE_ID}, got ${payload.service}`);
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
      .setSubject(payload.sub)     // MUST use .setSubject() for user ID
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(sessionSecret);

    // 5. Set session cookie
    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // 6. Redirect to app root
    return res.redirect('/');

  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=invalid_token`);
  }
}

// ── Auth Middleware ──
// Applies to: all /api/* routes except /api/health
export async function requireAuth(req, res, next) {
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
```

### Server Integration (`server/index.js`)

Add to the existing Express setup:

```js
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { handleAuthHandoff, requireAuth } from './auth.js';

// ── Startup validation ──
const REQUIRED_AUTH_VARS = ['PREMIUM_TOKEN_SECRET', 'JWT_SECRET', 'MEMBER_PORTAL_URL'];
for (const varName of REQUIRED_AUTH_VARS) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

// ── Middleware (before routes) ──
app.use(cookieParser());
app.use(cors({
  origin: process.env.MEMBER_PORTAL_URL,
  credentials: true,
}));

// ── Auth endpoint (before API routes) ──
app.get('/auth/handoff', handleAuthHandoff);

// ── Protect API routes (except /api/health) ──
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  return requireAuth(req, res, next);
});

// ... existing route registrations (rankings, portfolios, analysis, etc.)
```

### Frontend 401 Handling (`src/lib/api.js`)

```js
const MEMBER_PORTAL_URL = import.meta.env.VITE_MEMBER_PORTAL_URL
  || 'https://portal.cyclescope.com';

export async function apiFetch(url, options) {
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

---

## JWT Specifications

### Handoff Token (Portal → SwingTrade)

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Signing secret | Portal's `SWINGTRADE_TOKEN_SECRET` = SwingTrade's `PREMIUM_TOKEN_SECRET` |
| Expiration | 5 minutes |

```json
{
  "sub": "<userId>",
  "email": "<user email>",
  "tier": "basic | stocks_and_options",
  "service": "swingtrade",
  "iat": 1234567890,
  "exp": 1234568190
}
```

### Local Session Token (SwingTrade)

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Signing secret | SwingTrade's own `JWT_SECRET` |
| Expiration | 7 days |

```json
{
  "sub": "<userId from handoff>",
  "email": "<email from handoff>",
  "tier": "basic | stocks_and_options",
  "iat": 1234567890,
  "exp": 1235172690
}
```

**Important:** User ID goes in `sub` via `.setSubject()` — never as a payload field.

---

## Cookie Specification

| Property | Value |
|----------|-------|
| Name | `swingtrade_session` |
| `httpOnly` | `true` |
| `secure` | `true` in production |
| `sameSite` | `'lax'` |
| `path` | `'/'` |
| `maxAge` | 604800000 ms (7 days) |

**Railway note:** Behind Railway proxy, `secure` may need to check `X-Forwarded-Proto` header instead of `NODE_ENV`.

---

## Error Handling

### API Errors (401)

```json
{ "error": "unauthorized" }
{ "error": "session_expired" }
```

### Auth Redirect Errors

| Query Parameter | Meaning |
|----------------|---------|
| `?error=missing_token` | No token in handoff URL |
| `?error=invalid_token` | Token verification failed |
| `?error=invalid_service` | Token's `service` claim is not `swingtrade` |
| `?error=upgrade_required` | User's tier not in `ALLOWED_TIERS` |

---

## Tier Propagation

Tier changes on Patreon propagate through the portal's daily sync. Users must re-launch from the portal to get an updated handoff token. Existing sessions continue with the old tier until expiration (7 days).

---

## Implementation Checklist

- [ ] Install `jose` and `cookie-parser`
- [ ] Add `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL` to `.env`
- [ ] Add `VITE_MEMBER_PORTAL_URL` to frontend `.env`
- [ ] Create `server/auth.js` with `handleAuthHandoff` and `requireAuth`
- [ ] Add `cookieParser()` middleware to `server/index.js`
- [ ] Add CORS config with `credentials: true` locked to `MEMBER_PORTAL_URL`
- [ ] Register `GET /auth/handoff` route
- [ ] Apply `requireAuth` to all `/api/*` routes (except `/api/health`)
- [ ] Add startup validation for required env vars
- [ ] Add frontend 401 redirect handler
- [ ] Test end-to-end: portal login → launch → handoff → session → API calls → 401 redirect

---

**Canonical spec:** [`cyclescope-doc/docs/UNIFIED_AUTH_STRATEGY.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
**Discrepancies report:** [`cyclescope-doc/docs/CROSS_PROJECT_DISCREPANCIES.md`](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md)
