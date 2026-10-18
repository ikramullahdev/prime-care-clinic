const assert = require('node:assert/strict');
const http = require('node:http');
const { after, test } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
const { JWT_SECRET } = require('../src/middleware/auth');
const appointmentRoutes = require('../src/routes/appointments');
const doctorRoutes = require('../src/routes/doctors');
const { clinicToday } = require('../src/utils/appointmentSlots');

const doctorId = 'c814255a-0cba-4c18-9f66-2ea9818d2b61';
const otherDoctorId = 'e89c4a03-1865-4e34-91e0-5ce14a5a65bf';
const staffToken = jwt.sign({ id: 'synthetic-staff', role: 'ADMIN' }, JWT_SECRET);
let activeServer;

function dateAfter(days) {
  const date = new Date(`${clinicToday()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function installPrismaMock() {
  const state = {
    doctors: [
      { id: doctorId, name: 'Synthetic Doctor One', isActive: true, scheduleDays: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat', startTime: '09:00', endTime: '11:00', slotDurationMinutes: 30 },
      { id: otherDoctorId, name: 'Synthetic Doctor Two', isActive: true, scheduleDays: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat', startTime: '09:00', endTime: '11:00', slotDurationMinutes: 30 },
    ],
    appointments: [],
    nextId: 0,
    databaseConstraintConflicts: 0,
  };
  const originals = [];
  const replace = (target, key, value) => {
    originals.push({ target, key, value: target[key] });
    target[key] = value;
  };
  const matches = (appointment, where) => (
    (!where.id || appointment.id === where.id || (where.id.not && appointment.id !== where.id.not)) &&
    (!where.doctorId || appointment.doctorId === where.doctorId) &&
    (!where.appointmentDate || appointment.appointmentDate.getTime() === where.appointmentDate.getTime()) &&
    (!where.slotStart || appointment.slotStart === where.slotStart) &&
    (!where.status || appointment.status === where.status ||
      (where.status.in && where.status.in.includes(appointment.status)))
  );
  const uniqueConflict = (candidate, omitId) => state.appointments.some((appointment) => (
    appointment.id !== omitId &&
    ['PENDING', 'CONFIRMED'].includes(appointment.status) &&
    ['PENDING', 'CONFIRMED'].includes(candidate.status) &&
    appointment.doctorId === candidate.doctorId &&
    appointment.appointmentDate.getTime() === candidate.appointmentDate.getTime() &&
    appointment.slotStart === candidate.slotStart
  ));

  replace(prisma.doctor, 'findUnique', async ({ where }) => (
    clone(state.doctors.find((doctor) => doctor.id === where.id) || null)
  ));
  replace(prisma.doctor, 'findMany', async () => clone(state.doctors.filter((doctor) => doctor.isActive)));
  replace(prisma.appointment, 'findFirst', async ({ where }) => {
    if (state.forceReservationRace && where.appointmentDate) return null;
    const result = clone(state.appointments.find((appointment) => matches(appointment, where)) || null);
    return result;
  });
  replace(prisma.appointment, 'findMany', async ({ where }) => (
    clone(state.appointments.filter((appointment) => matches(appointment, where)))
  ));
  replace(prisma.appointment, 'findUnique', async ({ where }) => (
    clone(state.appointments.find((appointment) => appointment.id === where.id) || null)
  ));
  replace(prisma.appointment, 'create', async ({ data }) => {
    const candidate = { id: `synthetic-appointment-${++state.nextId}`, ...clone(data) };
    if (uniqueConflict(candidate)) {
      state.databaseConstraintConflicts++;
      const error = new Error('Unique constraint failed');
      error.code = 'P2002';
      error.meta = { target: ['doctorId', 'appointmentDate', 'slotStart'] };
      throw error;
    }
    state.appointments.push(candidate);
    const doctor = state.doctors.find((item) => item.id === candidate.doctorId);
    return clone({ ...candidate, doctor: { name: doctor.name } });
  });
  replace(prisma.appointment, 'update', async ({ where, data }) => {
    const appointment = state.appointments.find((item) => item.id === where.id);
    if (!appointment) {
      const error = new Error('Record not found');
      error.code = 'P2025';
      throw error;
    }
    const candidate = { ...appointment, ...clone(data) };
    if (uniqueConflict(candidate, appointment.id)) {
      const error = new Error('Unique constraint failed');
      error.code = 'P2002';
      error.meta = { target: ['doctorId', 'appointmentDate', 'slotStart'] };
      throw error;
    }
    Object.assign(appointment, candidate);
    return clone(appointment);
  });

  return {
    state,
    restore() {
      for (const { target, key, value } of originals.reverse()) target[key] = value;
    },
  };
}

async function withApi(callback) {
  const mock = installPrismaMock();
  const app = express();
  app.use(express.json());
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/doctors', doctorRoutes);
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    return res.status(err.status || 500).json({ error: err.name || 'RequestError', message: err.message });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  activeServer = server;
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, { method = 'GET', body, authenticated = false } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated) headers.Authorization = `Bearer ${staffToken}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  const booking = (overrides = {}) => ({
    patientName: 'Synthetic Test Patient',
    patientPhone: '+923001234567',
    serviceType: 'General Physician Consultation',
    doctorId,
    preferredDate: dateAfter(2),
    slotStart: '09:00',
    consentAgreed: true,
    ...overrides,
  });

  try {
    await callback({ request, state: mock.state, booking });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    activeServer = null;
    mock.restore();
  }

}

after(async () => {
  if (activeServer?.listening) await new Promise((resolve) => activeServer.close(resolve));
  await prisma.$disconnect();
});

test('mocked API accepts a valid booking and rejects the same slot with HTTP 409', async () => {
  await withApi(async ({ request, booking, state }) => {
    const first = await request('/appointments', { method: 'POST', body: booking() });
    assert.equal(first.status, 201);
    const appointment = await first.json();
    assert.equal(appointment.slotStart, '09:00');
    assert.equal(state.appointments.length, 1);

    const duplicate = await request('/appointments', { method: 'POST', body: booking() });
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).message, /slot has just been booked/i);
  });
});

