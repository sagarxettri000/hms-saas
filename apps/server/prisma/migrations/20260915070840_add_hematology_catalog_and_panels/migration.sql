-- AlterTable
ALTER TABLE "lab_order_items" ADD COLUMN     "method" TEXT,
ADD COLUMN     "precision" INTEGER,
ADD COLUMN     "rangeLabel" TEXT,
ADD COLUMN     "refHigh" DECIMAL(12,4),
ADD COLUMN     "refLow" DECIMAL(12,4),
ADD COLUMN     "resultEnteredAt" TIMESTAMP(3),
ADD COLUMN     "resultEnteredBy" TEXT,
ADD COLUMN     "resultType" TEXT;

-- AlterTable
ALTER TABLE "lab_tests" ADD COLUMN     "method" TEXT,
ADD COLUMN     "precision" INTEGER,
ADD COLUMN     "referenceRanges" JSONB,
ADD COLUMN     "resultType" TEXT NOT NULL DEFAULT 'NUMERIC',
ADD COLUMN     "sortOrder" INTEGER;

-- CreateTable
CREATE TABLE "lab_test_panels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "specimenType" TEXT,
    "container" TEXT,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_test_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_test_panel_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "priceOverride" DECIMAL(10,2),

    CONSTRAINT "lab_test_panel_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_test_panels_tenantId_idx" ON "lab_test_panels"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_test_panels_tenantId_code_key" ON "lab_test_panels"("tenantId", "code");

-- CreateIndex
CREATE INDEX "lab_test_panel_items_panelId_idx" ON "lab_test_panel_items"("panelId");

