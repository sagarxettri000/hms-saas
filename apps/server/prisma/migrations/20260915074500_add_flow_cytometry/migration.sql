-- AlterTable
ALTER TABLE "lab_test_panels" ADD COLUMN     "labTestId" TEXT;

-- CreateTable
CREATE TABLE "flow_markers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "clone" TEXT,
    "fluorochrome" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_markers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_antibodies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "antibody" TEXT NOT NULL,
    "clone" TEXT,
    "fluorochrome" TEXT,
    "manufacturer" TEXT,
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_antibodies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_instruments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "channels" INTEGER,
    "parameters" INTEGER,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastQcAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_panel_markers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "antibodyId" TEXT,
    "fluorochrome" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "flow_panel_markers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_studies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "labOrderItemId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "sampleId" TEXT,
    "gatingStrategy" TEXT,
    "resultSummary" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "operatorId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "acquisitionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "numberOfParameters" INTEGER,
    "numberOfEvents" INTEGER,
    "qcStatus" TEXT NOT NULL DEFAULT 'NOT_RUN',
    "qcNote" TEXT,
    "compensationStatus" TEXT NOT NULL DEFAULT 'NOT_APPLIED',
    "compensationMetadata" JSONB,
    "instrumentSettings" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_analyses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "strategy" TEXT,
    "operatorId" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_populations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "percentage" DECIMAL(12,4),
    "countUnit" TEXT,
    "absoluteCount" DECIMAL(12,4),
    "qualitative" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_populations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_marker_results" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "populationId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "percentage" DECIMAL(12,4),
    "absoluteCount" DECIMAL(12,4),
    "mfi" DECIMAL(12,4),
    "unit" TEXT,
    "valueText" TEXT,
    "isAbnormal" BOOLEAN,
    "isCritical" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "resultEnteredBy" TEXT,
    "resultEnteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_marker_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flow_markers_tenantId_idx" ON "flow_markers"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_markers_tenantId_code_key" ON "flow_markers"("tenantId", "code");

-- CreateIndex
CREATE INDEX "flow_antibodies_tenantId_idx" ON "flow_antibodies"("tenantId");

-- CreateIndex
CREATE INDEX "flow_antibodies_markerId_idx" ON "flow_antibodies"("markerId");

-- CreateIndex
CREATE INDEX "flow_instruments_tenantId_idx" ON "flow_instruments"("tenantId");

-- CreateIndex
CREATE INDEX "flow_panel_markers_panelId_idx" ON "flow_panel_markers"("panelId");

-- CreateIndex
CREATE INDEX "flow_panel_markers_markerId_idx" ON "flow_panel_markers"("markerId");

-- CreateIndex
CREATE INDEX "flow_panel_markers_tenantId_idx" ON "flow_panel_markers"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_panel_markers_panelId_markerId_key" ON "flow_panel_markers"("panelId", "markerId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_studies_labOrderItemId_key" ON "flow_studies"("labOrderItemId");

-- CreateIndex
CREATE INDEX "flow_studies_tenantId_idx" ON "flow_studies"("tenantId");

-- CreateIndex
CREATE INDEX "flow_studies_labOrderId_idx" ON "flow_studies"("labOrderId");

-- CreateIndex
CREATE INDEX "flow_studies_panelId_idx" ON "flow_studies"("panelId");

-- CreateIndex
CREATE INDEX "flow_runs_tenantId_idx" ON "flow_runs"("tenantId");

-- CreateIndex
CREATE INDEX "flow_runs_studyId_idx" ON "flow_runs"("studyId");

-- CreateIndex
CREATE INDEX "flow_analyses_tenantId_idx" ON "flow_analyses"("tenantId");

-- CreateIndex
CREATE INDEX "flow_analyses_studyId_idx" ON "flow_analyses"("studyId");

-- CreateIndex
CREATE INDEX "flow_populations_tenantId_idx" ON "flow_populations"("tenantId");

-- CreateIndex
CREATE INDEX "flow_populations_studyId_idx" ON "flow_populations"("studyId");

-- CreateIndex
CREATE INDEX "flow_populations_parentId_idx" ON "flow_populations"("parentId");

