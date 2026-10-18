const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeOrderStatuses = ['ORDERED', 'IN_PROGRESS'];
const allowedOrderTypes = ['LAB', 'RADIOLOGY'];
const orderFields = ['visitId', 'type', 'testName', 'clinicalIndication', 'notes'];
const departmentTypes = {
  LAB_TECHNICIAN: 'LAB',
  RADIOLOGY_TECHNICIAN: 'RADIOLOGY',
};
const departmentRoles = Object.keys(departmentTypes);
const orderSelect = {
  id: true,
  visitId: true,
  type: true,
  testName: true,
  clinicalIndication: true,
  notes: true,
  status: true,
  createdAt: true,
};
const resultSelect = {
  id: true,
  diagnosticOrderId: true,
  findings: true,
  interpretation: true,
  resultedById: true,
  resultedAt: true,
  updatedAt: true,
};

class RouteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendValidationError(res, message) {
  return res.status(400).json({ error: 'ValidationError', message });
}

async function getAuthenticatedAccount(req) {
  const account = await prisma.admin.findUnique({
    where: { id: req.user.id },
    select: { id: true, role: true, doctorId: true },
  });
  if (!account || account.role !== req.user.role) {
    throw new RouteError(403, 'The authenticated account is unavailable or its role has changed.');
  }
  return account;
}

function requireDepartmentAccount(account) {
  if (!departmentTypes[account.role]) {
    throw new RouteError(403, 'A laboratory or radiology staff account is required.');
  }
  return account;
}

async function getDepartmentOrder(orderId, departmentType) {
  const order = await prisma.diagnosticOrder.findUnique({
    where: { id: orderId },
    select: {
      ...orderSelect,
      visit: { select: { visitNumber: true } },
      result: {
        select: {
          ...resultSelect,
          resultedBy: { select: { name: true, role: true } },
        },
      },
    },
  });
  if (!order || order.type !== departmentType) {
    throw new RouteError(404, 'Diagnostic order not found in your department.');
  }
  return order;
}

function allowedStatusTransition(current, target) {
  return (
    (current === 'ORDERED' && ['IN_PROGRESS', 'CANCELLED'].includes(target)) ||
    (current === 'IN_PROGRESS' && target === 'CANCELLED')
  );
}

router.get('/queue', requireAuth, requireRole(...departmentRoles), async (req, res, next) => {
  try {
    const account = requireDepartmentAccount(await getAuthenticatedAccount(req));
    const orders = await prisma.diagnosticOrder.findMany({
      where: {
        type: departmentTypes[account.role],
        status: { in: activeOrderStatuses },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        ...orderSelect,
        visit: { select: { visitNumber: true } },
      },
    });
    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

router.get('/doctor/visits/:visitId/results', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const account = await getAuthenticatedAccount(req);
    if (account.role !== 'DOCTOR' || !account.doctorId) {
      throw new RouteError(403, 'A linked doctor account is required to view diagnostic results.');
    }
    const { visitId } = req.params;
    if (!uuidPattern.test(visitId)) {
      return sendValidationError(res, 'A valid visit ID is required.');
    }

    const orders = await prisma.diagnosticOrder.findMany({
      where: { visitId, orderedById: account.id },
      orderBy: { createdAt: 'desc' },
      select: {
        ...orderSelect,
        result: {
          select: {
            ...resultSelect,
            resultedBy: { select: { name: true, role: true } },
          },
        },
      },
    });
    return res.json({
      results: orders.filter((order) => order.result).map((order) => ({
        order: {
          id: order.id,
          visitId: order.visitId,
          type: order.type,
          testName: order.testName,
          status: order.status,
          createdAt: order.createdAt,
        },
        result: order.result,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:orderId', requireAuth, requireRole(...departmentRoles), async (req, res, next) => {
  try {
    if (!uuidPattern.test(req.params.orderId)) {
      return sendValidationError(res, 'A valid diagnostic order ID is required.');
    }
    const account = requireDepartmentAccount(await getAuthenticatedAccount(req));
    const order = await getDepartmentOrder(req.params.orderId, departmentTypes[account.role]);
    return res.json({ order });
  } catch (err) {
    return next(err);
  }
});

router.get('/visit/:visitId', requireAuth, async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!uuidPattern.test(visitId)) {
      return sendValidationError(res, 'A valid visit ID is required.');
    }
    const account = await getAuthenticatedAccount(req);
    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true },
    });
    if (!visit) {
      throw new RouteError(404, 'Visit not found.');
    }

    let where;
    if (account.role === 'DOCTOR' && account.doctorId) {
      where = { visitId, orderedById: account.id };
    } else if (departmentTypes[account.role]) {
      where = { visitId, type: departmentTypes[account.role] };
    } else {
      throw new RouteError(403, 'This account cannot view diagnostic orders.');
    }

    const orders = await prisma.diagnosticOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: orderSelect,
    });
    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

router.post('/', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return sendValidationError(res, 'Diagnostic order details must be provided as an object.');
    }

    const unknownField = Object.keys(req.body).find((field) => !orderFields.includes(field));
    if (unknownField) {
      return sendValidationError(res, `Unexpected diagnostic order field: ${unknownField}.`);
    }

    const { visitId, type, testName } = req.body;
    if (typeof visitId !== 'string' || !uuidPattern.test(visitId)) {
      return sendValidationError(res, 'A valid visit ID is required.');
    }
    if (!allowedOrderTypes.includes(type)) {
      return sendValidationError(res, 'Order type must be LAB or RADIOLOGY.');
    }
    if (typeof testName !== 'string' || !testName.trim() || testName.trim().length > 200) {
      return sendValidationError(res, 'Test name is required and must not exceed 200 characters.');
    }

    const data = {
      type,
      testName: testName.trim(),
    };
    for (const field of ['clinicalIndication', 'notes']) {
      const value = req.body[field];
      if (value === undefined || value === null || value === '') {
        data[field] = null;
      } else if (typeof value !== 'string' || value.length > 2000) {
        return sendValidationError(res, `${field} must be text no longer than 2,000 characters.`);
      } else {
        data[field] = value.trim() || null;
      }
    }

    const account = await getAuthenticatedAccount(req);
    if (account.role !== 'DOCTOR') {
      throw new RouteError(403, 'A doctor account is required to place diagnostic orders.');
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "visits" WHERE "id" = ${visitId} FOR UPDATE`;
      const visit = await tx.visit.findFirst({
        where: { id: visitId, status: { in: ['CHECKED_IN', 'IN_PROGRESS'] } },
        select: { id: true },
      });
      if (!visit) {
        throw new RouteError(404, 'No checked-in or in-progress visit was found.');
      }
      return tx.diagnosticOrder.create({
        data: {
          ...data,
          visitId: visit.id,
          orderedById: account.id,
        },
        select: orderSelect,
      });
    });

    return res.status(201).json({ success: true, order });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:orderId/status', requireAuth, requireRole(...departmentRoles), async (req, res, next) => {
  try {
    if (!uuidPattern.test(req.params.orderId)) {
      return sendValidationError(res, 'A valid diagnostic order ID is required.');
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
        Object.keys(req.body).length !== 1 || !Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      return sendValidationError(res, 'Only the target order status may be provided.');
    }
    const targetStatus = req.body.status;
    if (!['IN_PROGRESS', 'CANCELLED'].includes(targetStatus)) {
      return sendValidationError(res, 'Status must be IN_PROGRESS or CANCELLED. Submit results to complete an order.');
    }

    const account = requireDepartmentAccount(await getAuthenticatedAccount(req));
    const departmentType = departmentTypes[account.role];
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "diagnostic_orders" WHERE "id" = ${req.params.orderId} FOR UPDATE`;
      const order = await tx.diagnosticOrder.findUnique({
        where: { id: req.params.orderId },
        select: { id: true, type: true, status: true },
      });
      if (!order || order.type !== departmentType) {
        throw new RouteError(404, 'Diagnostic order not found in your department.');
      }
      if (!allowedStatusTransition(order.status, targetStatus)) {
        throw new RouteError(409, `Cannot transition an order from ${order.status} to ${targetStatus}.`);
      }
      return tx.diagnosticOrder.update({
        where: { id: order.id },
        data: { status: targetStatus },
        select: orderSelect,
      });
    });
    return res.json({ success: true, order: updated });
  } catch (err) {
    return next(err);
  }
});

