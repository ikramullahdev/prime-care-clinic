const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const approvedAccounts = [
  { role: 'LAB_TECHNICIAN', name: 'Laboratory Technician' },
  { role: 'RADIOLOGY_TECHNICIAN', name: 'Radiology Technician' },
];

class SetupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks);
  try {
    return JSON.parse(input.toString('utf8'));
  } catch {
    throw new SetupError('INVALID_INPUT');
  } finally {
    input.fill(0);
  }
}

function validateAccounts(input) {
  if (!Array.isArray(input) || input.length !== approvedAccounts.length) {
    throw new SetupError('INVALID_INPUT');
  }

  const normalizedAccounts = input.map((account, index) => {
    const expected = approvedAccounts[index];
    if (
      !account ||
      account.role !== expected.role ||
      account.name !== expected.name ||
      typeof account.email !== 'string' ||
      typeof account.password !== 'string' ||
      account.password.length < 12
    ) {
      throw new SetupError('INVALID_INPUT');
    }

    const email = account.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new SetupError('INVALID_INPUT');
    }

    return {
      email,
      name: expected.name,
      role: expected.role,
      password: account.password,
    };
  });

  if (normalizedAccounts[0].email === normalizedAccounts[1].email) {
    throw new SetupError('DUPLICATE_EMAILS');
  }
  return normalizedAccounts;
}

async function createAccounts(accounts) {
  const preparedAccounts = await Promise.all(
    accounts.map(async (account) => {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(account.password, salt);
      return {
        email: account.email,
        name: account.name,
        role: account.role,
        passwordHash,
      };
    }),
  );

  return prisma.$transaction(async (tx) => {
    const created = [];
    for (const account of preparedAccounts) {
      const existing = await tx.admin.findUnique({
        where: { email: account.email },
        select: { id: true },
      });
      if (existing) {
        throw new SetupError('ACCOUNT_EXISTS');
      }

      created.push(
        await tx.admin.create({
          data: account,
          select: { role: true },
        }),
      );
    }
    return created;
  });
}

async function main() {
  const accounts = validateAccounts(await readInput());
  try {
    const created = await createAccounts(accounts);
    console.log(JSON.stringify({
      created: created.map(({ role }) => ({ role, success: true })),
      count: created.length,
    }));
  } finally {
    for (const account of accounts) {
      account.password = '';
    }
  }
}

main()
  .catch((error) => {
    const messages = {
      INVALID_INPUT: 'Input was invalid. No accounts were created.',
      DUPLICATE_EMAILS: 'The two accounts must use different emails. No accounts were created.',
      ACCOUNT_EXISTS: 'An account already uses one of the entered emails. No accounts were created or changed.',
    };
    if (messages[error.code]) {
      console.error(messages[error.code]);
    } else if (error.code === 'P2002') {
      console.error('An email uniqueness conflict occurred. The transaction was rolled back; no accounts were changed.');
    } else {
      console.error('Account creation failed. No credentials were logged; check local database connectivity before retrying.');
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
