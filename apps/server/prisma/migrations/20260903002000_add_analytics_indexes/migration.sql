-- Migration: add_analytics_indexes
-- Description: Add composite (tenantId + date/status) indexes to support the
--              billing analytics aggregate queries (revenue/collection rollups
--              filtered by issuedDate/paidAt/refundedAt/receivedAt and grouped
--              by doctorId/receivedBy). Idempotent: safe to re-run.

-- Invoice: issuedDate range queries (today/month/30d), grouped by type
DROP INDEX IF EXISTS "invoices_tenantId_issuedDate_status_idx";
CREATE INDEX "invoices_tenantId_issuedDate_status_idx" ON "invoices"("tenantId", "issuedDate", "status");

-- Payment: paidAt range queries (today/month/30d) and user-wise collection by receivedBy+method
DROP INDEX IF EXISTS "payments_tenantId_paidAt_idx";
CREATE INDEX "payments_tenantId_paidAt_idx" ON "payments"("tenantId", "paidAt");
DROP INDEX IF EXISTS "payments_tenantId_receivedBy_method_idx";
CREATE INDEX "payments_tenantId_receivedBy_method_idx" ON "payments"("tenantId", "receivedBy", "method");

-- Refund: today/complete refund sums
DROP INDEX IF EXISTS "refunds_tenantId_refundedAt_status_idx";
CREATE INDEX "refunds_tenantId_refundedAt_status_idx" ON "refunds"("tenantId", "refundedAt", "status");

-- Deposit: today deposit sums
DROP INDEX IF EXISTS "deposits_tenantId_receivedAt_idx";
CREATE INDEX "deposits_tenantId_receivedAt_idx" ON "deposits"("tenantId", "receivedAt");

-- InvoiceItem: doctor-wise income (groupBy doctorId within tenant)
DROP INDEX IF EXISTS "invoice_items_tenantId_doctorId_idx";
CREATE INDEX "invoice_items_tenantId_doctorId_idx" ON "invoice_items"("tenantId", "doctorId");
