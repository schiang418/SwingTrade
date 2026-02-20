# Sub-Portal Authentication Implementation Strategy

This document outlines authentication procedures for CycleScope sub-portals (OptionStrategy, SwingTrade, and future services).

## Architecture Overview

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

## Service-Specific Constants

Each sub-portal uses identical implementation patterns with different constants:

| Constant | OptionStrategy | SwingTrade |
|----------|----------------|-----------|
| `SERVICE_ID` | `'option_strategy'` | `'swingtrade'` |
| `SESSION_COOKIE_NAME` | `'option_strategy_session'` | `'swingtrade_session'` |
| `ALLOWED_TIERS` | `['basic', 'stocks_and_options']` | `['basic', 'stocks_and_options']` |
| Portal secret name | `OPTION_STRATEGY_TOKEN_SECRET` | `SWINGTRADE_TOKEN_SECRET` |
| Local env var | `PREMIUM_TOKEN_SECRET` | `PREMIUM_TOKEN_SECRET` |
| Launch endpoint | `POST /api/launch/option-strategy` | `POST /api/launch/swingtrade` |

## Subscription Tiers (Canonical)

Only two tier values exist system-wide:

| Tier | Description |
|------|-------------|
| `'basic'` | Default for all portal users |
| `'stocks_and_options'` | Premium tier from Patreon subscription |

Note: `'free'`, `'premium'`, and `'stocks'` tiers are deprecated. Patreon tier mapping (portal-side only): Basic → `'basic'`; Premium/Stocks + Options → `'stocks_and_options'`; unmapped/null → `'basic'` (default).

Current business policy grants promotional access to basic members. Restrict access later by removing `'basic'` from `ALLOWED_TIERS`.

## Dependencies

```bash
npm install jose cookie-parser
```

| Package | Purpose |
|---------|---------|
| `jose` | JWT signing and verification (HS256) |
| `cookie-parser` | Parse cookies from requests |

## Environment Variables

### Backend (.env)

```
PREMIUM_TOKEN_SECRET=<per-service-secret>
MEMBER_PORTAL_URL=https://portal.cyclescope.com
JWT_SECRET=<unique-random-secret>
```

### Frontend (.env)

```
VITE_MEMBER_PORTAL_URL=https://portal.cyclescope.com
```

**Critical rules:** Each sub-portal's `PREMIUM_TOKEN_SECRET` matches a different portal secret (per-service isolation). Each sub-portal has its own unique `JWT_SECRET` never shared between services. Compromising one service's secret doesn't affect others.

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

## JWT Specifications

### 6.1 Handoff Token (Portal → Sub-Portal)

Issued by Member Portal, verified by sub-portal.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Secret | Per-service (OPTION_STRATEGY_TOKEN_SECRET or SWINGTRADE_TOKEN_SECRET) |
| Expiration | 5 minutes |

**Canonical payload:**

```json
{
  "sub": "<userId>",
  "email": "<user email>",
  "tier": "basic | stocks_and_options",
  "service": "option_strategy | swingtrade",
  "iat": 1234567890,
  "exp": 1234568190
}
```

**Important:** The `sub` claim must use `.setSubject()` — not as a payload field. Don't expect `userId` or `patreonId`; use `payload.sub` for identification.

### 6.2 Local Session Token (Sub-Portal)

Created by sub-portal after successful handoff, stored as httpOnly cookie.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Library | `jose` |
| Secret | Sub-portal's own JWT_SECRET |
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

## Cookie Specifications

| Property | Value |
|----------|-------|
| Name | `swingtrade_session` |
| `httpOnly` | `true` (prevents XSS JavaScript access) |
| `secure` | `true` in production (HTTPS only) |
| `sameSite` | `'lax'` (CSRF protection) |
| `path` | `'/'` |
| `maxAge` | 7 days (604800000 milliseconds) |

