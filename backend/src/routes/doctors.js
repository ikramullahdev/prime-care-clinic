const express = require('express');
const prisma = require('../config/prisma');
const { getDoctorSlots, toDateColumn, validateBookableDate } = require('../utils/appointmentSlots');

const router = express.Router();

/**
 * GET /api/doctors/:doctorId/availability?date=YYYY-MM-DD
 * Returns valid, unreserved slots for one active doctor and date.
 */
router.get('/:doctorId/availability', async (req, res, next) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.doctorId)) {
      return res.status(400).json({ error: 'ValidationError', message: 'A valid doctor ID is required.' });
    }
    const dateResult = validateBookableDate(req.query.date);
    if (dateResult.error) {
      return res.status(400).json({ error: 'ValidationError', message: dateResult.error });
    }

    const doctor = await prisma.doctor.findUnique({ where: { id: req.params.doctorId } });
    if (!doctor || !doctor.isActive) {
      return res.status(404).json({ error: 'NotFound', message: 'The selected doctor is not available.' });
    }

    const slots = getDoctorSlots(doctor, dateResult.date);
    const reservations = await prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        appointmentDate: toDateColumn(dateResult.date),
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: { slotStart: true },
    });
    const reserved = new Set(reservations.map((appointment) => appointment.slotStart));

    return res.json({
      doctorId: doctor.id,
      date: dateResult.date,
      slots: slots.filter((slot) => !reserved.has(slot.slotStart)),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/doctors
 * Returns active doctors and their operating schedules
 */
router.get('/', async (req, res, next) => {
  try {
    const doctors = await prisma.doctor.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        title: true,
        specialty: true,
        bio: true,
        isVerified: true,
        scheduleDays: true,
        startTime: true,
        endTime: true,
        slotDurationMinutes: true,
      },
    });

    res.json({ doctors });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
