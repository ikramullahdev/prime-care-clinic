const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  getDoctorSlots,
  normalizeDate,
  parseSlotStart,
  slotRequestError,
  validateBookableDate,
} = require('../src/utils/appointmentSlots');

const doctor = {
  scheduleDays: 'Mon,Wed',
  startTime: '09:00',
  endTime: '10:10',
  slotDurationMinutes: 30,
};

test('generates only full-duration slots inside the doctor schedule', () => {
  assert.deepEqual(
    getDoctorSlots(doctor, '2026-10-19', new Date('2026-10-18T12:00:00.000Z')).map((slot) => slot.slotStart),
    ['09:00', '09:30']
  );
  assert.deepEqual(getDoctorSlots(doctor, '2026-10-20', new Date('2026-10-18T12:00:00.000Z')), []);
});

test('rejects invalid dates and normalizes supported legacy slot labels', () => {
  assert.equal(normalizeDate('2026-02-30'), null);
  assert.equal(parseSlotStart('18:20'), '18:20');
  assert.equal(parseSlotStart('6:20 PM - 6:50 PM'), '18:20');
  assert.equal(parseSlotStart('6:20 PM - 6:50 AM'), null);
  assert.equal(parseSlotStart('25:20'), null);
});

test('enforces the appointment date horizon and doctor schedule for booking', () => {
  const now = new Date('2026-10-18T12:00:00.000Z');
  assert.equal(validateBookableDate('2026-10-17', now).error, 'Appointment date cannot be in the past.');
  assert.equal(validateBookableDate('2026-12-18', now).error, 'Appointments can only be scheduled up to 60 days in advance.');
  assert.equal(slotRequestError('2026-10-19', '09:30', doctor, now), null);
  assert.match(slotRequestError('2026-10-20', '09:30', doctor, now), /outside this doctor’s schedule/);
  assert.match(slotRequestError('2026-10-19', '10:00', doctor, now), /outside this doctor’s schedule/);
});

test('same-day availability excludes slots that have already started in the clinic timezone', () => {
  const now = new Date('2026-10-19T04:00:00.000Z');
  assert.deepEqual(
    getDoctorSlots(doctor, '2026-10-19', now).map((slot) => slot.slotStart),
    ['09:30']
  );
});
