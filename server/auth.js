const { jwtVerify, SignJWT } = require('jose');

const SERVICE_ID = 'swingtrade';
const SESSION_COOKIE_NAME = 'swingtrade_session';
const ALLOWED_TIERS = ['basic', 'stocks_and_options'];

/**
 * GET /auth/handoff?token=xxx
 * Verifies the handoff JWT from Member Portal, creates a local session cookie,
 * and redirects to the app root.
 */
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

    // 4. Create local session token (7-day expiry)
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
    console.error('[Auth] Token verification failed:', error.message);
    return res.redirect(`${process.env.MEMBER_PORTAL_URL}?error=invalid_token`);
  }
}

/**
 * Middleware: validates the session cookie on every /api/* request.
 * Attaches req.user = { sub, email, tier, iat, exp } on success.
 */
async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'session_expired' });
  }
}

module.exports = {
  SERVICE_ID,
  SESSION_COOKIE_NAME,
  ALLOWED_TIERS,
  handleAuthHandoff,
  requireAuth,
};
