const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');
const { validateAppointmentRequest } = require('../middleware/validation');
const {
  formatSlotRange,
  getDoctorSlots,
  parseSlotStart,
  slotRequestError,
  toDateColumn,
  validateBookableDate,
} = require('../utils/appointmentSlots');

const router = express.Router();
const RESERVING_STATUSES = ['PENDING', 'CONFIRMED'];
const SLOT_CONFLICT_MESSAGE =
  'That appointment slot has just been booked. Please choose another available time.';

function isSlotUniqueConflict(err) {
  if (err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const targetText = Array.isArray(target) ? target.join(',') : String(target || '');
  return targetText.includes('appointments_active_slot_key') ||
    (targetText.includes('doctorId') && targetText.includes('appointmentDate') && targetText.includes('slotStart'));
}

function sendSlotConflict(res) {
  return res.status(409).json({ error: 'SlotConflict', message: SLOT_CONFLICT_MESSAGE });
}

async function getActiveDoctorSlot(doctorId, preferredDate, slotStart) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || !doctor.isActive) {
    return { error: 'The selected doctor is not currently available for appointments.', status: 404 };
  }
  const error = slotRequestError(preferredDate, slotStart, doctor);
  if (error) return { error, status: 400 };
  return { doctor, date: toDateColumn(preferredDate), slotStart: parseSlotStart(slotStart) };
}

async function findSlotReservation(doctorId, date, slotStart, excludeAppointmentId) {
  return prisma.appointment.findFirst({
    where: {
      doctorId,
      appointmentDate: date,
      slotStart,
      status: { in: RESERVING_STATUSES },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { id: true },
  });
}

/**
 * GET /api/appointments
 * Protected: Retrieves appointments with filtering, pagination, and count statistics
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, doctorId, preferredDate } = req.query;

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (doctorId && doctorId !== 'ALL') {
      where.doctorId = doctorId;
    }
    if (preferredDate) {
      where.preferredDate = preferredDate;
    }

    const [appointments, total, pending, confirmed, completed, cancelled] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          doctor: {
            select: { name: true, specialty: true },
          },
          patient: {
            select: { id: true, mrn: true, fullName: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appointment.count(),
      prisma.appointment.count({ where: { status: 'PENDING' } }),
      prisma.appointment.count({ where: { status: 'CONFIRMED' } }),
      prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      prisma.appointment.count({ where: { status: 'CANCELLED' } }),
    ]);

    // Format for frontend
    const formatted = appointments.map((a) => ({
      id: a.id,
      patientId: a.patientId,
      patientMRN: a.patient?.mrn || null,
      patientName: a.patientName,
      patientPhone: a.patientPhone,
      patientEmail: a.patientEmail,
      serviceType: a.serviceType,
      doctorId: a.doctorId,
      doctorName: a.doctor?.name || 'Assigned Physician',
      preferredDate: a.preferredDate,
      preferredTime: a.preferredTime,
      slotStart: a.slotStart,
      status: a.status,
      notes: a.notes,
      createdAt: a.createdAt.toISOString().replace('T', ' ').substring(0, 16),
    }));

    res.json({
      stats: { total, pending, confirmed, completed, cancelled },
      count: formatted.length,
      appointments: formatted,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/appointments
 * Public: Submits a new appointment request with duplicate booking protection
 */
router.post('/', validateAppointmentRequest, async (req, res, next) => {
  try {
    const {
      patientName,
      patientPhone,
      patientEmail,
      serviceType,
      doctorId,
      preferredDate,
      slotStart,
      notes,
    } = req.body;

    const selected = await getActiveDoctorSlot(doctorId, preferredDate, slotStart);
    if (selected.error) {
      return res.status(selected.status).json({ error: 'ValidationError', message: selected.error });
    }

    const existingBooking = await findSlotReservation(
      doctorId,
      selected.date,
      selected.slotStart
    );
    if (existingBooking) {
      return sendSlotConflict(res);
    }

    const newAppointment = await prisma.appointment.create({
      data: {
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        patientEmail: patientEmail ? patientEmail.trim().toLowerCase() : null,
        serviceType,
        doctorId,
        preferredDate,
        preferredTime: formatSlotRange(
          Number(selected.slotStart.slice(0, 2)) * 60 + Number(selected.slotStart.slice(3, 5)),
          selected.doctor.slotDurationMinutes
        ),
        appointmentDate: selected.date,
        slotStart: selected.slotStart,
        status: 'PENDING',
        notes: notes ? notes.trim() : null,
        consentAgreed: true,
      },
      include: {
        doctor: { select: { name: true } },
      },
    });

    res.status(201).json({
      success: true,
      message:
        'Your appointment request has been submitted successfully. Our clinic staff will review and contact you to confirm.',
      appointmentId: newAppointment.id,
      status: newAppointment.status,
      doctor: newAppointment.doctor.name,
      preferredDate: newAppointment.preferredDate,
      preferredTime: newAppointment.preferredTime,
      slotStart: newAppointment.slotStart,
    });
  } catch (err) {
    if (isSlotUniqueConflict(err)) return sendSlotConflict(res);
    next(err);
  }
});

/**
 * GET /api/appointments/:id
 * Protected: Retrieve single appointment detail
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { doctor: true },
    });

    if (!appointment) {
      return res.status(404).json({ error: 'NotFound', message: 'Appointment not found.' });
    }

    res.json({ appointment });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/appointments/:id/status
 * Protected: Update status (CONFIRMED, COMPLETED, CANCELLED, PENDING)
 */
router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { status } = body;
    const allowed = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

    if (!status || !allowed.includes(status)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: `Invalid status. Must be one of: ${allowed.join(', ')}`,
      });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
    });
    if (!appointment) {
      return res.status(404).json({ error: 'NotFound', message: 'Appointment record not found.' });
    }

    if (RESERVING_STATUSES.includes(status)) {
      const selected = await getActiveDoctorSlot(
        appointment.doctorId,
        appointment.preferredDate,
        appointment.slotStart
      );
      if (selected.error) {
        return res.status(400).json({ error: 'ValidationError', message: selected.error });
      }
      const conflict = await findSlotReservation(
        appointment.doctorId,
        selected.date,
        selected.slotStart,
        appointment.id
      );
      if (conflict) return sendSlotConflict(res);
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({
      message: `Appointment status updated to ${status}.`,
      appointment: updated,
    });
  } catch (err) {
    if (isSlotUniqueConflict(err)) return sendSlotConflict(res);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'NotFound', message: 'Appointment record not found.' });
    }
    next(err);
  }
});

