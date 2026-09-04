-- Reconcile migration history with the current Prisma schema.
-- These are pre-existing divergences (schema was edited without a matching
-- migration): a legacy billing_services.category text column superseded by
-- the categoryId FK, plus redundant/unmanaged indexes and an index name that
-- Prisma would auto-truncate.

-- DropIndex
DROP INDEX "billing_services_tenantId_category_idx";

-- AlterTable
ALTER TABLE "billing_services" DROP COLUMN "category";

-- DropIndex
DROP INDEX "discharge_bills_tenantId_invoiceId_idx";

-- DropIndex
DROP INDEX "invoice_items_tenantId_departmentId_idx";

-- DropIndex
DROP INDEX "invoice_items_tenantId_serviceId_idx";

-- RenameIndex
ALTER INDEX "charge_transactions_tenantId_sourceModule_sourceTransactionId_idx" RENAME TO "charge_transactions_tenantId_sourceModule_sourceTransaction_idx";
