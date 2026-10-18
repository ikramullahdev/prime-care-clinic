/**
 * Prime Care Clinic — Database Seed Script
 * Populates initial Administrator, Doctor profile, and baseline appointment records.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { normalizeDate, parseSlotStart, toDateColumn } = require('../src/utils/appointmentSlots');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Prime Care Clinic database...');

  // 1. Seed Administrator
  const adminEmail = 'admin@primecare.pk';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('AdminPrimeCare2026!', salt);

  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: {
      email: adminEmail,
      name: 'Clinic Administrator',
      passwordHash,
      role: 'ADMIN',
    },
  });
  console.log(`Administrator created/verified: ${admin.email}`);

  // 2. Seed Doctor
  // Note: Dr. Muhammad Farhan Khan is listed with isVerified: false until clinic confirms credentials
  let doctor = await prisma.doctor.findFirst({
    where: { name: 'Dr. Muhammad Farhan Khan' }
  });

  if (!doctor) {
    doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Muhammad Farhan Khan',
        title: 'Consulting Physician',
        specialty: 'General Medicine & Diabetes Care',
        bio: 'Consulting physician providing primary healthcare assessments and diabetes ongoing management guidance.',
        isVerified: false, // Explicitly marked unverified per Master Prompt
        isActive: true,
        scheduleDays: 'Mon,Tue,Wed,Thu,Sat',
        startTime: '17:30',
        endTime: '22:00',
        slotDurationMinutes: 20,
      },
    });
    console.log(`Doctor profile created: ${doctor.name}`);
  } else {
    console.log(`Doctor profile exists: ${doctor.name}`);
  }

  // 3. Seed Appointments (Diverse statuses for testing)
  const existingCount = await prisma.appointment.count();
  if (existingCount === 0) {
    const demoAppointments = [
      {
        patientName: 'Khurram Shehzad',
        patientPhone: '0333 5123456',
        patientEmail: 'khurram@example.com',
        serviceType: 'Diabetes Care & Management',
        doctorId: doctor.id,
        preferredDate: '2026-10-18',
        preferredTime: '6:30 PM - 7:00 PM',
        status: 'PENDING',
        notes: 'Routine HbA1c review and medication titration inquiry.',
        consentAgreed: true,
      },
      {
        patientName: 'Amina Begum',
        patientPhone: '0300 9876543',
        patientEmail: 'amina.b@example.com',
        serviceType: 'General Physician Consultation',
        doctorId: doctor.id,
        preferredDate: '2026-10-16',
        preferredTime: '7:00 PM - 7:30 PM',
        status: 'CONFIRMED',
        notes: 'Persistent seasonal cough and fever for 3 days.',
        consentAgreed: true,
      },
      {
        patientName: 'Zahid Mahmood',
        patientPhone: '0312 4433221',
        patientEmail: 'zahid.m@example.com',
        serviceType: 'Diabetes Care & Management',
        doctorId: doctor.id,
        preferredDate: '2026-10-17',
        preferredTime: '8:00 PM - 8:30 PM',
        status: 'CONFIRMED',
        notes: 'Initial consultation regarding fasting glucose levels.',
        consentAgreed: true,
      },
      {
        patientName: 'Muhammad Usman',
        patientPhone: '0345 6677889',
        patientEmail: null,
        serviceType: 'General Physician Consultation',
        doctorId: doctor.id,
        preferredDate: '2026-10-15',
        preferredTime: '6:00 PM - 6:30 PM',
        status: 'COMPLETED',
        notes: 'Blood pressure check and prescription renewal.',
        consentAgreed: true,
      },
      {
        patientName: 'Saima Noor',
        patientPhone: '0321 8899001',
        patientEmail: 'saima.noor@example.com',
        serviceType: 'General Physician Consultation',
        doctorId: doctor.id,
        preferredDate: '2026-10-14',
        preferredTime: '7:30 PM - 8:00 PM',
        status: 'CANCELLED',
        notes: 'Patient rescheduled due to personal travel conflict.',
        consentAgreed: true,
      },
    ];

    for (const appt of demoAppointments) {
      const date = normalizeDate(appt.preferredDate);
      const slotStart = parseSlotStart(appt.preferredTime);
      if (!date || !slotStart) {
        throw new Error('Seed appointment contains an invalid date or time slot.');
      }
      await prisma.appointment.create({
        data: {
          ...appt,
          appointmentDate: toDateColumn(date),
          slotStart,
        },
      });
    }
    console.log(`Seeded ${demoAppointments.length} initial test appointments.`);
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
