const crypto = require('crypto');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseAllowedOrigins(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function buildCorsOptions(allowedOriginsRaw) {
  const allowedOrigins = parseAllowedOrigins(allowedOriginsRaw);
  if (allowedOrigins.length === 0) return {};

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS origin not allowed'));
    },
  };
}

function createApiAuthMiddleware({ bearerToken, basicUser, basicPassword } = {}) {
  const hasBearer = !!bearerToken;
  const hasBasic = !!basicUser && !!basicPassword;

  if (!hasBearer && !hasBasic) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';

    if (hasBearer && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (safeEqual(token, bearerToken)) return next();
    }

    if (hasBasic && authHeader.startsWith('Basic ')) {
      try {
        const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
        const separator = credentials.indexOf(':');
        const user = separator >= 0 ? credentials.slice(0, separator) : credentials;
        const password = separator >= 0 ? credentials.slice(separator + 1) : '';
        if (safeEqual(user, basicUser) && safeEqual(password, basicPassword)) return next();
      } catch {
        // fall through to unauthorized response
      }
    }

    res.set('WWW-Authenticate', 'Bearer realm="law-hub", Basic realm="law-hub"');
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

function applySecurityHeaders(req, res, next) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}

module.exports = {
  safeEqual,
  buildCorsOptions,
  createApiAuthMiddleware,
  applySecurityHeaders,
};