router.post('/:orderId/results', requireAuth, requireRole(...departmentRoles), async (req, res, next) => {
  try {
    if (!uuidPattern.test(req.params.orderId)) {
      return sendValidationError(res, 'A valid diagnostic order ID is required.');
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return sendValidationError(res, 'Diagnostic result details must be provided as an object.');
    }
    const allowedFields = ['findings', 'interpretation'];
    const unknownField = Object.keys(req.body).find((field) => !allowedFields.includes(field));
    if (unknownField) {
      return sendValidationError(res, `Unexpected diagnostic result field: ${unknownField}.`);
    }
    const findings = req.body.findings;
    const interpretation = req.body.interpretation;
    if (typeof findings !== 'string' || !findings.trim() || findings.trim().length > 10000) {
      return sendValidationError(res, 'Findings are required and must not exceed 10,000 characters.');
    }
    if (interpretation !== undefined && interpretation !== null &&
        (typeof interpretation !== 'string' || interpretation.length > 5000)) {
      return sendValidationError(res, 'Interpretation must be text no longer than 5,000 characters.');
    }

    const account = requireDepartmentAccount(await getAuthenticatedAccount(req));
    const departmentType = departmentTypes[account.role];
    const completed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "diagnostic_orders" WHERE "id" = ${req.params.orderId} FOR UPDATE`;
      const order = await tx.diagnosticOrder.findUnique({
        where: { id: req.params.orderId },
        select: { id: true, type: true, status: true },
      });
      if (!order || order.type !== departmentType) {
        throw new RouteError(404, 'Diagnostic order not found in your department.');
      }
      if (order.status !== 'IN_PROGRESS') {
        throw new RouteError(409, 'Only in-progress orders may receive results.');
      }
      const existingResult = await tx.diagnosticOrderResult.findUnique({
        where: { diagnosticOrderId: order.id },
        select: { id: true },
      });
      if (existingResult) {
        throw new RouteError(409, 'A result has already been submitted for this order.');
      }

      const result = await tx.diagnosticOrderResult.create({
        data: {
          diagnosticOrderId: order.id,
          findings: findings.trim(),
          interpretation: typeof interpretation === 'string' ? interpretation.trim() || null : null,
          resultedById: account.id,
        },
        select: resultSelect,
      });
      const updatedOrder = await tx.diagnosticOrder.update({
        where: { id: order.id },
        data: { status: 'COMPLETED' },
        select: orderSelect,
      });
      return { order: updatedOrder, result };
    });

    return res.status(201).json({ success: true, ...completed });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