-- CreateIndex
CREATE INDEX "flow_marker_results_tenantId_idx" ON "flow_marker_results"("tenantId");

-- CreateIndex
CREATE INDEX "flow_marker_results_studyId_idx" ON "flow_marker_results"("studyId");

-- CreateIndex
CREATE INDEX "flow_marker_results_markerId_idx" ON "flow_marker_results"("markerId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_marker_results_populationId_markerId_key" ON "flow_marker_results"("populationId", "markerId");

-- AddForeignKey
ALTER TABLE "lab_test_panels" ADD CONSTRAINT "lab_test_panels_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "lab_tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_antibodies" ADD CONSTRAINT "flow_antibodies_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "flow_markers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_panel_markers" ADD CONSTRAINT "flow_panel_markers_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "lab_test_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_panel_markers" ADD CONSTRAINT "flow_panel_markers_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "flow_markers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_panel_markers" ADD CONSTRAINT "flow_panel_markers_antibodyId_fkey" FOREIGN KEY ("antibodyId") REFERENCES "flow_antibodies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_studies" ADD CONSTRAINT "flow_studies_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_studies" ADD CONSTRAINT "flow_studies_labOrderItemId_fkey" FOREIGN KEY ("labOrderItemId") REFERENCES "lab_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_studies" ADD CONSTRAINT "flow_studies_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "lab_test_panels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_studies" ADD CONSTRAINT "flow_studies_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "lab_samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "flow_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "flow_instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_analyses" ADD CONSTRAINT "flow_analyses_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "flow_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_populations" ADD CONSTRAINT "flow_populations_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "flow_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_populations" ADD CONSTRAINT "flow_populations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "flow_populations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_marker_results" ADD CONSTRAINT "flow_marker_results_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "flow_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_marker_results" ADD CONSTRAINT "flow_marker_results_populationId_fkey" FOREIGN KEY ("populationId") REFERENCES "flow_populations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_marker_results" ADD CONSTRAINT "flow_marker_results_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "flow_markers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Seed: deterministic Flow Cytometry catalogue (4 panels, 23 markers, 30
-- antibodies, 3 instruments), idempotently, for every tenant. Mirrors
-- apps/server/src/modules/laboratory/flow-cytometry-catalog.ts. Panel
-- marker sets and fluorochromes are configuration data; no clinical thresholds,
-- reference ranges or diagnostic rules are seeded (reportable interpretation
-- remains reviewer-driven).
-- ============================================================================

-- 1) Panels registered as orderable lab tests (discipline FLOW_CYTOMETRY).
INSERT INTO "lab_tests"
  ("id", "tenantId", "name", "code", "category", "specimenType", "unit",
   "price", "turnaroundTime", "discipline", "status", "isActive", "method",
   "precision", "resultType", "referenceRanges", "sortOrder", "createdAt", "updatedAt")
SELECT 'fct_' || v.code || '_' || t.id, t.id, v.name, v.code, 'Flow Cytometry',
       v.specimen, NULL, v.price, v.tat, 'FLOW_CYTOMETRY', 'ACTIVE', true,
       'Flow cytometry - multicolor', NULL, 'TEXT', NULL, v.sort, now(), now()
FROM "tenants" t
JOIN (VALUES
  ('FCM-LYS', 'Lymphocyte Subset Panel', 'Whole Blood', 5000, 1440, 1),
  ('FCM-ISP', 'Immunophenotyping Panel', 'Whole Blood / Bone Marrow', 8500, 2880, 2),
  ('FCM-MRD', 'MRD Panel (B-ALL)', 'Bone Marrow', 13500, 4320, 3),
  ('FCM-PNH', 'PNH Screening Panel', 'Whole Blood', 6500, 2880, 4)
) AS v(code, name, specimen, price, tat, sort)
  ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "lab_tests" lt
  WHERE lt."tenantId" = t.id AND lt.code = v.code AND lt.discipline = 'FLOW_CYTOMETRY'
);

-- 2) LabTestPanel records; each linked to its orderable Test above.
INSERT INTO "lab_test_panels"
  ("id", "tenantId", "name", "code", "category", "specimenType", "container",
   "description", "price", "isActive", "labTestId", "createdAt", "updatedAt")
