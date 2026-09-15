-- Remove the Flow Cytometry module completely (added by
-- 20260915074500_add_flow_cytometry and 20260915074600_add_flow_study_status).
-- Drops the module tables, deletes the seeded flow catalog rows
-- (deterministic 'fct_'/'fcp_' ids), and removes the panel linkage column.
-- All statements are idempotent so this is safe on databases that never had
-- the module (e.g. fresh environments created after the module was removed).

DROP TABLE IF EXISTS "flow_marker_results" CASCADE;
DROP TABLE IF EXISTS "flow_populations" CASCADE;
DROP TABLE IF EXISTS "flow_analyses" CASCADE;
DROP TABLE IF EXISTS "flow_runs" CASCADE;
DROP TABLE IF EXISTS "flow_studies" CASCADE;
DROP TABLE IF EXISTS "flow_panel_markers" CASCADE;
DROP TABLE IF EXISTS "flow_instruments" CASCADE;
DROP TABLE IF EXISTS "flow_antibodies" CASCADE;
DROP TABLE IF EXISTS "flow_markers" CASCADE;

DELETE FROM "lab_test_panel_items"
WHERE "panelId" LIKE 'fcp\_%'
   OR "labTestId" LIKE 'fct\_%';

DELETE FROM "lab_test_panels"
WHERE "id" LIKE 'fcp\_%'
   OR "labTestId" LIKE 'fct\_%';

DELETE FROM "lab_tests"
WHERE "id" LIKE 'fct\_%';

ALTER TABLE "lab_test_panels" DROP COLUMN IF EXISTS "labTestId";