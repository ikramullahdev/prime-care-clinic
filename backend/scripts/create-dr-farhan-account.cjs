const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const approvedEmail = 'drfarhankhan@primecare.pk';
const approvedName = 'Dr. Muhammad Farhan Khan';

class SetupError extends Error {
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
    throw new SetupError('PASSWORD_TOO_SHORT');
  }
  return password;
}

async function createAccount(password) {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  return prisma.$transaction(async (tx) => {
    const existingAccount = await tx.admin.findUnique({
      where: { email: approvedEmail },
      select: { id: true },
    });
    if (existingAccount) {
      throw new SetupError('ACCOUNT_EXISTS');
    }

    const profiles = await tx.doctor.findMany({
      where: { name: { equals: approvedName, mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        isActive: true,
        adminAccount: { select: { id: true } },
      },
    });
    if (profiles.length !== 1) {
      throw new SetupError('PROFILE_NOT_UNIQUE');
    }

    const profile = profiles[0];
    if (!profile.isActive) {
      throw new SetupError('PROFILE_INACTIVE');
    }
    if (profile.adminAccount) {
      throw new SetupError('PROFILE_ALREADY_LINKED');
    }

    await tx.$queryRaw`SELECT "id" FROM "doctors" WHERE "id" = ${profile.id} FOR UPDATE`;
    const currentProfile = await tx.doctor.findUnique({
      where: { id: profile.id },
      select: {
        name: true,
        isActive: true,
        adminAccount: { select: { id: true } },
      },
    });
    if (
      !currentProfile ||
      currentProfile.name.toLocaleLowerCase() !== approvedName.toLocaleLowerCase() ||
      !currentProfile.isActive ||
      currentProfile.adminAccount
    ) {
      throw new SetupError('PROFILE_CHANGED');
    }

    return tx.admin.create({
      data: {
        email: approvedEmail,
        name: approvedName,
        role: 'DOCTOR',
        doctorId: profile.id,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        doctorId: true,
      },
    });
  });
}

async function main() {
  let password = await readPassword();
  try {
    const account = await createAccount(password);
    console.log(JSON.stringify({
      created: true,
      accountId: account.id,
      email: account.email,
      role: account.role,
      linkedDoctorId: account.doctorId,
    }));
  } finally {
    password = '';
  }
}

main()
  .catch((error) => {
    const messages = {
      PASSWORD_TOO_SHORT: 'Password must contain at least 12 characters. No account was created.',
      ACCOUNT_EXISTS: 'An account already uses the approved email. No account was created.',
      PROFILE_NOT_UNIQUE: 'The exact Doctor profile was missing or ambiguous. No account was created.',
      PROFILE_INACTIVE: 'The Doctor profile is inactive. No account was created.',
      PROFILE_ALREADY_LINKED: 'The Doctor profile is already linked to an account. No account was created.',
      PROFILE_CHANGED: 'The Doctor profile changed during validation. No account was created.',
    };
    if (messages[error.code]) {
      console.error(messages[error.code]);
    } else if (error.code === 'P2002') {
      console.error('A uniqueness conflict occurred. No duplicate account was created; recheck the records.');
    } else {
      console.error('Account creation failed. No credential data was logged; inspect database connectivity and retry only after rechecking records.');
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
