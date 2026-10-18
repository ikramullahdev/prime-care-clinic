/**
 * Prime Care Clinic & Diabetes Center
 * Patient Registration & Demographics Management Routes
 */

const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  validatePatientRegistration,
  validatePatientUpdate,
} = require('../middleware/validation');
const { normalizePhone, formatPhoneDisplay } = require('../utils/phoneNormalizer');
const { generateNextMRN } = require('../utils/mrnGenerator');

/**
 * 1. POST /api/patients/check-duplicate
 * Checks if a patient with the given phone or name already exists in the system
 * Non-silent duplicate prevention mechanism
 */
router.post('/check-duplicate', requireAuth, async (req, res, next) => {
  try {
    const { phone, fullName } = req.body;
    if (!phone && !fullName) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Please provide either a phone number or patient name to check.',
      });
    }

    const whereConditions = [];

    if (phone) {
      const normalized = normalizePhone(phone);
      const rawDigits = phone.replace(/\D/g, '');
      whereConditions.push({ phone: normalized });
      whereConditions.push({ phone: { contains: rawDigits.length >= 7 ? rawDigits.slice(-7) : rawDigits } });
    }

    if (fullName && fullName.trim().length >= 3) {
      whereConditions.push({
        fullName: {
          contains: fullName.trim(),
          mode: 'insensitive',
        },
      });
    }

    const candidates = await prisma.patient.findMany({
      where: {
        OR: whereConditions,
      },
      select: {
        id: true,
        mrn: true,
        fullName: true,
        gender: true,
        phone: true,
        dateOfBirth: true,
        isAgeEstimated: true,
        estimatedAge: true,
        isActive: true,
        createdAt: true,
      },
      take: 5,
    });

    return res.json({
      hasPossibleDuplicate: candidates.length > 0,
      count: candidates.length,
      matches: candidates,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. POST /api/patients
 * Register a new patient
 * Enforces validation, duplicate prevention with staff override, and MRN generation
 */
router.post('/', requireAuth, validatePatientRegistration, async (req, res, next) => {
  try {
    const {
      fullName,
      gender,
      phone,
      email,
      dateOfBirth,
      isAgeEstimated,
      estimatedAge,
      bloodGroup,
      address,
      city,
      emergencyContactName,
      emergencyContactRelation,
      emergencyContactPhone,
      medicalNotes,
      notes,
      forceConfirmDuplicate,
    } = req.body;

    const normalized = normalizePhone(phone);
    const rawDigits = phone.replace(/\D/g, '');

    // Check for exact phone duplicate if not explicitly confirmed
    if (!forceConfirmDuplicate) {
      const existingDuplicate = await prisma.patient.findFirst({
        where: {
          OR: [
            { phone: normalized },
            { phone: phone.trim() },
            { phone: { contains: rawDigits.length >= 7 ? rawDigits.slice(-7) : rawDigits } },
          ],
        },
        select: {
          id: true,
          mrn: true,
          fullName: true,
          phone: true,
          gender: true,
          dateOfBirth: true,
          isAgeEstimated: true,
          estimatedAge: true,
          createdAt: true,
        },
      });

      if (existingDuplicate) {
        return res.status(409).json({
          error: 'DuplicatePatientDetected',
          message: `A patient with contact number ${phone} is already registered under MRN: ${existingDuplicate.mrn} (${existingDuplicate.fullName}).`,
          requiresConfirmation: true,
          duplicate: existingDuplicate,
        });
      }
    }

    // Determine estimated age vs exact DOB
    const isEstimated = isAgeEstimated === true || isAgeEstimated === 'true';
    let finalDOB = null;
    let finalEstimatedAge = null;

    if (isEstimated) {
      finalEstimatedAge = parseInt(estimatedAge, 10);
      const approxYear = new Date().getFullYear() - finalEstimatedAge;
      finalDOB = new Date(approxYear, 0, 1);
    } else if (dateOfBirth) {
      finalDOB = new Date(dateOfBirth);
      const birthYear = finalDOB.getFullYear();
      finalEstimatedAge = new Date().getFullYear() - birthYear;
    }

    // Combine address & city cleanly
    let fullAddress = address && address.trim() ? address.trim() : null;
    if (city && city.trim() && fullAddress && !fullAddress.toLowerCase().includes(city.trim().toLowerCase())) {
      fullAddress = `${fullAddress}, ${city.trim()}`;
    } else if (city && city.trim() && !fullAddress) {
      fullAddress = city.trim();
    }

    const clinicalNotes = medicalNotes || notes;

    // Atomic transaction for safe MRN generation and record insertion
    const newPatient = await prisma.$transaction(async (tx) => {
      const mrn = await generateNextMRN(tx);

      const created = await tx.patient.create({
        data: {
          mrn,
          fullName: fullName.trim(),
          gender,
          phone: normalized,
          email: email && email.trim() ? email.trim().toLowerCase() : null,
          dateOfBirth: finalDOB,
          isAgeEstimated: isEstimated,
          estimatedAge: finalEstimatedAge,
          bloodGroup: bloodGroup ? bloodGroup.trim().toUpperCase() : null,
          address: fullAddress,
          emergencyContactName: emergencyContactName && emergencyContactName.trim() ? emergencyContactName.trim() : null,
          emergencyContactRelation: emergencyContactRelation && emergencyContactRelation.trim() ? emergencyContactRelation.trim() : null,
          emergencyContactPhone: emergencyContactPhone && emergencyContactPhone.trim() ? normalizePhone(emergencyContactPhone) : null,
          notes: clinicalNotes && clinicalNotes.trim() ? clinicalNotes.trim() : null,
          isActive: true,
          createdById: req.user.id,
          updatedById: req.user.id,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          updatedBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      // If linking an existing unlinked appointment upon registration
      if (req.body.linkAppointmentId) {
        await tx.appointment.update({
          where: { id: req.body.linkAppointmentId },
          data: { patientId: created.id },
        });
      }

      return created;
    });

    return res.status(201).json({
      success: true,
      message: `Patient registered successfully with MRN ${newPatient.mrn}.`,
      patient: newPatient,
    });
  } catch (err) {
    // Unique constraint violation fallback for MRN
    if (err.code === 'P2002' && err.meta && err.meta.target && err.meta.target.includes('mrn')) {
      return res.status(409).json({
        error: 'MRNCollision',
        message: 'A collision occurred while generating the MRN. Please submit the form again.',
      });
    }
    next(err);
  }
});

/**
 * 3. GET /api/patients
 * List patients with pagination, search, and status filters
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      search = '',
      status = 'all',
      gender,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    // Filter by Active status
    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    // Filter by Gender
    if (gender && ['MALE', 'FEMALE', 'OTHER'].includes(gender.toUpperCase())) {
      where.gender = gender.toUpperCase();
    }

    // Search by MRN, Name, Phone
    if (search && search.trim()) {
      const term = search.trim();
      const rawDigits = term.replace(/\D/g, '');

      const searchConditions = [
        { mrn: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
      ];

      if (rawDigits.length >= 4) {
        searchConditions.push({ phone: { contains: rawDigits } });
      }

      where.OR = searchConditions;
    }

    const [total, patients] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy === 'fullName' || sortBy === 'mrn' ? sortBy : 'createdAt']:
            sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc',
        },
        include: {
          createdBy: {
            select: { id: true, name: true, role: true },
          },
          updatedBy: {
            select: { id: true, name: true, role: true },
          },
          _count: {
            select: { appointments: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return res.json({
      patients,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. GET /api/patients/:id
 * Retrieve patient detailed profile, audit trail, and linked appointment history
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if queried by MRN or UUID
    const isMrn = id.toUpperCase().startsWith('PCC-');
    const where = isMrn ? { mrn: id.toUpperCase() } : { id };

    const patient = await prisma.patient.findUnique({
      where,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        updatedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        appointments: {
          orderBy: { preferredDate: 'desc' },
          include: {
            doctor: {
              select: { id: true, name: true, specialty: true },
            },
          },
        },
      },
    });

    if (!patient) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Patient with identifier '${id}' was not found.`,
      });
    }

    return res.json({
      patient,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 5. PATCH /api/patients/:id
 * Update patient demographics and details
 * Records audit information on who modified the record
 */
router.patch('/:id', requireAuth, validatePatientUpdate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      gender,
      phone,
      email,
      dateOfBirth,
      isAgeEstimated,
      estimatedAge,
      bloodGroup,
      address,
      city,
      emergencyContactName,
      emergencyContactRelation,
      emergencyContactPhone,
      medicalNotes,
      notes,
      isActive,
    } = req.body;

    // Verify patient exists
    const existingPatient = await prisma.patient.findUnique({
      where: { id },
    });

    if (!existingPatient) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Patient with ID '${id}' was not found.`,
      });
    }

    const updateData = {
      updatedById: req.user.id,
    };

    if (fullName !== undefined) updateData.fullName = fullName.trim();
    if (gender !== undefined) updateData.gender = gender;
    if (phone !== undefined) {
      updateData.phone = normalizePhone(phone);
    }
    if (email !== undefined) {
      updateData.email = email && email.trim() ? email.trim().toLowerCase() : null;
    }
    if (bloodGroup !== undefined) {
      updateData.bloodGroup = bloodGroup && bloodGroup.trim() ? bloodGroup.trim().toUpperCase() : null;
    }
    if (address !== undefined) {
      let fullAddress = address && address.trim() ? address.trim() : null;
      if (city && city.trim() && fullAddress && !fullAddress.toLowerCase().includes(city.trim().toLowerCase())) {
        fullAddress = `${fullAddress}, ${city.trim()}`;
      } else if (city && city.trim() && !fullAddress) {
        fullAddress = city.trim();
      }
      updateData.address = fullAddress;
    }
    if (emergencyContactName !== undefined) {
      updateData.emergencyContactName = emergencyContactName && emergencyContactName.trim() ? emergencyContactName.trim() : null;
    }
    if (emergencyContactRelation !== undefined) {
      updateData.emergencyContactRelation = emergencyContactRelation && emergencyContactRelation.trim() ? emergencyContactRelation.trim() : null;
    }
    if (emergencyContactPhone !== undefined) {
      updateData.emergencyContactPhone = emergencyContactPhone && emergencyContactPhone.trim() ? normalizePhone(emergencyContactPhone) : null;
    }
    if (medicalNotes !== undefined || notes !== undefined) {
      const finalNotes = medicalNotes !== undefined ? medicalNotes : notes;
      updateData.notes = finalNotes && finalNotes.trim() ? finalNotes.trim() : null;
    }

    // Handle Active/Inactive status changes
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    // Handle DOB / Estimated Age
    if (isAgeEstimated !== undefined) {
      const isEst = isAgeEstimated === true || isAgeEstimated === 'true';
      updateData.isAgeEstimated = isEst;

      if (isEst && estimatedAge !== undefined) {
        const estAgeNum = parseInt(estimatedAge, 10);
        updateData.estimatedAge = estAgeNum;
        const approxYear = new Date().getFullYear() - estAgeNum;
        updateData.dateOfBirth = new Date(approxYear, 0, 1);
      } else if (!isEst && dateOfBirth) {
        const dobDate = new Date(dateOfBirth);
        updateData.dateOfBirth = dobDate;
        updateData.estimatedAge = new Date().getFullYear() - dobDate.getFullYear();
      }
    } else if (dateOfBirth) {
      const dobDate = new Date(dateOfBirth);
      updateData.dateOfBirth = dobDate;
      updateData.estimatedAge = new Date().getFullYear() - dobDate.getFullYear();
      updateData.isAgeEstimated = false;
    }

    const updatedPatient = await prisma.patient.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        updatedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return res.json({
      success: true,
      message: `Patient ${updatedPatient.fullName} (${updatedPatient.mrn}) updated successfully.`,
      patient: updatedPatient,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