**Railway note:** Behind Railway proxy, the `secure` flag may need to check `X-Forwarded-Proto` header instead of just `NODE_ENV`.

## Implementation

### 8.1 Token Exchange Endpoint

**Route:** `GET /auth/handoff?token=xxx`

The endpoint verifies the handoff token, validates service and tier claims, creates a local session token, sets an httpOnly cookie, and redirects to the app root. On any verification failure, it redirects to the portal with an appropriate error parameter.

### 8.2 Auth Middleware

**Applies to:** All `/api/*` routes except `/api/health`

The middleware extracts the session cookie, verifies its signature using the sub-portal's JWT_SECRET, extracts user data (sub, email, tier), and attaches it to `req.user`. Missing or invalid tokens return 401 status.

### 8.3 CORS Configuration

Configure CORS to accept requests from the Member Portal URL only, allowing credentials (cookies) in cross-origin requests.

### 8.4 Server Setup Order

1. Load environment variables (dotenv)
2. Validate required auth vars exist
3. Initialize middleware (cookie-parser, CORS)
4. Register auth endpoints (GET /auth/handoff)
5. Register API routes with requireAuth middleware
6. Register health endpoint (unauthenticated)

### 8.5 Frontend 401 Handling

When API calls return 401, redirect to the portal:

```typescript
const portalUrl = import.meta.env.VITE_MEMBER_PORTAL_URL;
window.location.href = `${portalUrl}?error=session_expired`;
```

## Error Handling

### Sub-Portal API Errors

Return 401 with JSON: `{ error: 'unauthorized' }` or `{ error: 'session_expired' }`

### Auth Redirect Error Parameters

Portal redirects include error query parameters:
- `error=missing_token` — No token in URL
- `error=invalid_token` — Token verification failed
- `error=invalid_service` — Service claim doesn't match sub-portal
- `error=upgrade_required` — Tier not in ALLOWED_TIERS

## What Sub-Portals Do NOT Implement

- Password handling or reset flows
- User signup or registration
- OAuth authentication
- Patreon API integration
- Subscription management
- Password validation

All these functions remain exclusively in the Member Portal.

## Security Summary

**Token isolation:** Each service uses a unique per-service secret for handoff tokens and a separate JWT_SECRET for session tokens. Compromising one service doesn't expose others.

**Defense in depth:** Sub-portals verify service claim matches their own SERVICE_ID AND check tier authorization independently.

**Session security:** Sessions use httpOnly, secure, and sameSite cookies. Token expiration is enforced (5 min handoff, 7 day session).

**CORS protection:** Only Member Portal origin can access sub-portal APIs with credentials.

## Tier Propagation & Revocation

The Member Portal generates handoff tokens reflecting current user tier from Patreon. If tier changes (upgrade/downgrade), the user must re-launch from the portal to receive updated handoff token with new tier. Existing sessions continue with old tier until expiration (7 days) or manual logout.

## Implementation Phases

### Phase 1: Dependencies & Config
Install jose and cookie-parser; set environment variables.

### Phase 2: Backend Auth
Implement token exchange endpoint, auth middleware, and CORS configuration.

### Phase 3: Frontend Auth
Add 401 redirect handler; integrate session management in API client.

### Phase 4: Validation
Test handoff flow, verify tier checks, validate error scenarios.

## Staging & Deployment

### Branch Strategy
Feature branches merge to `develop` (staging); `develop` merges to `main` (production).

### Staging Environment
Deploy to staging URLs with test Member Portal for integration testing before production.

### Staging Env Vars
Use staging portal URL and per-service staging secrets for testing.

## Discrepancies Resolved

This specification replaces conflicting implementations. Both OptionStrategy and SwingTrade agents must follow this canonical spec.

---

**Status:** Canonical — both agents MUST follow this spec
**Last updated:** 2026-02-20
**Supersedes:** Previous auth implementation docs (`SUB_PORTAL_AUTH_INTEGRATION.md`)
