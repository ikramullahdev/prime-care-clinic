const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../src/middleware/auth');
const prisma = require('../src/config/prisma');
const diagnosticOrders = require('../src/routes/diagnosticOrders');

const syntheticOrderId = '28ff8309-b5b8-46b6-b0a5-ece5066c61c4';
const syntheticVisitId = '53caec37-11e3-4741-afaf-e2e992e102c7';
const labOrderId = '5a460d70-3e28-4e18-9318-fc5a548f12a1';
const doctorId = 'afa5e6a0-1973-466d-b67c-a1649e681001';
const otherDoctorId = 'afa5e6a0-1973-466d-b67c-a1649e681002';
const labStaffId = 'afa5e6a0-1973-466d-b67c-a1649e681003';
const radiologyStaffId = 'afa5e6a0-1973-466d-b67c-a1649e681004';
const ordinaryStaffId = 'afa5e6a0-1973-466d-b67c-a1649e681005';

const accounts = [
  { id: doctorId, role: 'DOCTOR', doctorId: 'doctor-profile-1', name: 'Synthetic Doctor' },
  { id: otherDoctorId, role: 'DOCTOR', doctorId: 'doctor-profile-2', name: 'Other Synthetic Doctor' },
  { id: labStaffId, role: 'LAB_TECHNICIAN', doctorId: null, name: 'Synthetic Lab Staff' },
  { id: radiologyStaffId, role: 'RADIOLOGY_TECHNICIAN', doctorId: null, name: 'Synthetic Radiology Staff' },
  { id: ordinaryStaffId, role: 'STAFF', doctorId: null, name: 'Synthetic Clinic Staff' },
];

let activeServer;

