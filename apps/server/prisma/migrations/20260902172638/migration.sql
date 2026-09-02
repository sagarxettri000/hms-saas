-- Migration: add_fk_relations
-- Description: Add FK relations for DischargeBill->Invoice, InvoiceItem->Department/Service,
--              BillingService->Department, FinancialTransaction->Patient/Invoice.
-- NOTE: This migration is idempotent and tolerant of pre-existing dirty data.
--       The InvoiceItem FK constraints are created NOT VALID so existing orphaned
--       rows (serviceId/departmentId not present in referenced tables) do not block
--       the constraint from being created.

-- 1. DischargeBill: add invoiceId FK
ALTER TABLE "discharge_bills" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
ALTER TABLE "discharge_bills" DROP CONSTRAINT IF EXISTS "discharge_bills_invoiceId_fkey";
ALTER TABLE "discharge_bills" ADD CONSTRAINT "discharge_bills_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX IF EXISTS "discharge_bills_tenantId_invoiceId_idx";
CREATE INDEX "discharge_bills_tenantId_invoiceId_idx" ON "discharge_bills"("tenantId", "invoiceId");

-- 2. InvoiceItem: add FK relations for departmentId and serviceId (NOT VALID to tolerate orphaned data)
ALTER TABLE "invoice_items" DROP CONSTRAINT IF EXISTS "invoice_items_departmentId_fkey";
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "invoice_items" DROP CONSTRAINT IF EXISTS "invoice_items_serviceId_fkey";
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "billing_services"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
DROP INDEX IF EXISTS "invoice_items_tenantId_departmentId_idx";
CREATE INDEX "invoice_items_tenantId_departmentId_idx" ON "invoice_items"("tenantId", "departmentId");
DROP INDEX IF EXISTS "invoice_items_tenantId_serviceId_idx";
CREATE INDEX "invoice_items_tenantId_serviceId_idx" ON "invoice_items"("tenantId", "serviceId");

-- 3. BillingService: add FK relation for departmentId
ALTER TABLE "billing_services" DROP CONSTRAINT IF EXISTS "billing_services_departmentId_fkey";
ALTER TABLE "billing_services" ADD CONSTRAINT "billing_services_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. FinancialTransaction: add FK relations for patientId and invoiceId
ALTER TABLE "financial_transactions" DROP CONSTRAINT IF EXISTS "financial_transactions_patientId_fkey";
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" DROP CONSTRAINT IF EXISTS "financial_transactions_invoiceId_fkey";
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
