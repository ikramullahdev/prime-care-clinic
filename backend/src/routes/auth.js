const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { validateLoginRequest } = require('../middleware/validation');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticates clinic account credentials and returns JWT token
 */
router.post('/login', validateLoginRequest, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const admin = await prisma.admin.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!admin) {
      return res.status(401).json({
        error: 'AuthenticationFailed',
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        error: 'AuthenticationFailed',
        message: 'Invalid email or password.',
      });
    }

    const payload = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    res.json({
      message: 'Authentication successful.',
      token,
      user: payload,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Retrieves authenticated staff profile
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!admin) {
      return res.status(404).json({ error: 'UserNotFound', message: 'User not found.' });
    }

    res.json({ user: admin });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
