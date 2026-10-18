const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
let postgresEnabled = false;
if (testDatabaseUrl) {
  const target = new URL(testDatabaseUrl);
  const databaseName = target.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/_test$/i.test(databaseName)) {
    throw new Error('Refusing PostgreSQL appointment tests: TEST_DATABASE_URL must target a local database ending in _test.');
  }
  process.env.DATABASE_URL = testDatabaseUrl;
  postgresEnabled = true;
}

const { randomUUID } = require('node:crypto');
const { clinicToday } = require('../src/utils/appointmentSlots');
const { JWT_SECRET } = require('../src/middleware/auth');
const jwt = require('jsonwebtoken');
const doctorIds = [randomUUID(), randomUUID()];
const appointmentIds = new Set();
const staffToken = jwt.sign({ id: randomUUID(), role: 'ADMIN' }, JWT_SECRET);
let prisma;
let server;
let request;

if (postgresEnabled) {
  prisma = require('../src/config/prisma');
}

function dateAfter(days) {
  const date = new Date(`${clinicToday()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function booking(doctorId = doctorIds[0], overrides = {}) {
  return {
    patientName: 'Synthetic PostgreSQL Test Patient',
    patientPhone: '+923001234567',
    serviceType: 'General Physician Consultation',
    doctorId,
    preferredDate: dateAfter(2),
    slotStart: '09:00',
    consentAgreed: true,
    ...overrides,
  };
}

async function createBooking(payload) {
  const response = await request('/appointments', { method: 'POST', body: payload });
  if (response.ok) appointmentIds.add((await response.clone().json()).appointmentId);
  return response;
}

before(async () => {
  if (!postgresEnabled) return;
  const app = require('express')();
  app.use(require('express').json());
  app.use('/api/appointments', require('../src/routes/appointments'));
  app.use('/api/doctors', require('../src/routes/doctors'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  request = (pathName, { method = 'GET', body, authenticated = false } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated) headers.Authorization = `Bearer ${staffToken}`;
    return fetch(`${baseUrl}${pathName}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  for (let index = 0; index < doctorIds.length; index++) {
    await prisma.doctor.create({
      data: {
        id: doctorIds[index],
        name: `Synthetic PostgreSQL Doctor ${index + 1}`,
        isActive: true,
        scheduleDays: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
        startTime: '09:00',
        endTime: '12:00',
        slotDurationMinutes: 30,
      },
    });
  }
});

after(async () => {
  if (postgresEnabled) {
    if (appointmentIds.size) {
      await prisma.appointment.deleteMany({ where: { id: { in: [...appointmentIds] } } });
    }
    await prisma.doctor.deleteMany({ where: { id: { in: doctorIds } } });
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
});

test('PostgreSQL accepts a valid synthetic booking', { skip: !postgresEnabled && 'Set TEST_DATABASE_URL to a local _test database.' }, async () => {
  const payload = booking(doctorIds[0], { preferredDate: dateAfter(3) });
  const response = await createBooking(payload);
  assert.equal(response.status, 201);
  const availability = await request(`/doctors/${doctorIds[0]}/availability?date=${payload.preferredDate}`);
  assert.equal(availability.status, 200);
  assert.equal((await availability.json()).slots.some((slot) => slot.slotStart === payload.slotStart), false);
});

test('PostgreSQL rejects a duplicate booking with HTTP 409', { skip: !postgresEnabled && 'Set TEST_DATABASE_URL to a local _test database.' }, async () => {
  const payload = booking(doctorIds[0], { preferredDate: dateAfter(4), slotStart: '09:30' });
  assert.equal((await createBooking(payload)).status, 201);
  assert.equal((await createBooking(payload)).status, 409);
});

test('PostgreSQL permits only one of two simultaneous requests for a slot', { skip: !postgresEnabled && 'Set TEST_DATABASE_URL to a local _test database.' }, async () => {
  const payload = booking(doctorIds[0], { preferredDate: dateAfter(5), slotStart: '10:00' });
  const responses = await Promise.all([createBooking(payload), createBooking(payload)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const rows = await prisma.appointment.count({
    where: {
      doctorId: doctorIds[0],
      appointmentDate: new Date(`${payload.preferredDate}T00:00:00.000Z`),
      slotStart: payload.slotStart,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
  });
  assert.equal(rows, 1);
});

test('PostgreSQL permits different doctors to book the same date and time', { skip: !postgresEnabled && 'Set TEST_DATABASE_URL to a local _test database.' }, async () => {
  const date = dateAfter(6);
  const responses = await Promise.all([
    createBooking(booking(doctorIds[0], { preferredDate: date, slotStart: '10:30' })),
    createBooking(booking(doctorIds[1], { preferredDate: date, slotStart: '10:30' })),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [201, 201]);
});

test('PostgreSQL cancellation releases the slot for a synthetic patient', { skip: !postgresEnabled && 'Set TEST_DATABASE_URL to a local _test database.' }, async () => {
  const date = dateAfter(7);
  const booked = await createBooking(booking(doctorIds[0], { preferredDate: date, slotStart: '11:00' }));
  const id = (await booked.json()).appointmentId;
  assert.equal((await request(`/appointments/${id}/status`, {
    method: 'PATCH',
    authenticated: true,
    body: { status: 'CANCELLED' },
  })).status, 200);
  assert.equal((await createBooking(booking(doctorIds[0], { preferredDate: date, slotStart: '11:00' }))).status, 201);
});

test('PostgreSQL protects rescheduling and cancelled appointment reactivation', { skip: !postgresEnabled && 'Set TEST_DATABASE_URL to a local _test database.' }, async () => {
  const date = dateAfter(8);
  const source = await createBooking(booking(doctorIds[0], { preferredDate: date }));
  const sourceId = (await source.json()).appointmentId;
  const competitor = await createBooking(booking(doctorIds[0], { preferredDate: date, slotStart: '09:30' }));
  const competitorId = (await competitor.json()).appointmentId;

  assert.equal((await request(`/appointments/${sourceId}/reschedule`, {
    method: 'PATCH',
    authenticated: true,
    body: { preferredDate: date, slotStart: '09:30' },
  })).status, 409);
  assert.equal((await request(`/appointments/${sourceId}/status`, {
    method: 'PATCH',
    authenticated: true,
    body: { status: 'CANCELLED' },
  })).status, 200);
  assert.equal((await createBooking(booking(doctorIds[0], { preferredDate: date, slotStart: '09:00' }))).status, 201);
  assert.equal((await request(`/appointments/${sourceId}/status`, {
    method: 'PATCH',
    authenticated: true,
    body: { status: 'CONFIRMED' },
  })).status, 409);
  assert.equal((await request(`/appointments/${competitorId}/reschedule`, {
    method: 'PATCH',
    authenticated: true,
    body: { preferredDate: dateAfter(9), slotStart: '10:00' },
  })).status, 200);
});

test('PostgreSQL-backed API rejects invalid dates, doctors, and off-schedule times', { skip: !postgresEnabled && 'Set TEST_DATABASE_URL to a local _test database.' }, async () => {
  assert.equal((await createBooking(booking(doctorIds[0], { preferredDate: '2026-02-30' }))).status, 400);
  assert.equal((await createBooking(booking(randomUUID()))).status, 404);
  assert.equal((await createBooking(booking(doctorIds[0], { preferredDate: dateAfter(10), slotStart: '12:00' }))).status, 400);
});
