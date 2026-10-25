'use strict';

/** Headers for an API that only serves JSON and downloads. */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store'); // responses hold private data
  next();
}

/**
 * Blocks state-changing requests that a browser sends from another site.
 * The session cookie is SameSite=Lax already; this is a second layer. Requests without an
 * Origin header (curl, server-to-server) are not browser cross-site requests and pass.
 */
function sameOriginOnly(allowedOrigins) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    const own = `${req.protocol}://${req.get('host')}`;
    if (origin === own || allowedOrigins.includes(origin)) return next();
    return res.status(403).json({ message: 'Request blocked: it came from an unexpected origin.' });
  };
}

module.exports = { securityHeaders, sameOriginOnly };