/**
 * PATCH /api/appointments/:id/reschedule
 * Protected: Reschedule appointment to a new date/time with duplicate protection
 */
router.patch('/:id/reschedule', requireAuth, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { preferredDate } = body;
    const slotStart = body.slotStart || body.preferredTime;

    if (!preferredDate || !slotStart) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Both preferredDate and slotStart are required for rescheduling.',
      });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
    });

    if (!appointment) {
      return res.status(404).json({ error: 'NotFound', message: 'Appointment not found.' });
    }

    const selected = await getActiveDoctorSlot(appointment.doctorId, preferredDate, slotStart);
    if (selected.error) {
      return res.status(selected.status).json({ error: 'ValidationError', message: selected.error });
    }

    const conflict = await findSlotReservation(
      appointment.doctorId,
      selected.date,
      selected.slotStart,
      appointment.id
    );
    if (conflict) return sendSlotConflict(res);

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        preferredDate,
        preferredTime: formatSlotRange(
          Number(selected.slotStart.slice(0, 2)) * 60 + Number(selected.slotStart.slice(3, 5)),
          selected.doctor.slotDurationMinutes
        ),
        appointmentDate: selected.date,
        slotStart: selected.slotStart,
        status: 'CONFIRMED', // Automatically confirm rescheduled slot
      },
    });

    res.json({
      message: 'Appointment rescheduled successfully.',
      appointment: updated,
    });
  } catch (err) {
    if (isSlotUniqueConflict(err)) return sendSlotConflict(res);
    next(err);
  }
});

/**
 * PATCH /api/appointments/:id/link-patient
 * Protected: Link an existing appointment record to a verified registered patient MRN
 */
router.patch('/:id/link-patient', requireAuth, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { patientId } = body;
    if (!patientId) {
      return res.status(400).json({ error: 'ValidationError', message: 'patientId is required to link an appointment.' });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, mrn: true, fullName: true, phone: true },
    });

    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Target patient record does not exist.' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { patientId: patient.id },
      include: {
        doctor: { select: { name: true } },
        patient: { select: { id: true, mrn: true, fullName: true, phone: true } },
      },
    });

    return res.json({
      success: true,
      message: `Appointment ${updated.id.substring(0, 8)} linked to patient ${patient.fullName} (${patient.mrn}).`,
      appointment: {
        id: updated.id,
        patientId: updated.patientId,
        patientMRN: updated.patient?.mrn || null,
        patientName: updated.patientName,
        patientPhone: updated.patientPhone,
        serviceType: updated.serviceType,
        doctorName: updated.doctor?.name,
        preferredDate: updated.preferredDate,
        preferredTime: updated.preferredTime,
        status: updated.status,
      },
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'NotFound', message: 'Appointment record not found.' });
    }
    next(err);
  }
});

module.exports = router;
