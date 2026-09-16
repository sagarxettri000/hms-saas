-- Duplicate-prevention for blood unit registration: a unit number is unique
-- within its tenant. Existing data had no duplicate (tenantId, unitNumber)
-- pairs, so the constraint can be applied directly.
CREATE UNIQUE INDEX "blood_units_tenantId_unitNumber_key" ON "blood_units"("tenantId", "unitNumber");