SELECT 'fcp_' || v.code || '_' || t.id, t.id, v.name, v.code, 'Flow Cytometry',
       v.specimen, v.container, v.description, v.price, true,
       'fct_' || v.code || '_' || t.id, now(), now()
FROM "tenants" t
JOIN (VALUES
  ('FCM-LYS', 'Lymphocyte Subset Panel', 'Whole Blood', 'EDTA (lavender top)',
   'Lymphocyte subset analysis with CD4/CD8 counts', 5000),
  ('FCM-ISP', 'Immunophenotyping Panel', 'Whole Blood / Bone Marrow', 'EDTA (lavender top)',
   'Acute leukemia / lymphoma immunophenotyping screen', 8500),
  ('FCM-MRD', 'MRD Panel (B-ALL)', 'Bone Marrow', 'Heparin',
   'Minimal residual disease assessment (B-ALL)', 13500),
  ('FCM-PNH', 'PNH Screening Panel', 'Whole Blood', 'EDTA (lavender top)',
   'Paroxysmal nocturnal hemoglobinuria screening', 6500)
) AS v(code, name, specimen, container, description, price)
  ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "lab_test_panels" p
  WHERE p."tenantId" = t.id AND p.code = v.code
);

-- 3) Flow marker catalog.
INSERT INTO "flow_markers"
  ("id", "tenantId", "name", "code", "category", "clone", "fluorochrome",
   "description", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'fcm_' || v.code || '_' || t.id, t.id, v.name, v.code, v.category,
       NULL, NULL, NULL, true, v.sort, now(), now()
FROM "tenants" t
JOIN (VALUES
  ('CD45', 'CD45', 'LEUKOCYTE_COMMON', 1),
  ('CD3',  'CD3',  'T_CELL', 2),
  ('CD4',  'CD4',  'T_CELL_HELPER', 3),
  ('CD8',  'CD8',  'T_CELL_CYTOTOXIC', 4),
  ('CD5',  'CD5',  'T_CELL', 5),
  ('CD7',  'CD7',  'T_CELL', 6),
  ('CD19', 'CD19', 'B_CELL', 7),
  ('CD20', 'CD20', 'B_CELL', 8),
  ('CD22', 'CD22', 'B_CELL', 9),
  ('CD10', 'CD10', 'PRE_B_CELL', 10),
  ('CD13', 'CD13', 'MYELOID', 11),
  ('CD33', 'CD33', 'MYELOID', 12),
  ('CD34', 'CD34', 'STEM_PROGENITOR', 13),
  ('CD38', 'CD38', 'PLASMA_CELL', 14),
  ('CD16', 'CD16', 'NK', 15),
  ('CD56', 'CD56', 'NK', 16),
  ('CD58', 'CD58', 'B_CELL', 17),
  ('CD64', 'CD64', 'MONOCYTE', 18),
  ('CD14', 'CD14', 'MONOCYTE', 19),
  ('CD15', 'CD15', 'GRANULOCYTE', 20),
  ('CD24', 'CD24', 'GRANULOCYTE', 21),
  ('CD123', 'CD123', 'STEM_PROGENITOR', 22),
  ('FLAER', 'FLAER', 'SCREENING', 23)
) AS v(code, name, category, sort)
  ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "flow_markers" fm
  WHERE fm."tenantId" = t.id AND fm.code = v.code
);

-- 4) Antibody / reagent catalog (one reagent per (panel, marker) assignment).
INSERT INTO "flow_antibodies"
  ("id", "tenantId", "markerId", "antibody", "clone", "fluorochrome",
   "manufacturer", "lotNumber", "expiryDate", "isActive", "createdAt", "updatedAt")
SELECT 'fca_' || v.code || '_' || t.id, t.id,
       'fcm_' || v.marker || '_' || t.id,
       v.antibody, v.clone, v.fluorochrome, v.manufacturer, NULL, NULL, true,
       now(), now()
