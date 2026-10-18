-- Add a login role for authenticated doctor accounts using the existing Admin authentication model.
ALTER TYPE "Role" ADD VALUE 'DOCTOR';

-- CreateTable
CREATE TABLE "consultations" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "chiefComplaint" TEXT NOT NULL,
    "presentIllness" TEXT,
    "medicalHistory" TEXT,
    "allergies" TEXT,
    "examinationFindings" TEXT,
    "provisionalDiagnosis" TEXT,
    "finalDiagnosis" TEXT,
    "consultationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consultations_visitId_key" ON "consultations"("visitId");
CREATE INDEX "consultations_patientId_createdAt_idx" ON "consultations"("patientId", "createdAt");
CREATE INDEX "consultations_authorId_createdAt_idx" ON "consultations"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
