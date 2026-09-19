-- National digital-health interoperability (specs §77–§83)
-- All classified fields are TEXT per the codebase convention; enums live in app code.
-- Idempotent guards: this migration was re-applied after a partial run.

ALTER TABLE "diagnoses" ADD COLUMN IF NOT EXISTS "icd11Code" TEXT;
ALTER TABLE "diagnoses" ADD COLUMN IF NOT EXISTS "icd11Display" TEXT;
ALTER TABLE "diagnoses" ADD COLUMN IF NOT EXISTS "icd11Version" TEXT;
ALTER TABLE "diagnoses" ADD COLUMN IF NOT EXISTS "certainty" TEXT;
ALTER TABLE "diagnoses" ADD COLUMN IF NOT EXISTS "onsetDate" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "waste_manifests" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "manifestNumber" TEXT NOT NULL,
    "transporter" TEXT, "receivingEntity" TEXT, "treatmentMethod" TEXT, "disposalMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "dispatchedAt" TIMESTAMP(3), "confirmedAt" TIMESTAMP(3), "confirmationRef" TEXT,
    "preparedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "waste_manifests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "waste_manifests_manifestNumber_key" ON "waste_manifests"("manifestNumber");
CREATE INDEX IF NOT EXISTS "waste_manifests_tenantId_status_idx" ON "waste_manifests"("tenantId", "status");
ALTER TABLE "waste_manifests" ADD CONSTRAINT "waste_manifests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "icd_codes" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL, "display" TEXT NOT NULL, "chapterRef" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en', "synonyms" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true, "deprecatedAt" TIMESTAMP(3),
    "version" TEXT NOT NULL, "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "icd_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "icd_codes_tenantId_code_version_language_key" ON "icd_codes"("tenantId", "code", "version", "language");
CREATE INDEX IF NOT EXISTS "icd_codes_tenantId_isActive_version_idx" ON "icd_codes"("tenantId", "isActive", "version");
CREATE INDEX IF NOT EXISTS "icd_codes_tenantId_display_idx" ON "icd_codes"("tenantId", "display");
ALTER TABLE "icd_codes" ADD CONSTRAINT "icd_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "fhir_mappings" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "sourceEntity" TEXT NOT NULL, "sourceField" TEXT,
    "fhirResource" TEXT NOT NULL, "fhirElement" TEXT,
    "transformRule" JSONB, "terminologyMap" JSONB, "mappingVersion" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fhir_mappings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "fhir_mappings_tenantId_sourceEntity_fhirResource_idx" ON "fhir_mappings"("tenantId", "sourceEntity", "fhirResource");
ALTER TABLE "fhir_mappings" ADD CONSTRAINT "fhir_mappings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "surveillance_rules" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "diseaseName" TEXT NOT NULL, "icd11Code" TEXT, "triggerIcd10" TEXT, "triggerLabTest" TEXT,
    "reportability" TEXT NOT NULL DEFAULT 'MANDATORY', "urgency" TEXT NOT NULL DEFAULT 'DAILY',
    "requiredFields" JSONB, "caseDefinition" TEXT, "destination" TEXT NOT NULL DEFAULT 'EWARS',
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "surveillance_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "surveillance_rules_tenantId_isActive_urgency_idx" ON "surveillance_rules"("tenantId", "isActive", "urgency");
ALTER TABLE "surveillance_rules" ADD CONSTRAINT "surveillance_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "interop_transactions" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "patientId" TEXT, "encounterId" TEXT,
    "destination" TEXT NOT NULL, "purpose" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL, "sourceEntity" TEXT NOT NULL, "sourceEntityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB, "payloadVersion" TEXT NOT NULL DEFAULT '1.0', "mappingVersion" TEXT, "ruleVersion" INTEGER,
    "lineage" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING', "failureClass" TEXT,
    "response" JSONB, "ackRef" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0, "lastAttemptAt" TIMESTAMP(3), "lastError" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "interop_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "interop_transactions_idempotencyKey_key" ON "interop_transactions"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "interop_transactions_tenantId_status_idx" ON "interop_transactions"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "interop_transactions_tenantId_destination_purpose_idx" ON "interop_transactions"("tenantId", "destination", "purpose");