FROM "tenants" t
JOIN (VALUES
  ('a1', 'CD3',  'CD3 FITC', 'SK7', 'FITC', 'BD Biosciences'),
  ('a2', 'CD4',  'CD4 PE', 'SK3', 'PE', 'BD Biosciences'),
  ('a3', 'CD8',  'CD8 PerCP', 'SK1', 'PerCP', 'BD Biosciences'),
  ('a4', 'CD19', 'CD19 APC', 'SJ25C1', 'APC', 'BD Biosciences'),
  ('a5', 'CD16', 'CD16 PE-Cy7', 'B73.1', 'PE-Cy7', 'BD Biosciences'),
  ('a6', 'CD56', 'CD56 PE-Cy7', 'NCAM16.2', 'PE-Cy7', 'BD Biosciences'),
  ('a7', 'CD45', 'CD45 APC-H7', '2D1', 'APC-H7', 'BD Biosciences'),
  ('a8', 'CD19', 'CD19 FITC', 'SJ25C1', 'FITC', 'BD Biosciences'),
  ('a9', 'CD56', 'CD56 PE', 'NCAM16.2', 'PE', 'BD Biosciences'),
  ('a10', 'CD3', 'CD3 PerCP-Cy5.5', 'SK7', 'PerCP-Cy5.5', 'BD Biosciences'),
  ('a11', 'CD5', 'CD5 PE-Cy7', 'L17F12', 'PE-Cy7', 'BD Biosciences'),
  ('a12', 'CD7', 'CD7 APC', 'M-T701', 'APC', 'BD Biosciences'),
  ('a13', 'CD10', 'CD10 APC-Cy7', 'HI10a', 'APC-Cy7', 'BD Biosciences'),
  ('a14', 'CD20', 'CD20 Pacific Blue', '2H7', 'Pacific Blue', 'BD Biosciences'),
  ('a15', 'CD34', 'CD34 PE-Cy7', '581', 'PE-Cy7', 'BD Biosciences'),
  ('a16', 'CD33', 'CD33 PE', 'WM53', 'PE', 'BD Biosciences'),
  ('a17', 'CD45', 'CD45 APC-H7', '2D1', 'APC-H7', 'BD Biosciences'),
  ('a18', 'CD19', 'CD19 FITC', 'SJ25C1', 'FITC', 'BD Biosciences'),
  ('a19', 'CD20', 'CD20 PE', 'L27', 'PE', 'BD Biosciences'),
  ('a20', 'CD34', 'CD34 PerCP-Cy5.5', '581', 'PerCP-Cy5.5', 'BD Biosciences'),
  ('a21', 'CD45', 'CD45 V500', '2D1', 'V500', 'BD Biosciences'),
  ('a22', 'CD38', 'CD38 PE-Cy7', 'HB7', 'PE-Cy7', 'BD Biosciences'),
  ('a23', 'CD58', 'CD58 FITC', '1C10', 'FITC', 'BD Biosciences'),
  ('a24', 'CD10', 'CD10 APC', 'HI10a', 'APC', 'BD Biosciences'),
  ('a25', 'CD123', 'CD123 PE', '7G3', 'PE', 'BD Biosciences'),
  ('a26', 'FLAER', 'FLAER FITC', NULL, 'FITC', 'Cedarlane'),
  ('a27', 'CD24', 'CD24 PE', 'ML5', 'PE', 'BD Biosciences'),
  ('a28', 'CD14', 'CD14 PerCP-Cy5.5', 'M5E2', 'PerCP-Cy5.5', 'BD Biosciences'),
  ('a29', 'CD15', 'CD15 FITC', 'HI98', 'FITC', 'BD Biosciences'),
  ('a30', 'CD45', 'CD45 APC-H7', '2D1', 'APC-H7', 'BD Biosciences')
) AS v(code, marker, antibody, clone, fluorochrome, manufacturer)
  ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "flow_antibodies" fa
  WHERE fa."tenantId" = t.id AND fa.antibody = v.antibody
);

-- 5) Panel -> marker composition (colors per panel).
INSERT INTO "flow_panel_markers"
  ("id", "tenantId", "panelId", "markerId", "antibodyId", "fluorochrome", "sortOrder")
SELECT 'fpm_' || v.code || '_' || t.id, t.id,
       'fcp_' || v.panel || '_' || t.id,
       'fcm_' || v.marker || '_' || t.id,
       NULL, v.fluorochrome, v.sort
