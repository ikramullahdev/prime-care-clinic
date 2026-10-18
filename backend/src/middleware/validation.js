/**
 * Server-side Request Validation Middleware
 */

const { normalizeDate, parseSlotStart } = require('../utils/appointmentSlots');

function validateAppointmentRequest(req, res, next) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { patientName, patientPhone, patientEmail, serviceType, doctorId, preferredDate, consentAgreed } = body;
  const slotValue = body.slotStart || body.preferredTime;
  const errors = [];

  if (typeof patientName !== 'string' || patientName.trim().length < 2 || patientName.trim().length > 120) {
    errors.push('Patient name is required and must be between 2 and 120 characters.');
  }

  if (typeof patientPhone !== 'string' || patientPhone.length > 32) {
    errors.push('A valid contact telephone number is required.');
  } else {
    const phoneClean = patientPhone.replace(/[\s\-\(\)]/g, '');
    const phoneRegex = /^(\+92|92|0)?[3][0-9]{9}$|^[\+]?[0-9]{8,15}$/;
    if (!phoneRegex.test(phoneClean)) {
      errors.push('Please provide a valid Pakistani or international mobile number.');
    }
  }

  const validServices = [
    'General Physician Consultation',
    'Diabetes Care & Management',
    'Follow-up Visit'
  ];
  if (!serviceType || !validServices.includes(serviceType)) {
    errors.push('Please select a valid consultation service.');
  }

  if (typeof preferredDate !== 'string' || !preferredDate) {
    errors.push('Preferred appointment date is required.');
  } else if (!normalizeDate(preferredDate)) {
    errors.push('Appointment date must be a valid calendar date (YYYY-MM-DD).');
  }

  if (typeof doctorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(doctorId)) {
    errors.push('Please select a valid doctor.');
  }
  if (!parseSlotStart(slotValue)) errors.push('Choose a valid appointment time slot.');

  if (patientEmail !== undefined && patientEmail !== null &&
      (typeof patientEmail !== 'string' || patientEmail.trim().length > 254 ||
       (patientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail.trim())))) {
    errors.push('Please provide a valid email address.');
  }

  if (body.notes !== undefined && body.notes !== null &&
      (typeof body.notes !== 'string' || body.notes.length > 2000)) {
    errors.push('Additional notes must be text no longer than 2000 characters.');
  }

  if (consentAgreed !== true && consentAgreed !== 'true') {
    errors.push('Consent to clinic terms and policies is required to submit a request.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'ValidationError',
      errors,
      message: errors[0],
    });
  }

  body.slotStart = parseSlotStart(slotValue);
  next();
}

function validateLoginRequest(req, res, next) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Both email and password are required.',
    });
  }
  next();
}

/**
 * Validate Patient Registration payload
 */
function validatePatientRegistration(req, res, next) {
  const {
    fullName,
    gender,
    phone,
    email,
    dateOfBirth,
    isAgeEstimated,
    estimatedAge,
    bloodGroup,
    emergencyContactPhone,
  } = req.body;
  const errors = [];

  // Full name
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    errors.push('Full patient name is required (minimum 2 characters).');
  }

  // Gender
  const validGenders = ['MALE', 'FEMALE', 'OTHER'];
  if (!gender || !validGenders.includes(gender)) {
    errors.push('Gender must be one of: MALE, FEMALE, OTHER.');
  }

  // Phone
  if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
    errors.push('Valid contact phone number is required.');
  } else {
    const normalized = normalizePhone(phone);
    if (normalized.length < 9) {
      errors.push('Please enter a valid Pakistani mobile or landline number.');
    }
  }

  // DOB or Estimated Age
  const isEstimated = isAgeEstimated === true || isAgeEstimated === 'true';
  if (isEstimated) {
    const parsedAge = parseInt(estimatedAge, 10);
    if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 130) {
      errors.push('Estimated age must be a valid number between 0 and 130 years.');
    }
  } else {
    if (!dateOfBirth) {
      errors.push('Date of birth is required when age is not estimated.');
    } else {
      const dobDate = new Date(dateOfBirth);
      const now = new Date();
      if (isNaN(dobDate.getTime())) {
        errors.push('Date of birth must be a valid calendar date.');
      } else if (dobDate > now) {
        errors.push('Date of birth cannot be in the future.');
      }
    }
  }

  // Email format (if provided)
  if (email && email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      errors.push('Email address is invalid.');
    }
  }

  // Blood group (if provided)
  const validBloods = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (bloodGroup && bloodGroup.trim() && !validBloods.includes(bloodGroup.trim().toUpperCase())) {
    errors.push(`Invalid blood group. Valid options: ${validBloods.join(', ')}`);
  }

  // Emergency contact phone (if provided)
  if (emergencyContactPhone && emergencyContactPhone.trim()) {
    const normalizedEC = normalizePhone(emergencyContactPhone);
    if (normalizedEC.length < 7) {
      errors.push('Emergency contact phone number is invalid.');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'ValidationError',
      errors,
      message: errors[0],
    });
  }

  next();
}

/**
 * Validate Patient Update payload
 */
function validatePatientUpdate(req, res, next) {
  const {
    fullName,
    gender,
    phone,
    email,
    dateOfBirth,
    isAgeEstimated,
    estimatedAge,
    bloodGroup,
  } = req.body;
  const errors = [];

  if (fullName !== undefined) {
    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      errors.push('Full patient name must be at least 2 characters.');
    }
  }

  if (gender !== undefined) {
    const validGenders = ['MALE', 'FEMALE', 'OTHER'];
    if (!validGenders.includes(gender)) {
      errors.push('Gender must be one of: MALE, FEMALE, OTHER.');
    }
  }

  if (phone !== undefined) {
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 9) {
      errors.push('Please enter a valid telephone number.');
    }
  }

  if (email !== undefined && email !== null && email.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      errors.push('Email address is invalid.');
    }
  }

  if (isAgeEstimated !== undefined) {
    const isEstimated = isAgeEstimated === true || isAgeEstimated === 'true';
    if (isEstimated && estimatedAge !== undefined) {
      const parsedAge = parseInt(estimatedAge, 10);
      if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 130) {
        errors.push('Estimated age must be between 0 and 130.');
      }
    }
  }

  if (bloodGroup !== undefined && bloodGroup !== null && bloodGroup.trim() !== '') {
    const validBloods = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!validBloods.includes(bloodGroup.trim().toUpperCase())) {
      errors.push(`Invalid blood group. Valid options: ${validBloods.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'ValidationError',
      errors,
      message: errors[0],
    });
  }

  next();
}

module.exports = {
  validateAppointmentRequest,
  validateLoginRequest,
  validatePatientRegistration,
  validatePatientUpdate,
};
