-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "visitNumber" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "VisitStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "checkedInById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visits_visitNumber_key" ON "visits"("visitNumber");
CREATE INDEX "visits_checkedInAt_idx" ON "visits"("checkedInAt");
CREATE INDEX "visits_patientId_checkedInAt_idx" ON "visits"("patientId", "checkedInAt");
CREATE INDEX "visits_appointmentId_status_idx" ON "visits"("appointmentId", "status");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