-- CreateIndex
CREATE INDEX "lab_test_panel_items_labTestId_idx" ON "lab_test_panel_items"("labTestId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_test_panel_items_panelId_labTestId_key" ON "lab_test_panel_items"("panelId", "labTestId");

-- AddForeignKey
ALTER TABLE "lab_test_panels" ADD CONSTRAINT "lab_test_panels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_test_panel_items" ADD CONSTRAINT "lab_test_panel_items_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "lab_test_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_test_panel_items" ADD CONSTRAINT "lab_test_panel_items_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "lab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Seed: deterministic Hematology catalogue (14 CBC components) + CBC panel,
-- idempotently, for every tenant. Mirrors
-- apps/server/src/modules/laboratory/hematology-catalog.ts. Ranges are
-- reference-only (WHO/adult conventions); no diagnosis is derived.
-- ============================================================================

INSERT INTO "lab_tests"
  ("id", "tenantId", "name", "code", "category", "specimenType", "container",
   "unit", "price", "turnaroundTime", "discipline", "status", "isActive",
   "method", "precision", "resultType", "referenceRanges", "sortOrder",
   "createdAt", "updatedAt")
SELECT 'hem_' || v.code || '_' || t.id, t.id, v.name, v.code, v.category,
       v.specimen, v.container, v.unit, 0, 120, 'HEMATOLOGY', 'ACTIVE', true,
       v.method, v.precision, 'NUMERIC', v.ranges::jsonb, v.sort, now(), now()
FROM "tenants" t
JOIN (VALUES
  ('TLC',  'Hematology', 'Whole Blood', 'Total Leukocyte Count', 'x10^3/uL', 'Automated hematology analyzer', 1,
   '[{"label":"Adult","low":4.0,"high":11.0}]', 'EDTA (lavender top)', 0),
  ('NEU',  'Hematology', 'Whole Blood', 'Neutrophils', '%', 'Automated 5-part differential', 1,
   '[{"label":"Adult","low":40,"high":75}]', 'EDTA (lavender top)', 1),
  ('LYM',  'Hematology', 'Whole Blood', 'Lymphocytes', '%', 'Automated 5-part differential', 1,
   '[{"label":"Adult","low":20,"high":45}]', 'EDTA (lavender top)', 2),
  ('MONO', 'Hematology', 'Whole Blood', 'Monocytes', '%', 'Automated 5-part differential', 1,
   '[{"label":"Adult","low":2,"high":10}]', 'EDTA (lavender top)', 3),
  ('EOS',  'Hematology', 'Whole Blood', 'Eosinophils', '%', 'Automated 5-part differential', 1,
   '[{"label":"Adult","low":1,"high":6}]', 'EDTA (lavender top)', 4),
  ('BASO', 'Hematology', 'Whole Blood', 'Basophils', '%', 'Automated 5-part differential', 1,
   '[{"label":"Adult","low":0,"high":1}]', 'EDTA (lavender top)', 5),
  ('HGB',  'Hematology', 'Whole Blood', 'Hemoglobin', 'g/dL', 'Automated hematology analyzer', 1,
   '[{"label":"Adult male","low":13.5,"high":17.5,"sex":"MALE"},{"label":"Adult female","low":12.0,"high":15.5,"sex":"FEMALE"},{"label":"Adult (combined)","low":12.0,"high":16.0,"sex":"OTHER","note":"Combined adult reference"}]',
   'EDTA (lavender top)', 6),
  ('RBC',  'Hematology', 'Whole Blood', 'RBC', 'x10^6/uL', 'Automated hematology analyzer', 2,
   '[{"label":"Adult male","low":4.5,"high":5.9,"sex":"MALE"},{"label":"Adult female","low":4.0,"high":5.3,"sex":"FEMALE"},{"label":"Adult (combined)","low":4.0,"high":5.5,"sex":"OTHER","note":"Combined adult reference"}]',
   'EDTA (lavender top)', 7),
  ('PCV',  'Hematology', 'Whole Blood', 'PCV (Hematocrit)', '%', 'Automated hematology analyzer', 1,
   '[{"label":"Adult male","low":40,"high":54,"sex":"MALE"},{"label":"Adult female","low":36,"high":48,"sex":"FEMALE"},{"label":"Adult (combined)","low":36,"high":50,"sex":"OTHER","note":"Combined adult reference"}]',
   'EDTA (lavender top)', 8),
  ('MCV',  'Hematology', 'Whole Blood', 'MCV', 'fL', 'Calculated (RBC indices)', 1,
   '[{"label":"Adult","low":80,"high":100}]', 'EDTA (lavender top)', 9),
  ('MCH',  'Hematology', 'Whole Blood', 'MCH', 'pg', 'Calculated (RBC indices)', 1,
   '[{"label":"Adult","low":27,"high":34}]', 'EDTA (lavender top)', 10),
  ('MCHC', 'Hematology', 'Whole Blood', 'MCHC', 'g/dL', 'Calculated (RBC indices)', 1,
   '[{"label":"Adult","low":31,"high":36}]', 'EDTA (lavender top)', 11),
  ('PLT',  'Hematology', 'Whole Blood', 'Platelets', 'x10^3/uL', 'Automated hematology analyzer', 0,
   '[{"label":"Adult","low":150,"high":450}]', 'EDTA (lavender top)', 12),
  ('ESR',  'Hematology', 'Whole Blood', 'ESR', 'mm/hr', 'Westergren', 0,
   '[{"label":"Adult male","low":0,"high":15,"sex":"MALE"},{"label":"Adult female","low":0,"high":20,"sex":"FEMALE"},{"label":"Adult (combined)","low":0,"high":20,"sex":"OTHER","note":"Combined adult reference"}]',
   'Trisodium citrate (black top)', 13)
) AS v(code, category, specimen, name, unit, method, precision, ranges, container, sort)
  ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "lab_tests" lt
  WHERE lt."tenantId" = t.id AND lt.code = v.code AND lt.discipline = 'HEMATOLOGY'
);

INSERT INTO "lab_test_panels"
  ("id", "tenantId", "name", "code", "category", "specimenType", "container",
   "description", "price", "isActive", "createdAt", "updatedAt")
SELECT 'hem_panel_cbc_' || t.id, t.id, 'Complete Blood Count', 'CBC',
       'Hematology', 'Whole Blood', 'EDTA (lavender top)',
       'CBC with five-part differential, platelet count and ESR',
       0, true, now(), now()
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "lab_test_panels" p
  WHERE p."tenantId" = t.id AND p.code = 'CBC'
);

INSERT INTO "lab_test_panel_items"
  ("id", "tenantId", "panelId", "labTestId", "sortOrder")
SELECT 'hem_pitem_' || m.code || '_' || t.id, t.id, p.id, lt.id, m.sort
FROM "tenants" t
JOIN "lab_test_panels" p ON p."tenantId" = t.id AND p.code = 'CBC'
JOIN (VALUES
  ('TLC',0),('NEU',1),('LYM',2),('MONO',3),('EOS',4),('BASO',5),
  ('HGB',6),('RBC',7),('PCV',8),('MCV',9),('MCH',10),('MCHC',11),('PLT',12),('ESR',13)
) AS m(code, sort) ON true
JOIN "lab_tests" lt ON lt."tenantId" = t.id AND lt.code = m.code AND lt.discipline = 'HEMATOLOGY'
WHERE NOT EXISTS (
  SELECT 1 FROM "lab_test_panel_items" pi
  WHERE pi."panelId" = p.id AND pi."labTestId" = lt.id
);

