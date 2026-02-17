# CycleScope Authentication & Authorization Strategy

> **Single Source of Truth** for how Patreon memberships gate access to premium services.
> Referenced by: `cyclescope-member-portal`, `SwingTrade` (stocks), and the future Options site.

---

## 1. Architecture Overview

```
┌──────────┐      OAuth      ┌────────────────────────┐     JWT token     ┌──────────────────┐
│  Patreon  │◄──────────────►│  CycleScope Member     │────────────────►  │  SwingTrade      │
│  (tiers)  │   webhooks     │  Portal                │                   │  (stocks app)    │
└──────────┘                 │  - authenticates users  │     JWT token     ├──────────────────┤
                             │  - stores tier info     │────────────────►  │  Options Site    │
                             │  - issues access tokens │                   │  (future)        │
                             └────────────────────────┘                   └──────────────────┘
```

**Portal** = gatekeeper (decides who gets a token and what tier is in it)
**SwingTrade / Options** = enforcers (verify token, reject wrong tier)

---

## 2. Patreon Tier Definitions

| Patreon Tier ID | Tier Name              | Internal Key             | Access Granted                         |
|-----------------|------------------------|--------------------------|----------------------------------------|
| *(TBD)*         | Free / Community       | `free`                   | Portal only (commentary, blog)         |
| *(TBD)*         | Stocks                 | `stocks`                 | Portal + **SwingTrade**                |
| *(TBD)*         | Stocks + Options       | `stocks_and_options`     | Portal + **SwingTrade** + **Options**  |

> **Action item**: Fill in the actual Patreon tier IDs once created on patreon.com/cyclescope.

---

## 3. Shared Secrets & Environment Variables

Both the Portal and each premium site must share a secret for signing/verifying JWTs.

### CycleScope Portal `.env`

```env
PATREON_CLIENT_ID=<from Patreon developer portal>
PATREON_CLIENT_SECRET=<from Patreon developer portal>
PATREON_WEBHOOK_SECRET=<from Patreon webhook setup>

# Shared secrets for issuing access tokens to premium sites
SWINGTRADE_TOKEN_SECRET=<random 256-bit secret shared with SwingTrade>
OPTIONS_TOKEN_SECRET=<random 256-bit secret shared with Options site>

# Premium site URLs
SWINGTRADE_URL=https://swingtrade.up.railway.app
OPTIONS_URL=https://options.up.railway.app  # future
```

### SwingTrade `.env`

```env
# Shared secret — MUST match SWINGTRADE_TOKEN_SECRET in the portal
PREMIUM_TOKEN_SECRET=<same value as portal's SWINGTRADE_TOKEN_SECRET>

# SwingTrade's own secret for signing 7-day session cookies
JWT_SECRET=<separate random 256-bit secret, NOT shared>

# Portal URL for redirects on auth failure
MEMBER_PORTAL_URL=https://portal.cyclescope.com

# CORS: only allow requests from the portal origin
PORTAL_ORIGIN=https://portal.cyclescope.com
```

### Options Site `.env` (future)

```env
PREMIUM_TOKEN_SECRET=<same value as portal's OPTIONS_TOKEN_SECRET>
JWT_SECRET=<separate random 256-bit secret>
MEMBER_PORTAL_URL=https://portal.cyclescope.com
PORTAL_ORIGIN=https://portal.cyclescope.com
```

> **Important**: `PREMIUM_TOKEN_SECRET` and `JWT_SECRET` must be different values.
> A compromise of the shared secret should not compromise session cookies (and vice versa).

---

## 4. Authentication Flow (Step-by-Step)

### 4.1 User Logs into Portal via Patreon OAuth

```
User → Portal login page → "Log in with Patreon" → Patreon OAuth consent
→ Patreon redirects back to Portal with auth code
→ Portal exchanges code for Patreon access token
→ Portal calls Patreon API to get user identity + tier
→ Portal creates/updates user record in its database
→ Portal sets its own session for the user
```

**Patreon API call** (Portal backend):

