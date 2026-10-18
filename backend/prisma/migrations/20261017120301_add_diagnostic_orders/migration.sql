-- CreateEnum
CREATE TYPE "DiagnosticOrderType" AS ENUM ('LAB', 'RADIOLOGY');

-- CreateEnum
CREATE TYPE "DiagnosticOrderStatus" AS ENUM ('ORDERED');

-- CreateTable
CREATE TABLE "diagnostic_orders" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "orderedById" TEXT NOT NULL,
    "type" "DiagnosticOrderType" NOT NULL,
    "testName" VARCHAR(200) NOT NULL,
    "clinicalIndication" VARCHAR(2000),
    "notes" VARCHAR(2000),
    "status" "DiagnosticOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnostic_orders_visitId_createdAt_idx" ON "diagnostic_orders"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "diagnostic_orders_orderedById_createdAt_idx" ON "diagnostic_orders"("orderedById", "createdAt");

-- AddForeignKey
ALTER TABLE "diagnostic_orders" ADD CONSTRAINT "diagnostic_orders_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_orders" ADD CONSTRAINT "diagnostic_orders_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
