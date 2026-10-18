const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const consultationAccess = [requireAuth, requireRole('SUPERADMIN', 'ADMIN', 'STAFF', 'DOCTOR')];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeVisitStatuses = ['CHECKED_IN', 'IN_PROGRESS'];
const consultationFields = [
  'chiefComplaint',
  'presentIllness',
  'medicalHistory',
  'allergies',
  'examinationFindings',
  'provisionalDiagnosis',
  'finalDiagnosis',
  'consultationNotes',
];
const consultationSelect = {
  id: true,
  visitId: true,
  patientId: true,
  chiefComplaint: true,
  presentIllness: true,
  medicalHistory: true,
  allergies: true,
  examinationFindings: true,
  provisionalDiagnosis: true,
  finalDiagnosis: true,
  consultationNotes: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, role: true } },
};

function sendValidationError(res, message) {
  return res.status(400).json({ error: 'ValidationError', message });
}

router.get('/visits', ...consultationAccess, async (req, res, next) => {
  try {
    const visits = await prisma.visit.findMany({
      where: { status: { in: activeVisitStatuses } },
      orderBy: { checkedInAt: 'asc' },
      take: 100,
      select: {
        id: true,
        visitNumber: true,
        checkedInAt: true,
        status: true,
        patient: { select: { id: true, mrn: true, fullName: true } },
        consultation: { select: { id: true, updatedAt: true } },
      },
    });
    return res.json({ visits });
  } catch (err) {
    return next(err);
  }
});

router.get('/visits/:visitId', ...consultationAccess, async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!uuidPattern.test(visitId)) {
      return sendValidationError(res, 'A valid visit ID is required.');
    }

    const visit = await prisma.visit.findFirst({
      where: { id: visitId, status: { in: activeVisitStatuses } },
      select: {
        id: true,
        visitNumber: true,
        checkedInAt: true,
        status: true,
        patient: {
          select: {
            id: true,
            mrn: true,
            fullName: true,
            dateOfBirth: true,
            estimatedAge: true,
            isAgeEstimated: true,
            gender: true,
            bloodGroup: true,
            notes: true,
          },
        },
        consultation: { select: consultationSelect },
      },
    });

    if (!visit) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'No checked-in or in-progress visit was found.',
      });
    }

    return res.json({ visit });
  } catch (err) {
    return next(err);
  }
});

router.get('/patients/:patientId/history', ...consultationAccess, async (req, res, next) => {
  try {
    const { patientId } = req.params;
    if (!uuidPattern.test(patientId)) {
      return sendValidationError(res, 'A valid patient ID is required.');
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        mrn: true,
        fullName: true,
        dateOfBirth: true,
        estimatedAge: true,
        isAgeEstimated: true,
        gender: true,
        bloodGroup: true,
        notes: true,
        consultations: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            ...consultationSelect,
            visit: {
              select: { visitNumber: true, checkedInAt: true },
            },
          },
        },
      },
    });

    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found.' });
    }

    return res.json({ patient });
  } catch (err) {
    return next(err);
  }
});

router.post('/visits/:visitId', ...consultationAccess, async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!uuidPattern.test(visitId)) {
      return sendValidationError(res, 'A valid visit ID is required.');
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return sendValidationError(res, 'Consultation details must be provided as an object.');
    }

    const unknownField = Object.keys(req.body).find((field) => !consultationFields.includes(field));
    if (unknownField) {
      return sendValidationError(res, `Unexpected consultation field: ${unknownField}.`);
    }

    const { chiefComplaint } = req.body;
    if (typeof chiefComplaint !== 'string' || !chiefComplaint.trim() || chiefComplaint.trim().length > 2000) {
      return sendValidationError(res, 'Chief complaint is required and must not exceed 2,000 characters.');
    }

    const data = { chiefComplaint: chiefComplaint.trim() };
    for (const field of consultationFields.slice(1)) {
      const value = req.body[field];
      if (value === undefined || value === null || value === '') {
        data[field] = null;
      } else if (typeof value !== 'string' || value.length > 10000) {
        return sendValidationError(res, `${field} must be text no longer than 10,000 characters.`);
      } else {
        data[field] = value.trim() || null;
      }
    }

    const consultation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "visits" WHERE "id" = ${visitId} FOR UPDATE`;
      const visit = await tx.visit.findFirst({
        where: { id: visitId, status: { in: activeVisitStatuses } },
        select: { id: true, patientId: true },
      });
      if (!visit) {
        const error = new Error('No checked-in or in-progress visit was found.');
        error.status = 404;
        throw error;
      }

      const author = await tx.admin.findFirst({
        where: { id: req.user.id, role: req.user.role },
        select: { id: true },
      });
      if (!author) {
        const error = new Error('Authenticated staff or doctor account was not found.');
        error.status = 403;
        throw error;
      }

      const created = await tx.consultation.create({
        data: {
          ...data,
          visitId: visit.id,
          patientId: visit.patientId,
          authorId: author.id,
        },
        select: consultationSelect,
      });

      await tx.visit.update({
        where: { id: visit.id },
        data: { status: 'IN_PROGRESS' },
      });

      return created;
    });

    return res.status(201).json({ success: true, consultation });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A consultation has already been recorded for this visit.',
      });
    }
    return next(err);
  }
});

module.exports = router;