FROM "tenants" t
JOIN (VALUES
  ('p1',  'FCM-LYS', 'CD3',  'FITC', 1),
  ('p2',  'FCM-LYS', 'CD4',  'PE', 2),
  ('p3',  'FCM-LYS', 'CD8',  'PerCP', 3),
  ('p4',  'FCM-LYS', 'CD19', 'APC', 4),
  ('p5',  'FCM-LYS', 'CD16', 'PE-Cy7', 5),
  ('p6',  'FCM-LYS', 'CD56', 'PE-Cy7', 6),
  ('p7',  'FCM-LYS', 'CD45', 'APC-H7', 7),
  ('p8',  'FCM-ISP', 'CD45', 'APC-H7', 1),
  ('p9',  'FCM-ISP', 'CD19', 'FITC', 2),
  ('p10', 'FCM-ISP', 'CD56', 'PE', 3),
  ('p11', 'FCM-ISP', 'CD3',  'PerCP-Cy5.5', 4),
  ('p12', 'FCM-ISP', 'CD5',  'PE-Cy7', 5),
  ('p13', 'FCM-ISP', 'CD7',  'APC', 6),
  ('p14', 'FCM-ISP', 'CD10', 'APC-Cy7', 7),
  ('p15', 'FCM-ISP', 'CD20', 'Pacific Blue', 8),
  ('p16', 'FCM-ISP', 'CD34', 'PE-Cy7', 9),
  ('p17', 'FCM-ISP', 'CD33', 'PE', 10),
  ('p18', 'FCM-MRD', 'CD19', 'FITC', 1),
  ('p19', 'FCM-MRD', 'CD20', 'PE', 2),
  ('p20', 'FCM-MRD', 'CD34', 'PerCP-Cy5.5', 3),
  ('p21', 'FCM-MRD', 'CD45', 'V500', 4),
  ('p22', 'FCM-MRD', 'CD38', 'PE-Cy7', 5),
  ('p23', 'FCM-MRD', 'CD58', 'FITC', 6),
  ('p24', 'FCM-MRD', 'CD10', 'APC', 7),
  ('p25', 'FCM-MRD', 'CD123', 'PE', 8),
  ('p26', 'FCM-PNH', 'FLAER', 'FITC', 1),
  ('p27', 'FCM-PNH', 'CD24', 'PE', 2),
  ('p28', 'FCM-PNH', 'CD14', 'PerCP-Cy5.5', 3),
  ('p29', 'FCM-PNH', 'CD15', 'FITC', 4),
  ('p30', 'FCM-PNH', 'CD45', 'APC-H7', 5)
) AS v(code, panel, marker, fluorochrome, sort)
  ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "flow_panel_markers" fpm
  WHERE fpm."panelId" = 'fcp_' || v.panel || '_' || t.id
    AND fpm."markerId" = 'fcm_' || v.marker || '_' || t.id
);

-- 6) Instrument / platform catalog.
INSERT INTO "flow_instruments"
  ("id", "tenantId", "name", "platform", "manufacturer", "model", "serialNumber",
   "channels", "parameters", "location", "status", "lastQcAt", "createdAt", "updatedAt")
SELECT 'fci_' || v.code || '_' || t.id, t.id, v.name, v.platform, v.manufacturer,
       v.model, NULL, v.channels, v.channels, v.location, 'ACTIVE', NULL,
       now(), now()
FROM "tenants" t
JOIN (VALUES
  ('canto',  'BD FACSCanto II - Main Lab', 'FACSCanto II', 'BD Biosciences', 'FACSCanto II', 8, 'Pathology Lab'),
  ('calibur', 'BD FACSCalibur - Hematology', 'FACSCalibur', 'BD Biosciences', 'FACSCalibur', 4, 'Hematology Lab'),
  ('aurora', 'Cytek Aurora - North Wing', 'Cytek Aurora', 'Cytek Biosciences', 'Aurora', 18, 'North Wing Lab')
) AS v(code, name, platform, manufacturer, model, channels, location)
  ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "flow_instruments" fi
  WHERE fi."tenantId" = t.id AND fi.name = v.name
);