test('mocked concurrent bookings allow only one request and different doctors can share a time', async () => {
  await withApi(async ({ request, booking, state }) => {
    state.forceReservationRace = true;
    const simultaneous = await Promise.all([
      request('/appointments', { method: 'POST', body: booking() }),
      request('/appointments', { method: 'POST', body: booking() }),
    ]);
    state.forceReservationRace = false;
    assert.deepEqual(simultaneous.map((response) => response.status).sort(), [201, 409]);
    assert.equal(state.appointments.filter((item) => item.status === 'PENDING').length, 1);
    assert.equal(state.databaseConstraintConflicts, 1, 'the simulated database unique constraint rejects the raced insert');

    const anotherDoctor = await request('/appointments', {
      method: 'POST',
      body: booking({ doctorId: otherDoctorId }),
    });
    assert.equal(anotherDoctor.status, 201);
  });
});

test('mocked cancellation releases a slot; rescheduling and reactivation validate collisions', async () => {
  await withApi(async ({ request, booking, state }) => {
    const first = await request('/appointments', { method: 'POST', body: booking() });
    const firstData = await first.json();
    const cancel = await request(`/appointments/${firstData.appointmentId}/status`, {
      method: 'PATCH',
      authenticated: true,
      body: { status: 'CANCELLED' },
    });
    assert.equal(cancel.status, 200);

    const reused = await request('/appointments', { method: 'POST', body: booking() });
    assert.equal(reused.status, 201);
    const reusedData = await reused.json();

    const reschedule = await request(`/appointments/${firstData.appointmentId}/reschedule`, {
      method: 'PATCH',
      authenticated: true,
      body: { preferredDate: dateAfter(2), slotStart: '09:30' },
    });
    assert.equal(reschedule.status, 200);
    assert.equal(state.appointments.find((item) => item.id === firstData.appointmentId).status, 'CONFIRMED');

    const blockedReschedule = await request(`/appointments/${reusedData.appointmentId}/reschedule`, {
      method: 'PATCH',
      authenticated: true,
      body: { preferredDate: dateAfter(2), slotStart: '09:30' },
    });
    assert.equal(blockedReschedule.status, 409);

    await request(`/appointments/${firstData.appointmentId}/status`, {
      method: 'PATCH',
      authenticated: true,
      body: { status: 'CANCELLED' },
    });
    const replacement = await request('/appointments', {
      method: 'POST',
      body: booking({ slotStart: '09:30' }),
    });
    assert.equal(replacement.status, 201);

    const reactivate = await request(`/appointments/${firstData.appointmentId}/status`, {
      method: 'PATCH',
      authenticated: true,
      body: { status: 'CONFIRMED' },
    });
    assert.equal(reactivate.status, 409);
  });
});

test('mocked availability and booking reject invalid dates, inactive/unknown doctors, and out-of-schedule slots', async () => {
  await withApi(async ({ request, booking }) => {
    const invalidDate = await request('/appointments', {
      method: 'POST',
      body: booking({ preferredDate: '2026-02-30' }),
    });
    assert.equal(invalidDate.status, 400);

    const unknownDoctor = await request('/appointments', {
      method: 'POST',
      body: booking({ doctorId: '00000000-0000-4000-8000-000000000000' }),
    });
    assert.equal(unknownDoctor.status, 404);

    const outsideSchedule = await request('/appointments', {
      method: 'POST',
      body: booking({ slotStart: '11:00' }),
    });
    assert.equal(outsideSchedule.status, 400);

    const available = await request(`/doctors/${doctorId}/availability?date=${dateAfter(2)}`);
    assert.equal(available.status, 200);
    assert.deepEqual((await available.json()).slots.map((slot) => slot.slotStart), ['09:00', '09:30', '10:00', '10:30']);
  });
});
