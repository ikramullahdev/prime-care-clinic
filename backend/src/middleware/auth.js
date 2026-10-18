const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'primecare-fallback-secret-2026';

/**
 * Require valid JWT Bearer token
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Access denied. Missing or malformed authentication token.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'InvalidToken',
      message: 'Authentication token is invalid or expired. Please log in again.',
    });
  }
}

/**
 * Role-based access control
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to perform this administrative action.',
      });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  JWT_SECRET,
};
