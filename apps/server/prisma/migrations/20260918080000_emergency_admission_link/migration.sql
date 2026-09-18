-- Link emergency cases to real IPD admissions so ER admissions participate in
-- bed management, transfers and discharge billing. Nullable: only ER cases
-- that were actually admitted get an admission row.
ALTER TABLE "emergency_cases" ADD COLUMN "admissionId" TEXT;

CREATE INDEX "emergency_cases_tenantId_admissionId_idx" ON "emergency_cases"("tenantId", "admissionId");

ALTER TABLE "emergency_cases" ADD CONSTRAINT "emergency_cases_admissionId_fkey"
  FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "emergency_cases_admissionId_key" ON "emergency_cases"("admissionId");