```
GET https://www.patreon.com/api/oauth2/v2/identity
    ?include=memberships,memberships.currently_entitled_tiers
    &fields[member]=patron_status,currently_entitled_amount_cents
    &fields[tier]=title
Headers:
    Authorization: Bearer <patreon_access_token>
```

**Portal stores**:

```js
{
  id: "uuid",
  email: "user@example.com",
  patreonId: "12345678",
  tier: "stocks_and_options",   // mapped from Patreon tier ID
  patronStatus: "active_patron",
  createdAt: "2026-01-15T...",
  updatedAt: "2026-02-17T..."
}
```

### 4.2 User Clicks "SwingTrade" Button in Portal

**Portal frontend** — button visibility based on tier:

```jsx
// Only show clickable button if tier includes stocks access
const canAccessStocks = ["stocks", "stocks_and_options"].includes(user.tier);
const canAccessOptions = user.tier === "stocks_and_options";
```

- If `canAccessStocks` → show active "SwingTrade" button
- If `!canAccessStocks` → show disabled button with "Upgrade to access"
- Same logic for Options with `canAccessOptions`

**Portal backend** — generate a short-lived access token:

```js
// POST /api/launch/swingtrade
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.SWINGTRADE_TOKEN_SECRET);

const token = await new SignJWT({
  email: user.email,
  tier: user.tier,
  patreonId: user.patreonId
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("5m")       // 5-minute window to complete redirect
  .setSubject(user.id)
  .sign(secret);

// Redirect the user's browser to SwingTrade
res.redirect(`${process.env.SWINGTRADE_URL}/auth?token=${token}`);
```

### 4.3 SwingTrade Verifies the Token

**SwingTrade** `/auth` endpoint:

```js
import { jwtVerify } from "jose";

app.get("/auth", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.redirect(`${MEMBER_PORTAL_URL}?error=missing_token`);
  }

  try {
    const secret = new TextEncoder().encode(process.env.PREMIUM_TOKEN_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // AUTHORIZATION CHECK: does the tier grant access to stocks?
    const allowedTiers = ["stocks", "stocks_and_options"];
    if (!allowedTiers.includes(payload.tier)) {
      return res.redirect(`${MEMBER_PORTAL_URL}?error=upgrade_required`);
    }

    // Create a 7-day session cookie (signed with SwingTrade's own secret)
    const sessionSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    const sessionToken = await new SignJWT({
      email: payload.email,
      tier: payload.tier
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .setSubject(payload.sub)
      .sign(sessionSecret);

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000   // 7 days in ms
    });

    res.redirect("/");

  } catch (err) {
    // Token expired, invalid signature, etc.
    return res.redirect(`${MEMBER_PORTAL_URL}?error=invalid_token`);
  }
});
```

### 4.4 Subsequent API Calls Use the Session Cookie

**`requireAuth` middleware** on SwingTrade:

```js
async function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    req.user = payload;   // { email, tier, sub, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: "session_expired" });
  }
}

// Apply to all API routes
app.use("/api", requireAuth);
```

### 4.5 Frontend Handles 401 → Redirect to Portal

**SwingTrade React app**:

```js
// In api.ts or a fetch wrapper
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: "include" });

  if (res.status === 401) {
    window.location.href = process.env.REACT_APP_MEMBER_PORTAL_URL
      || "https://portal.cyclescope.com";
    return;
  }

  return res;
}
```

---

## 5. Patreon Webhook Handling (Portal)

When a user changes or cancels their subscription, Patreon sends a webhook to the portal.

**Webhook events to handle**:

| Event                       | Action                                      |
|-----------------------------|---------------------------------------------|
| `members:pledge:create`     | Set user tier based on pledge tier           |
| `members:pledge:update`     | Update user tier (upgrade or downgrade)      |
| `members:pledge:delete`     | Set user tier to `free`                      |

**Portal endpoint**:

```js
// POST /api/webhooks/patreon
app.post("/api/webhooks/patreon", express.raw({ type: "application/json" }), (req, res) => {
  // 1. Verify webhook signature using PATREON_WEBHOOK_SECRET
  // 2. Parse the event type and member data
  // 3. Map the Patreon tier ID to internal tier key
  // 4. Update user record in portal database
  res.sendStatus(200);
});
```

