-- Migration: seed_billing_schemes
-- Description: Seed default billing schemes for every tenant that does not
--              already have them. The Billing "new invoice" Scheme dropdown is
--              populated from billing_schemes; previously this table was never
--              seeded, so the dropdown was empty in every tenant.
--
-- Additive and idempotent: uses ON CONFLICT (tenantId, name), never deletes or
-- overwrites existing rows, safe on production.

INSERT INTO "billing_schemes" ("id", "tenantId", "name", "code", "description", "discountPercent", "rules", "isActive", "createdAt", "updatedAt")
SELECT
  'schm-' || t.id || '-' || v.code,
  t.id,
  v.name,
  v.code,
  v.description,
  v.discountPercent,
  NULL,
  true,
  now(),
  now()
FROM (SELECT id FROM "tenants") t
CROSS JOIN (VALUES
  ('General / Self Pay', 'GENERAL', 'Standard rates with no prior approval', 0),
  ('OPD', 'OPD', 'Outpatient department standard scheme', 0),
  ('Health Insurance', 'INSURANCE', 'Covered by a health insurance policy', 0),
  ('Corporate / Institution', 'CORPORATE', 'Corporate or institutional billing with agreed rates', 0),
  ('Government Scheme', 'GOVERNMENT', 'Government / social security funded care', 0),
  ('Staff & Dependents', 'STAFF', 'Hospital staff and their dependents', 10)
) AS v(name, code, description, discountPercent)
ON CONFLICT ("tenantId", "name") DO NOTHING;
