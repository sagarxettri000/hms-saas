-- MoHP compliance gaps: FHIR bundle provenance, consent records, blood returns
CREATE TABLE "fhir_bundle_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bundle_type" TEXT NOT NULL,
    "internal_type" TEXT,
    "internal_id" TEXT,
    "profile_version" TEXT,
    "fhir_version" TEXT NOT NULL DEFAULT '4.0.1',
    "generated_by" TEXT,
    "validation" JSONB,
    "resource_count" INTEGER NOT NULL DEFAULT 0,
    "content_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fhir_bundle_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "data_scope" TEXT,
    "recipient" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blood_unit_returns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "returned_by" TEXT,
    "reason" TEXT,
    "returned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "blood_unit_returns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fhir_bundle_records_tenant_type_idx" ON "fhir_bundle_records"("tenant_id", "bundle_type");
CREATE INDEX "fhir_bundle_records_tenant_internal_idx" ON "fhir_bundle_records"("tenant_id", "internal_type", "internal_id");
CREATE INDEX "consent_records_tenant_patient_status_idx" ON "consent_records"("tenant_id", "patient_id", "status");
CREATE INDEX "blood_unit_returns_tenant_unit_idx" ON "blood_unit_returns"("tenant_id", "unit_id");

ALTER TABLE "fhir_bundle_records" ADD CONSTRAINT "fhir_bundle_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blood_unit_returns" ADD CONSTRAINT "blood_unit_returns_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "blood_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
