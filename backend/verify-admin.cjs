require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

(async () => {
  try {
    const admin = await db.admin.findUnique({
      where: { email: "admin@primecare.pk" },
      select: { passwordHash: true }
    });

    if (!admin) {
      console.log("Admin account not found.");
      return;
    }

    const password = process.env.ADMIN_TEST_PASSWORD;

    if (!password) {
      console.log("Password input is not configured; no changes made.");
      return;
    }

    const matches = await bcrypt.compare(password, admin.passwordHash);
    console.log(matches ? "PASSWORD MATCHES" : "PASSWORD DOES NOT MATCH");
  } catch (err) {
    console.log("Verification error:", err.message);
  } finally {
    await db.$disconnect();
  }
})();
