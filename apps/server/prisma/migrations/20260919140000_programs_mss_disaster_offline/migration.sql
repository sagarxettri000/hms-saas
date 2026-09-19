-- MSS compliance, government medicine segregation, Aama incentives,
-- Sifaris repository, disaster mode, offline sync, bilingual dictionary
-- (specs §66–§72)

-- Enums
CREATE TYPE "FundingSource" AS ENUM ('PRIVATE_RETAIL', 'GOVERNMENT_FREE_PROGRAM', 'DONATED', 'HOSPITAL_PROCURED', 'INSURANCE_PROGRAM', 'SPECIAL_PROGRAM', 'OTHER');
CREATE TYPE "MssStandardStatus" AS ENUM ('ACTIVE', 'RETIRED');
CREATE TYPE "MssComplianceStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE', 'EXPIRED', 'PENDING_REVIEW');
CREATE TYPE "MssEvidenceStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE "CapaStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'CLOSED', 'OVERDUE');
CREATE TYPE "AamaPaymentStatus" AS ENUM ('ELIGIBILITY_PENDING', 'ELIGIBLE', 'NOT_ELIGIBLE', 'APPROVED', 'PAYMENT_PENDING', 'SUBMITTED', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED', 'RECONCILED');
CREATE TYPE "SifarisStatus" AS ENUM ('UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');
CREATE TYPE "DisasterMode" AS ENUM ('NORMAL_MODE', 'DISASTER_MODE', 'MASS_CASUALTY_MODE');
CREATE TYPE "TriageCategory" AS ENUM ('RED', 'YELLOW', 'GREEN', 'BLACK');
CREATE TYPE "CasualtyStatus" AS ENUM ('AWAITING_ASSESSMENT', 'IN_TREATMENT', 'ADMITTED', 'TRANSFERRED', 'DISCHARGED', 'DECEASED', 'MISSING');
CREATE TYPE "OfflineSyncState" AS ENUM ('LOCAL_ONLY', 'QUEUED', 'UPLOADING', 'CENTRAL_VALIDATION', 'SYNCED', 'CONFLICT', 'REJECTED', 'RETRY_PENDING', 'MANUAL_REVIEW');

-- InventoryItem funding segregation (§67)
ALTER TABLE "inventory_items" ADD COLUMN "fundingSource" "FundingSource" NOT NULL DEFAULT 'PRIVATE_RETAIL';
ALTER TABLE "inventory_items" ADD COLUMN "programName" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "govSchemeRef" TEXT;

-- MSS
CREATE TABLE "mss_standard_sets" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "setName" TEXT NOT NULL, "facilityLevel" TEXT NOT NULL,
    "declaredCount" INTEGER NOT NULL, "authority" TEXT, "sourceRef" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL, "effectiveTo" TIMESTAMP(3),
    "status" "MssStandardStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mss_standard_sets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mss_standard_sets_tenantId_facilityLevel_status_idx" ON "mss_standard_sets"("tenantId", "facilityLevel", "status");
ALTER TABLE "mss_standard_sets" ADD CONSTRAINT "mss_standard_sets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mss_standards" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "setId" TEXT NOT NULL,
    "standardCode" TEXT NOT NULL, "standardName" TEXT NOT NULL, "domain" TEXT NOT NULL,
    "requirement" TEXT, "isMandatory" BOOLEAN NOT NULL DEFAULT true, "evidenceRequired" BOOLEAN NOT NULL DEFAULT true,
    "evidenceTypes" JSONB, "responsibleDept" TEXT, "responsibleRole" TEXT, "scoringMethod" TEXT,
    "weight" DECIMAL(8,2) NOT NULL DEFAULT 1, "complianceThreshold" DECIMAL(5,2), "reviewFrequency" TEXT,
    "sourceRef" TEXT, "status" "MssStandardStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mss_standards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mss_standards_setId_standardCode_key" ON "mss_standards"("setId", "standardCode");
CREATE INDEX "mss_standards_tenantId_domain_idx" ON "mss_standards"("tenantId", "domain");
ALTER TABLE "mss_standards" ADD CONSTRAINT "mss_standards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mss_standards" ADD CONSTRAINT "mss_standards_setId_fkey" FOREIGN KEY ("setId") REFERENCES "mss_standard_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mss_assessments" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "standardId" TEXT NOT NULL, "standardVersion" INTEGER NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "assessedBy" TEXT,
    "score" DECIMAL(5,2), "status" "MssComplianceStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "evidenceSnapshot" JSONB, "comments" TEXT, "approval" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mss_assessments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mss_assessments_tenantId_standardId_idx" ON "mss_assessments"("tenantId", "standardId");
CREATE INDEX "mss_assessments_tenantId_assessmentDate_idx" ON "mss_assessments"("tenantId", "assessmentDate");
ALTER TABLE "mss_assessments" ADD CONSTRAINT "mss_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mss_assessments" ADD CONSTRAINT "mss_assessments_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "mss_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mss_evidence" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "standardId" TEXT NOT NULL,
    "title" TEXT NOT NULL, "docType" TEXT NOT NULL, "documentRef" TEXT, "documentVersion" TEXT,
    "validFrom" TIMESTAMP(3), "validTo" TIMESTAMP(3),
    "status" "MssEvidenceStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "uploadedBy" TEXT, "reviewedBy" TEXT, "reviewDate" TIMESTAMP(3), "reviewNotes" TEXT, "auditTrail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mss_evidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mss_evidence_tenantId_standardId_idx" ON "mss_evidence"("tenantId", "standardId");
ALTER TABLE "mss_evidence" ADD CONSTRAINT "mss_evidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mss_evidence" ADD CONSTRAINT "mss_evidence_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "mss_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "corrective_actions" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "assessmentId" TEXT NOT NULL,
    "rootCause" TEXT, "responsiblePerson" TEXT, "dueDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "requiredEvidence" JSONB, "reviewNotes" TEXT,
    "status" "CapaStatus" NOT NULL DEFAULT 'OPEN', "closedBy" TEXT, "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "corrective_actions_tenantId_status_idx" ON "corrective_actions"("tenantId", "status");
CREATE INDEX "corrective_actions_tenantId_dueDate_idx" ON "corrective_actions"("tenantId", "dueDate");
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "mss_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Aama
CREATE TABLE "aama_incentive_cases" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL, "pregnancyRef" TEXT, "deliveryEncounterId" TEXT,
    "deliveryDate" TIMESTAMP(3), "facilityName" TEXT, "ancMilestones" JSONB,
    "eligibilityStatus" TEXT, "ruleId" TEXT, "ruleVersion" INTEGER,
    "approvedAmount" DECIMAL(12,2), "paymentStatus" "AamaPaymentStatus" NOT NULL DEFAULT 'ELIGIBILITY_PENDING',
    "paymentRef" TEXT, "paymentDate" TIMESTAMP(3), "failureReason" TEXT,
    "createdBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "aama_incentive_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "aama_incentive_cases_caseNumber_key" ON "aama_incentive_cases"("caseNumber");
CREATE INDEX "aama_incentive_cases_tenantId_paymentStatus_idx" ON "aama_incentive_cases"("tenantId", "paymentStatus");
CREATE INDEX "aama_incentive_cases_tenantId_patientId_idx" ON "aama_incentive_cases"("tenantId", "patientId");
ALTER TABLE "aama_incentive_cases" ADD CONSTRAINT "aama_incentive_cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aama_incentive_cases" ADD CONSTRAINT "aama_incentive_cases_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sifaris
CREATE TABLE "sifaris_documents" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
    "encounterId" TEXT, "relatedProgram" TEXT, "relatedCaseId" TEXT,
    "municipality" TEXT NOT NULL, "wardNo" TEXT, "recommendationNo" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL, "issuingAuthority" TEXT, "recommendedBenefit" TEXT,
    "validFrom" TIMESTAMP(3), "validTo" TIMESTAMP(3), "documentRef" TEXT, "documentHash" TEXT,
    "status" "SifarisStatus" NOT NULL DEFAULT 'UPLOADED',
    "verifiedBy" TEXT, "verificationDate" TIMESTAMP(3), "verificationNotes" TEXT,
    "createdBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sifaris_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sifaris_documents_tenantId_patientId_status_idx" ON "sifaris_documents"("tenantId", "patientId", "status");
ALTER TABLE "sifaris_documents" ADD CONSTRAINT "sifaris_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sifaris_documents" ADD CONSTRAINT "sifaris_documents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Disaster
CREATE TABLE "disaster_activations" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "mode" "DisasterMode" NOT NULL,
    "incidentName" TEXT, "incidentType" TEXT, "incidentRef" TEXT, "authority" TEXT,
    "expectedDurationHours" INTEGER, "activatedBy" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deactivatedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "disaster_activations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "disaster_activations_tenantId_isActive_idx" ON "disaster_activations"("tenantId", "isActive");
ALTER TABLE "disaster_activations" ADD CONSTRAINT "disaster_activations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "disaster_casualties" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "activationId" TEXT NOT NULL,
    "patientId" TEXT, "tempCasualtyId" TEXT NOT NULL, "wristbandCode" TEXT,
    "displayName" TEXT, "currentCategory" "TriageCategory", "status" "CasualtyStatus" NOT NULL DEFAULT 'AWAITING_ASSESSMENT',
    "triageHistory" JSONB, "destination" TEXT, "payerClass" TEXT, "provisionalInvoiceRef" TEXT,
    "createdBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "disaster_casualties_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "disaster_casualties_tempCasualtyId_key" ON "disaster_casualties"("tempCasualtyId");
CREATE INDEX "disaster_casualties_tenantId_activationId_currentCategory_idx" ON "disaster_casualties"("tenantId", "activationId", "currentCategory");
CREATE INDEX "disaster_casualties_tenantId_status_idx" ON "disaster_casualties"("tenantId", "status");
ALTER TABLE "disaster_casualties" ADD CONSTRAINT "disaster_casualties_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disaster_casualties" ADD CONSTRAINT "disaster_casualties_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "disaster_activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disaster_casualties" ADD CONSTRAINT "disaster_casualties_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Offline sync
CREATE TABLE "offline_sync_items" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "localTxnId" TEXT NOT NULL,
    "localNodeId" TEXT NOT NULL, "userId" TEXT, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL, "payload" JSONB, "checksum" TEXT, "sequenceNo" BIGINT,
    "syncState" "OfflineSyncState" NOT NULL DEFAULT 'LOCAL_ONLY',
    "attemptCount" INTEGER NOT NULL DEFAULT 0, "lastAttemptAt" TIMESTAMP(3), "lastError" TEXT,
    "conflictDetail" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offline_sync_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "offline_sync_items_localTxnId_key" ON "offline_sync_items"("localTxnId");
CREATE INDEX "offline_sync_items_tenantId_syncState_idx" ON "offline_sync_items"("tenantId", "syncState");
CREATE INDEX "offline_sync_items_tenantId_localNodeId_idx" ON "offline_sync_items"("tenantId", "localNodeId");
ALTER TABLE "offline_sync_items" ADD CONSTRAINT "offline_sync_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Translation dictionary
CREATE TABLE "translation_terms" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "domain" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL, "language" TEXT NOT NULL DEFAULT 'ne', "translatedText" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1, "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "translation_terms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "translation_terms_tenantId_domain_sourceText_language_key" ON "translation_terms"("tenantId", "domain", "sourceText", "language");
CREATE INDEX "translation_terms_tenantId_domain_isActive_idx" ON "translation_terms"("tenantId", "domain", "isActive");
ALTER TABLE "translation_terms" ADD CONSTRAINT "translation_terms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Government program batch metadata + utilization
CREATE TABLE "gov_program_batch_meta" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "inventoryItemId" TEXT NOT NULL,
    "programName" TEXT, "govScheme" TEXT, "fundingSource" TEXT, "procurementSource" TEXT,
    "distributionRestrictions" JSONB, "eligiblePopulation" TEXT, "reportingRequirements" JSONB,
    "receivedDate" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gov_program_batch_meta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gov_program_batch_meta_inventoryItemId_key" ON "gov_program_batch_meta"("inventoryItemId");
ALTER TABLE "gov_program_batch_meta" ADD CONSTRAINT "gov_program_batch_meta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gov_program_batch_meta" ADD CONSTRAINT "gov_program_batch_meta_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "gov_program_utilizations" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "inventoryItemId" TEXT NOT NULL,
    "patientId" TEXT, "encounterId" TEXT, "programName" TEXT, "quantity" DECIMAL(12,3) NOT NULL,
    "batchNumber" TEXT, "utilizationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    CONSTRAINT "gov_program_utilizations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gov_program_utilizations_tenantId_programName_idx" ON "gov_program_utilizations"("tenantId", "programName");
CREATE INDEX "gov_program_utilizations_tenantId_utilizationDate_idx" ON "gov_program_utilizations"("tenantId", "utilizationDate");
ALTER TABLE "gov_program_utilizations" ADD CONSTRAINT "gov_program_utilizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gov_program_utilizations" ADD CONSTRAINT "gov_program_utilizations_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
