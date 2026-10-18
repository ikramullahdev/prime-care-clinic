const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const approvedEmail = 'drfarhankhan@primecare.pk';
const approvedDoctorName = 'Dr. Muhammad Farhan Khan';

class ResetError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function readPassword() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks);
  const password = input.toString('utf8').replace(/\r?\n$/, '');
  input.fill(0);
  if (password.length < 12) {
    throw new ResetError('PASSWORD_TOO_SHORT');
  }
  return password;
}

async function resetPassword(password) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "admins" WHERE "email" = ${approvedEmail} FOR UPDATE`;

    const account = await tx.admin.findUnique({
      where: { email: approvedEmail },
      select: {
        id: true,
        email: true,
        role: true,
        doctorId: true,
        doctorProfile: {
          select: { id: true, name: true, isActive: true },
        },
      },
    });

    if (!account) {
      throw new ResetError('ACCOUNT_NOT_FOUND');
    }
    if (account.role !== 'DOCTOR') {
      throw new ResetError('ROLE_MISMATCH');
    }
    if (
      !account.doctorId ||
      !account.doctorProfile ||
      account.doctorProfile.id !== account.doctorId ||
      account.doctorProfile.name.toLocaleLowerCase() !== approvedDoctorName.toLocaleLowerCase() ||
      !account.doctorProfile.isActive
    ) {
      throw new ResetError('PROFILE_MISMATCH');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const updated = await tx.admin.update({
      where: { id: account.id },
      data: { passwordHash },
      select: { id: true, email: true, role: true, doctorId: true },
    });

    return {
      updated: true,
      accountId: updated.id,
      email: updated.email,
      role: updated.role,
      doctorLinked: Boolean(updated.doctorId),
    };
  });
}

async function main() {
  let password = await readPassword();
  try {
    const result = await resetPassword(password);
    console.log(JSON.stringify(result));
  } finally {
    password = '';
  }
}

main()
  .catch((error) => {
    const messages = {
      PASSWORD_TOO_SHORT: 'Password must contain at least 12 characters. No account was changed.',
      ACCOUNT_NOT_FOUND: 'The approved account was not found. No account was changed.',
      ROLE_MISMATCH: 'The approved account is not a DOCTOR account. No account was changed.',
      PROFILE_MISMATCH: 'The expected active Doctor profile is not linked. No account was changed.',
    };
    if (messages[error.code]) {
      console.error(messages[error.code]);
    } else {
      console.error('Password reset failed. Credential data was not logged; no success should be assumed.');
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
