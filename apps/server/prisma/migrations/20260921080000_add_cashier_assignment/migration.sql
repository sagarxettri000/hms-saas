-- AlterEnum
ALTER TYPE "PermissionAction" ADD VALUE 'ASSIGN_CASHIER';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "assignedCashierAt" TIMESTAMP(3),
ADD COLUMN     "assignedCashierId" TEXT,
ADD COLUMN     "assignedCashierName" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cashierId" TEXT,
ADD COLUMN     "cashierName" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "cashierId" TEXT,
ADD COLUMN     "cashierName" TEXT;

-- CreateIndex
CREATE INDEX "invoices_assignedCashierId_idx" ON "invoices"("assignedCashierId");

-- CreateIndex
CREATE INDEX "payments_cashierId_idx" ON "payments"("cashierId");

-- CreateIndex
CREATE INDEX "refunds_cashierId_idx" ON "refunds"("cashierId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_assignedCashierId_fkey" FOREIGN KEY ("assignedCashierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;