**Tier mapping** (in portal code):

```js
const TIER_MAP = {
  "<patreon_free_tier_id>":    "free",
  "<patreon_stocks_tier_id>":  "stocks",
  "<patreon_both_tier_id>":    "stocks_and_options"
};
```

> **Propagation delay**: When a user downgrades on Patreon, their existing SwingTrade
> session cookie remains valid for up to 7 days. On next re-auth through the portal,
> the new (lower) tier will be embedded in the token and they'll lose access.
> For immediate revocation, the premium sites would need a `/api/revoke` endpoint
> callable by the portal — this is optional and can be added later if needed.

---

## 6. CORS Configuration

Each premium site locks CORS to the portal origin only:

```js
app.use(cors({
  origin: process.env.PORTAL_ORIGIN,   // e.g. "https://portal.cyclescope.com"
  credentials: true                     // allow cookies
}));
```

> **Note**: CORS only restricts browsers. `requireAuth` middleware is the real security layer.

---

## 7. Tier-Based Access Matrix

| Resource                     | `free` | `stocks` | `stocks_and_options` |
|------------------------------|--------|----------|----------------------|
| Portal dashboard             | yes    | yes      | yes                  |
| Portal blog / commentary     | yes    | yes      | yes                  |
| SwingTrade — rankings        | no     | **yes**  | **yes**              |
| SwingTrade — portfolios      | no     | **yes**  | **yes**              |
| SwingTrade — EMA analysis    | no     | **yes**  | **yes**              |
| Options — scanner            | no     | no       | **yes**              |
| Options — trade setups       | no     | no       | **yes**              |

---

## 8. Security Summary

| Measure                 | What it does                                           | Where        |
|-------------------------|--------------------------------------------------------|--------------|
| Patreon OAuth           | Authenticates user identity                            | Portal       |
| Tier from Patreon API   | Determines what the user can access                    | Portal       |
| 5-min JWT access token  | Short-lived pass from portal to premium site           | Portal → App |
| Tier embedded in token  | Premium site can verify authorization without calling portal | In JWT  |
| `requireAuth` middleware| Blocks unauthenticated API access                      | Premium App  |
| 7-day session cookie    | Keeps user logged in without re-authenticating         | Premium App  |
| httpOnly + secure cookie| Prevents XSS theft and network sniffing                | Premium App  |
| CORS lockdown           | Prevents random websites from making API calls         | Premium App  |
| Patreon webhooks        | Keeps portal in sync with subscription changes         | Portal       |
| Separate JWT secrets    | Compromise of one secret doesn't affect the other      | All          |

---

## 9. Implementation Checklist

### Portal (cyclescope-member-portal)
- [ ] Patreon OAuth login flow
- [ ] Patreon API call to fetch user tier
- [ ] User database table with tier field
- [ ] `/api/launch/swingtrade` — generate 5-min JWT, redirect
- [ ] `/api/launch/options` — same, for options site (future)
- [ ] `/api/webhooks/patreon` — handle subscription changes
- [ ] Frontend: show/hide/disable premium site buttons based on tier
- [ ] Frontend: handle `?error=upgrade_required` redirect-back

### SwingTrade
- [ ] Install `jose` and `cookie-parser`
- [ ] `GET /auth?token=xxx` — verify token, check tier, set session cookie
- [ ] `requireAuth` middleware on all `/api` routes
- [ ] CORS locked to `PORTAL_ORIGIN`
- [ ] Frontend: 401 handler redirects to portal
- [ ] Environment variables: `PREMIUM_TOKEN_SECRET`, `JWT_SECRET`, `MEMBER_PORTAL_URL`, `PORTAL_ORIGIN`

### Options Site (future)
- [ ] Same as SwingTrade, but tier check requires `stocks_and_options` only
- [ ] Uses its own `OPTIONS_TOKEN_SECRET` (separate from SwingTrade's)

---

*Last updated: 2026-02-17*
