-- Backfills a column that existed in the Prisma schema but was never
-- created by a migration. Production hit `P2022: column
-- radiology_orders.accessionNumber does not exist` on every list query.
ALTER TABLE "radiology_orders" ADD COLUMN "accessionNumber" TEXT;

CREATE INDEX "radiology_orders_accessionNumber_idx" ON "radiology_orders"("accessionNumber");