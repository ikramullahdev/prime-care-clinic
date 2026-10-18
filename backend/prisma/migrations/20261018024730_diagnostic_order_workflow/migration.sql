-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DiagnosticOrderStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "DiagnosticOrderStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "DiagnosticOrderStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'LAB_TECHNICIAN';
ALTER TYPE "Role" ADD VALUE 'RADIOLOGY_TECHNICIAN';

-- CreateTable
CREATE TABLE "diagnostic_order_results" (
    "id" TEXT NOT NULL,
    "diagnosticOrderId" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "interpretation" TEXT,
    "resultedById" TEXT NOT NULL,
    "resultedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_order_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_order_results_diagnosticOrderId_key" ON "diagnostic_order_results"("diagnosticOrderId");

-- CreateIndex
CREATE INDEX "diagnostic_order_results_resultedById_resultedAt_idx" ON "diagnostic_order_results"("resultedById", "resultedAt");

-- AddForeignKey
ALTER TABLE "diagnostic_order_results" ADD CONSTRAINT "diagnostic_order_results_diagnosticOrderId_fkey" FOREIGN KEY ("diagnosticOrderId") REFERENCES "diagnostic_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_order_results" ADD CONSTRAINT "diagnostic_order_results_resultedById_fkey" FOREIGN KEY ("resultedById") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
