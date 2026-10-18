-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "doctorId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "admins_doctorId_key" ON "admins"("doctorId");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
