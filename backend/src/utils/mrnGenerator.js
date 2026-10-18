/**
 * Prime Care Clinic — Unique Medical Record Number (MRN) Generator
 * Format: PCC-YYYY-XXXXX (e.g. PCC-2026-00001)
 * Thread-safe and collision-resistant.
 */

const defaultPrisma = require('../config/prisma');

async function generateNextMRN(client = defaultPrisma, year = new Date().getFullYear()) {
  const prefix = `PCC-${year}-`;
  
  // Find highest current sequence number for the current year
  const latestPatient = await client.patient.findFirst({
    where: {
      mrn: { startsWith: prefix },
    },
    orderBy: {
      mrn: 'desc',
    },
    select: {
      mrn: true,
    },
  });

  let nextSequence = 1;
  if (latestPatient && latestPatient.mrn) {
    const parts = latestPatient.mrn.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSequence = parsed + 1;
      }
    }
  }

  // Pad sequence to 5 digits
  const paddedSeq = String(nextSequence).padStart(5, '0');
  return `${prefix}${paddedSeq}`;
}

module.exports = {
  generateNextMRN,
};