CREATE INDEX IF NOT EXISTS "interop_transactions_tenantId_createdAt_idx" ON "interop_transactions"("tenantId", "createdAt");
ALTER TABLE "interop_transactions" ADD CONSTRAINT "interop_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interop_transactions" ADD CONSTRAINT "interop_transactions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "vital_events" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL, "eventDateTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT, "facilityName" TEXT,
    "motherName" TEXT, "newbornSex" TEXT, "birthWeightGrams" INTEGER, "deliveryType" TEXT, "attendingClinician" TEXT,
    "certifyingClinician" TEXT, "immediateCause" TEXT, "underlyingCause" TEXT, "contributingConditions" JSONB, "causeOfDeathIcd11" TEXT,
    "certificationStatus" TEXT NOT NULL DEFAULT 'UNCERTIFIED',
    "registrationStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "registrationRef" TEXT, "certificateRef" TEXT, "certificateTemplateVersion" TEXT, "amendments" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vital_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vital_events_tenantId_eventType_registrationStatus_idx" ON "vital_events"("tenantId", "eventType", "registrationStatus");
CREATE INDEX IF NOT EXISTS "vital_events_tenantId_patientId_idx" ON "vital_events"("tenantId", "patientId");
ALTER TABLE "vital_events" ADD CONSTRAINT "vital_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vital_events" ADD CONSTRAINT "vital_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "blood_crossmatches" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL, "encounterId" TEXT, "unitId" TEXT NOT NULL,
    "requestedComponent" TEXT NOT NULL, "patientGroup" TEXT NOT NULL, "donorGroup" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1, "method" TEXT,
    "result" TEXT NOT NULL, "testedBy" TEXT, "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3), "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "blood_crossmatches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "blood_crossmatches_tenantId_patientId_idx" ON "blood_crossmatches"("tenantId", "patientId");
CREATE INDEX IF NOT EXISTS "blood_crossmatches_tenantId_unitId_idx" ON "blood_crossmatches"("tenantId", "unitId");
ALTER TABLE "blood_crossmatches" ADD CONSTRAINT "blood_crossmatches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blood_crossmatches" ADD CONSTRAINT "blood_crossmatches_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "blood_transfusions" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL, "encounterId" TEXT, "unitId" TEXT NOT NULL, "crossmatchId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3),
    "volumeMl" INTEGER, "administeredBy" TEXT, "verifiedBy" TEXT,
    "bedsideScan" JSONB, "location" TEXT, "indication" TEXT, "vitals" JSONB,
    "reaction" TEXT, "reactionSeverity" TEXT, "intervention" TEXT, "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blood_transfusions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "blood_transfusions_tenantId_patientId_idx" ON "blood_transfusions"("tenantId", "patientId");
CREATE INDEX IF NOT EXISTS "blood_transfusions_tenantId_unitId_idx" ON "blood_transfusions"("tenantId", "unitId");
ALTER TABLE "blood_transfusions" ADD CONSTRAINT "blood_transfusions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blood_transfusions" ADD CONSTRAINT "blood_transfusions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "waste_ledger_entries" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL, "department" TEXT NOT NULL, "category" TEXT NOT NULL,
    "weightKg" DECIMAL(10,2) NOT NULL, "containerCount" INTEGER,
    "collectedAt" TIMESTAMP(3), "collectedBy" TEXT, "storageLocation" TEXT,
    "treatmentMethod" TEXT, "disposalMethod" TEXT, "transferDestination" TEXT,
    "custodyTrail" JSONB, "responsibleOfficer" TEXT,
    "manifestId" TEXT, "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "waste_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "waste_ledger_entries_tenantId_entryDate_department_category_key" ON "waste_ledger_entries"("tenantId", "entryDate", "department", "category");
CREATE INDEX IF NOT EXISTS "waste_ledger_entries_tenantId_entryDate_idx" ON "waste_ledger_entries"("tenantId", "entryDate");
CREATE INDEX IF NOT EXISTS "waste_ledger_entries_tenantId_category_idx" ON "waste_ledger_entries"("tenantId", "category");
ALTER TABLE "waste_ledger_entries" ADD CONSTRAINT "waste_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waste_ledger_entries_manifestId_fkey') THEN
    ALTER TABLE "waste_ledger_entries" ADD CONSTRAINT "waste_ledger_entries_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "waste_manifests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
