const crypto = require('crypto');

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function adminAuthConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
}

function requireAdmin(req, res, next) {
  const production = process.env.NODE_ENV === 'production';
  const username = process.env.ADMIN_USERNAME || (production ? '' : 'admin');
  const password = process.env.ADMIN_PASSWORD || (production ? '' : 'admin');

  if (!username || !password) {
    return res.status(503).json({
      error: 'Admin authentication is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.'
    });
  }

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme !== 'Basic' || !encoded) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Strango Admin"');
    return res.status(401).send('Authentication required');
  }

  let decoded = '';
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    res.setHeader('WWW-Authenticate', 'Basic realm="Strango Admin"');
    return res.status(401).send('Authentication required');
  }

  const splitAt = decoded.indexOf(':');
  const providedUser = splitAt === -1 ? decoded : decoded.slice(0, splitAt);
  const providedPass = splitAt === -1 ? '' : decoded.slice(splitAt + 1);

  if (
    !timingSafeEqualString(providedUser, username) ||
    !timingSafeEqualString(providedPass, password)
  ) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Strango Admin"');
    return res.status(401).send('Authentication required');
  }

  next();
}

function validateOrigin(origin, allowedOrigins) {
  if (!origin || allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

module.exports = {
  adminAuthConfigured,
  requireAdmin,
  validateOrigin
};