function makeOrder(id, type, orderedById, status = 'ORDERED') {
  return {
    id,
    visitId: syntheticVisitId,
    orderedById,
    type,
    testName: type === 'LAB' ? 'Synthetic lab test' : 'Synthetic imaging test',
    clinicalIndication: 'Synthetic test data only.',
    notes: null,
    status,
    createdAt: new Date('2026-10-18T00:00:00.000Z'),
    visit: { visitNumber: 'SYNTHETIC-VISIT' },
    result: null,
  };
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function installPrismaMock() {
  const state = {
    orders: [
      makeOrder(syntheticOrderId, 'RADIOLOGY', doctorId),
      makeOrder(labOrderId, 'LAB', otherDoctorId),
    ],
    results: [],
  };
  const originals = [];
  const replace = (target, key, value) => {
    originals.push({ target, key, value: target[key] });
    target[key] = value;
  };
  const findOrder = (where) => state.orders.find((order) => (
    (!where.id || order.id === where.id) &&
    (!where.visitId || order.visitId === where.visitId) &&
    (!where.orderedById || order.orderedById === where.orderedById) &&
    (!where.type || order.type === where.type) &&
    (!where.status || order.status === where.status ||
      (where.status.in && where.status.in.includes(order.status)))
  ));

  replace(prisma.admin, 'findUnique', async ({ where }) => (
    clone(accounts.find((account) => account.id === where.id) || null)
  ));
  replace(prisma.visit, 'findUnique', async ({ where }) => (
    where.id === syntheticVisitId ? { id: syntheticVisitId } : null
  ));
  replace(prisma.visit, 'findFirst', async ({ where }) => (
    where.id === syntheticVisitId && where.status.in.includes('IN_PROGRESS')
      ? { id: syntheticVisitId }
      : null
  ));
  replace(prisma.diagnosticOrder, 'findMany', async ({ where }) => (
    clone(state.orders.filter((order) => findOrder({ ...where, id: order.id })))
  ));
  replace(prisma.diagnosticOrder, 'findUnique', async ({ where }) => {
    const order = state.orders.find((item) => item.id === where.id);
    if (!order) return null;
    return clone({
      ...order,
      result: state.results.find((item) => item.diagnosticOrderId === order.id) || null,
    });
  });
  replace(prisma.diagnosticOrder, 'create', async ({ data }) => {
    const order = makeOrder(syntheticOrderId, data.type, data.orderedById, 'ORDERED');
    Object.assign(order, data);
    state.orders.push(order);
    return clone(order);
  });
  replace(prisma.diagnosticOrder, 'update', async ({ where, data }) => {
    const order = state.orders.find((item) => item.id === where.id);
    if (!order) throw new Error('Synthetic order not found.');
    Object.assign(order, data);
    return clone(order);
  });
  replace(prisma.diagnosticOrderResult, 'findUnique', async ({ where }) => (
    clone(state.results.find((result) => result.diagnosticOrderId === where.diagnosticOrderId) || null)
  ));
  replace(prisma.diagnosticOrderResult, 'create', async ({ data }) => {
    const account = accounts.find((item) => item.id === data.resultedById);
    const result = {
      id: 'e9fcbf26-4d56-47db-a616-210321e382cd',
      ...data,
      resultedBy: { name: account.name, role: account.role },
      resultedAt: new Date('2026-10-18T01:00:00.000Z'),
      updatedAt: new Date('2026-10-18T01:00:00.000Z'),
    };
    state.results.push(result);
    const order = state.orders.find((item) => item.id === data.diagnosticOrderId);
    order.result = result;
    return clone(result);
  });
  replace(prisma, '$queryRaw', async () => []);
  replace(prisma, '$transaction', async (callback) => callback(prisma));

  return {
    state,
    restore() {
      for (const { target, key, value } of originals.reverse()) {
        target[key] = value;
      }
    },
  };
}

async function withApi(callback) {
  const mock = installPrismaMock();
  const app = express();
  app.use(express.json());
  app.use('/api/diagnostic-orders', diagnosticOrders);
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    return res.status(err.status || 500).json({
      error: err.status === 403 ? 'Forbidden' : err.status === 404 ? 'NotFound' : 'RequestError',
      message: err.message,
    });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  activeServer = server;
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/diagnostic-orders`;
  const request = (path, { accountId, method = 'GET', body } = {}) => {
    const account = accounts.find((item) => item.id === accountId);
    const headers = {};
    if (account) {
      headers.Authorization = `Bearer ${jwt.sign({ id: account.id, role: account.role }, JWT_SECRET)}`;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  try {
    await callback({ request, state: mock.state });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    activeServer = null;
    mock.restore();
  }
}

before(() => {
  assert.ok(prisma.diagnosticOrderResult, 'generated Prisma Client must expose DiagnosticOrderResult');
});

after(async () => {
  if (activeServer?.listening) {
    await new Promise((resolve) => activeServer.close(resolve));
  }
  await prisma.$disconnect();
});

test('department queues and order detail are scoped to the authenticated department', async () => {
  await withApi(async ({ request }) => {
    const queueResponse = await request('/queue', { accountId: labStaffId });
    assert.equal(queueResponse.status, 200);
    const queue = await queueResponse.json();
    assert.deepEqual(queue.orders.map((order) => order.type), ['LAB']);

    const crossDepartmentDetail = await request(`/${labOrderId}`, { accountId: radiologyStaffId });
    assert.equal(crossDepartmentDetail.status, 404);

    const ordinaryStaffQueue = await request('/queue', { accountId: ordinaryStaffId });
    assert.equal(ordinaryStaffQueue.status, 403);
  });
});

test('invalid order status transitions are rejected without changing the order', async () => {
  await withApi(async ({ request, state }) => {
    const order = state.orders.find((item) => item.id === syntheticOrderId);
    order.status = 'COMPLETED';
    const response = await request(`/${syntheticOrderId}/status`, {
      accountId: radiologyStaffId,
      method: 'PATCH',
      body: { status: 'IN_PROGRESS' },
    });
    assert.equal(response.status, 409);
    assert.equal(order.status, 'COMPLETED');
  });
});

test('authorized department staff can start processing an order', async () => {
  await withApi(async ({ request, state }) => {
    const response = await request(`/${syntheticOrderId}/status`, {
      accountId: radiologyStaffId,
      method: 'PATCH',
      body: { status: 'IN_PROGRESS' },
    });
    assert.equal(response.status, 200);
    const order = state.orders.find((item) => item.id === syntheticOrderId);
    assert.equal(order.status, 'IN_PROGRESS');
  });
});

test('authorized department staff can save a result and complete an in-progress order', async () => {
  await withApi(async ({ request, state }) => {
    const order = state.orders.find((item) => item.id === syntheticOrderId);
    order.status = 'IN_PROGRESS';
    const response = await request(`/${syntheticOrderId}/results`, {
      accountId: radiologyStaffId,
      method: 'POST',
      body: {
        findings: 'Synthetic imaging findings for automated route testing.',
        interpretation: 'Synthetic result; no clinical use.',
      },
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.order.status, 'COMPLETED');
    assert.equal(data.result.diagnosticOrderId, syntheticOrderId);
    assert.equal(data.result.resultedById, radiologyStaffId);
    assert.equal(data.result.findings, 'Synthetic imaging findings for automated route testing.');
    assert.equal(state.results.length, 1);
    assert.equal(order.status, 'COMPLETED');

    const duplicateResponse = await request(`/${syntheticOrderId}/results`, {
      accountId: radiologyStaffId,
      method: 'POST',
      body: { findings: 'Synthetic duplicate submission attempt.' },
    });
    assert.equal(duplicateResponse.status, 409);
    assert.equal(state.results.length, 1);
  });
});

test('the ordering doctor can retrieve their visit result but not another doctor’s', async () => {
  await withApi(async ({ request, state }) => {
    state.orders[0].status = 'COMPLETED';
    state.results.push({
      id: 'e9fcbf26-4d56-47db-a616-210321e382cd',
      diagnosticOrderId: syntheticOrderId,
      findings: 'Synthetic saved findings.',
      interpretation: 'Synthetic interpretation.',
      resultedById: radiologyStaffId,
      resultedBy: { name: 'Synthetic Radiology Staff', role: 'RADIOLOGY_TECHNICIAN' },
      resultedAt: new Date('2026-10-18T01:00:00.000Z'),
      updatedAt: new Date('2026-10-18T01:00:00.000Z'),
    });
    state.orders[0].result = state.results[0];

    const doctorResponse = await request(`/doctor/visits/${syntheticVisitId}/results`, { accountId: doctorId });
    assert.equal(doctorResponse.status, 200);
    const doctorResults = await doctorResponse.json();
    assert.equal(doctorResults.results.length, 1);
    assert.equal(doctorResults.results[0].order.id, syntheticOrderId);
    assert.equal(doctorResults.results[0].result.findings, 'Synthetic saved findings.');

    const otherDoctorResponse = await request(`/doctor/visits/${syntheticVisitId}/results`, {
      accountId: otherDoctorId,
    });
    assert.equal(otherDoctorResponse.status, 200);
    assert.deepEqual((await otherDoctorResponse.json()).results, []);
  });
});

test('unauthenticated staff cannot access the department queue', async () => {
  await withApi(async ({ request }) => {
    const response = await request('/queue');
    assert.equal(response.status, 401);
  });
});
