-- Pharmacy bill barcode: globally-unique nullable barcode value per invoice.
-- Nullable so non-pharmacy invoices are unaffected; unique so two pharmacy
-- bills can never share a barcode value.
ALTER TABLE "invoices" ADD COLUMN "barcode" TEXT;
CREATE UNIQUE INDEX "invoices_barcode_key" ON "invoices"("barcode");
