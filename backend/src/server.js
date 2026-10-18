/**
 * Prime Care Clinic & Diabetes Center — Backend Server
 * Express.js + Prisma ORM + PostgreSQL
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const patientRoutes = require('./routes/patients');
const receptionRoutes = require('./routes/reception');
const consultationRoutes = require('./routes/consultations');
const diagnosticOrderRoutes = require('./routes/diagnosticOrders');
const prisma = require('./config/prisma');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend clients
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['*'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, or file:// origin in dev)
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow any localhost / 127.0.0.1 port in development
      if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive fallback in development
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint with Live Database Query
app.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  let isDbConnected = false;
  let latencyMs = null;
  let dbDiagnostic = 'PostgreSQL is operational';

  try {
    // Perform lightweight query probe to verify real database communication
    await prisma.$queryRawUnsafe('SELECT 1');
    latencyMs = Date.now() - startTime;
    isDbConnected = true;
  } catch (err) {
    console.error('[Health Check DB Probe Error]:', err.message);
    isDbConnected = false;
    dbDiagnostic = 'Database query failed or connection unavailable';
  }

  const responseStatus = isDbConnected ? 200 : 503;
  return res.status(responseStatus).json({
    status: isDbConnected ? 'online' : 'degraded',
    service: 'Prime Care Clinic Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: {
      provider: 'PostgreSQL (Prisma)',
      status: isDbConnected ? 'connected' : 'disconnected',
      connected: isDbConnected,
      latencyMs,
      message: dbDiagnostic,
    },
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/reception', receptionRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/diagnostic-orders', diagnosticOrderRoutes);

// 404 Route Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: `The requested endpoint ${req.originalUrl} does not exist.`,
  });
});

// Central Error Handler
app.use((err, req, res, next) => {
  console.error('[API Error]:', err.stack || err);

  const status = err.status || 500;
  res.status(status).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected server error occurred.',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=====================================================`);
    console.log(`Prime Care Clinic API Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=====================================================`);
  });
}

module.exports = app;
