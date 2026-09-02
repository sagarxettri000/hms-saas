-- Migration: add_fk_relations
-- Description: Add FK relations for DischargeBill->Invoice, InvoiceItem->Department/Service,
--              BillingService->Department, FinancialTransaction->Patient/Invoice.

-- 1. DischargeBill: add invoiceId FK
ALTER TABLE "discharge_bills" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "discharge_bills" ADD CONSTRAINT "discharge_bills_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "discharge_bills_tenantId_invoiceId_idx" ON "discharge_bills"("tenantId", "invoiceId");

-- 2. InvoiceItem: add FK relations for departmentId and serviceId
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "billing_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "invoice_items_tenantId_departmentId_idx" ON "invoice_items"("tenantId", "departmentId");
CREATE INDEX "invoice_items_tenantId_serviceId_idx" ON "invoice_items"("tenantId", "serviceId");

-- 3. BillingService: add FK relation for departmentId
ALTER TABLE "billing_services" ADD CONSTRAINT "billing_services_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. FinancialTransaction: add FK relations for patientId and invoiceId
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
