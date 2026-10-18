const crypto = require('crypto');
const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const receptionStaff = [requireAuth, requireRole('SUPERADMIN', 'ADMIN', 'STAFF')];
const activeVisitStatuses = ['CHECKED_IN', 'IN_PROGRESS'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get('/patients', ...receptionStaff, async (req, res, next) => {
  try {
    const search = req.query.search;
    if (typeof search !== 'string' || search.trim().length < 2 || search.trim().length > 100) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Search must be between 2 and 100 characters.',
      });
    }

    const term = search.trim();
    const digits = term.replace(/\D/g, '');
    const searchConditions = [
      { mrn: { contains: term, mode: 'insensitive' } },
      { fullName: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
    ];
    if (digits.length >= 4) {
      searchConditions.push({ phone: { contains: digits } });
    }

    const patients = await prisma.patient.findMany({
      where: { isActive: true, OR: searchConditions },
      select: { id: true, mrn: true, fullName: true, phone: true },
      orderBy: { fullName: 'asc' },
      take: 20,
    });

    return res.json({ patients });
  } catch (err) {
    return next(err);
  }
});

router.get('/patients/:patientId/appointments', ...receptionStaff, async (req, res, next) => {
  try {
    if (!uuidPattern.test(req.params.patientId)) {
      return res.status(400).json({ error: 'ValidationError', message: 'A valid patient ID is required.' });
    }

    const patient = await prisma.patient.findFirst({
      where: { id: req.params.patientId, isActive: true },
      select: { id: true },
    });
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Active registered patient not found.' });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        patientId: patient.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: {
        id: true,
        serviceType: true,
        preferredDate: true,
        preferredTime: true,
        status: true,
        doctor: { select: { name: true } },
      },
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });

    return res.json({ appointments });
  } catch (err) {
    return next(err);
  }
});

router.get('/visits', ...receptionStaff, async (req, res, next) => {
  try {
    const limitValue = req.query.limit === undefined ? '50' : req.query.limit;
    if (typeof limitValue !== 'string' || !/^\d+$/.test(limitValue)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Visit list limit must be a number.' });
    }
    const limit = Number(limitValue);
    if (limit < 1 || limit > 100) {
      return res.status(400).json({ error: 'ValidationError', message: 'Visit list limit must be between 1 and 100.' });
    }

    const visits = await prisma.visit.findMany({
      take: limit,
      orderBy: { checkedInAt: 'desc' },
      select: {
        visitNumber: true,
        checkedInAt: true,
        status: true,
        appointmentId: true,
        patient: { select: { fullName: true, mrn: true } },
      },
    });

    return res.json({ visits });
  } catch (err) {
    return next(err);
  }
});

router.post('/visits', ...receptionStaff, async (req, res, next) => {
  try {
    const { patientId, appointmentId = null } = req.body || {};
    if (typeof patientId !== 'string' || !uuidPattern.test(patientId)) {
      return res.status(400).json({ error: 'ValidationError', message: 'A valid registered patient ID is required.' });
    }
    if (appointmentId !== null && (typeof appointmentId !== 'string' || !uuidPattern.test(appointmentId))) {
      return res.status(400).json({ error: 'ValidationError', message: 'A valid appointment ID is required.' });
    }

    const visit = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, isActive: true },
        select: { id: true },
      });
      if (!patient) {
        const error = new Error('Active registered patient not found.');
        error.status = 404;
        throw error;
      }

      if (appointmentId) {
        // Serialize check-ins against the appointment row so concurrent requests cannot duplicate an active visit.
        await tx.$queryRaw`SELECT "id" FROM "appointments" WHERE "id" = ${appointmentId} FOR UPDATE`;
        const appointment = await tx.appointment.findUnique({
          where: { id: appointmentId },
          select: { id: true, patientId: true, status: true },
        });
        if (!appointment || appointment.patientId !== patientId) {
          const error = new Error('The appointment is not linked to the selected patient.');
          error.status = 400;
          throw error;
        }
        if (!['PENDING', 'CONFIRMED'].includes(appointment.status)) {
          const error = new Error('Only pending or confirmed appointments can be checked in.');
          error.status = 409;
          throw error;
        }

        const existingVisit = await tx.visit.findFirst({
          where: { appointmentId, status: { in: activeVisitStatuses } },
          select: { visitNumber: true },
        });
        if (existingVisit) {
          const error = new Error('This appointment already has an active check-in.');
          error.status = 409;
          throw error;
        }
      }

      const staff = typeof req.user.id === 'string'
        ? await tx.admin.findUnique({ where: { id: req.user.id }, select: { id: true } })
        : null;
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      return tx.visit.create({
        data: {
          visitNumber: `PCCV-${datePart}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          patientId,
          appointmentId,
          checkedInById: staff?.id || null,
        },
        select: {
          visitNumber: true,
          checkedInAt: true,
          status: true,
          appointmentId: true,
          patient: { select: { fullName: true, mrn: true } },
        },
      });
    });

    return res.status(201).json({ success: true, visit });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A visit number collision occurred. Please submit the check-in again.',
      });
    }
    return next(err);
  }
});

module.exports = router;
