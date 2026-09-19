-- Nepal Regulatory, Social Care & Special Patient Management (spec §65)

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE "RegulatoryRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "FreeBedStatus" AS ENUM ('OCCUPIED', 'RELEASED');
CREATE TYPE "SsuAssessmentStatus" AS ENUM ('DRAFT', 'RECOMMENDED', 'COMMITTEE_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED');
CREATE TYPE "BipannaCaseStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "BipannaClaimStatus" AS ENUM ('PREPARED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SETTLED');
CREATE TYPE "BrainDeathStatus" AS ENUM ('NOT_SUSPECTED', 'SUSPECTED', 'UNDER_ASSESSMENT', 'PROTOCOL_IN_PROGRESS', 'CERTIFICATION_PENDING', 'CERTIFIED', 'DONATION_DISCUSSION', 'DONOR_CONSENTED', 'DONOR_DECLINED', 'NOT_ELIGIBLE', 'TRANSFERRED_FOR_COORDINATION', 'CLOSED');
CREATE TYPE "DonorAlertStatus" AS ENUM ('SENT', 'ACKNOWLEDGED', 'RESPONDED', 'CLOSED');
CREATE TYPE "QueuePriority" AS ENUM ('NORMAL', 'SENIOR_PRIORITY');
CREATE TYPE "VipAccessAction" AS ENUM ('VIEW', 'EXPORT', 'PRINT', 'BREAK_GLASS', 'CLASSIFY', 'REVOKE');
CREATE TYPE "VipClassificationStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE "GovSyncStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'QUEUED', 'SUBMITTED', 'ACKNOWLEDGED', 'ACCEPTED', 'REJECTED', 'FAILED', 'RETRYING', 'CANCELLED');
CREATE TYPE "SubsidyLedgerEntryType" AS ENUM ('APPROVAL', 'UTILIZATION', 'REVERSAL', 'ADJUSTMENT', 'CLAIM', 'SETTLEMENT');

-- ============================================================
-- regulatory_rules
-- ============================================================
CREATE TABLE "regulatory_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "authority" TEXT,
    "legalReference" TEXT,
    "category" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "RegulatoryRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "regulatory_rules_tenantId_ruleKey_version_key" ON "regulatory_rules"("tenantId", "ruleKey", "version");
CREATE INDEX "regulatory_rules_tenantId_ruleKey_status_idx" ON "regulatory_rules"("tenantId", "ruleKey", "status");
ALTER TABLE "regulatory_rules" ADD CONSTRAINT "regulatory_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- free_bed_allocations
-- ============================================================
CREATE TABLE "free_bed_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "admissionId" TEXT,
    "bedId" TEXT,
    "eligibilityBasis" TEXT,
    "verificationDocRef" TEXT,
    "verificationAuthority" TEXT,
    "status" "FreeBedStatus" NOT NULL DEFAULT 'OCCUPIED',
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "ruleVersion" INTEGER NOT NULL,
    "ruleId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "free_bed_allocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "free_bed_allocations_tenantId_status_idx" ON "free_bed_allocations"("tenantId", "status");
CREATE INDEX "free_bed_allocations_tenantId_patientId_idx" ON "free_bed_allocations"("tenantId", "patientId");
ALTER TABLE "free_bed_allocations" ADD CONSTRAINT "free_bed_allocations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "free_bed_allocations" ADD CONSTRAINT "free_bed_allocations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "free_bed_allocations" ADD CONSTRAINT "free_bed_allocations_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- ssu_assessments
-- ============================================================
CREATE TABLE "ssu_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "invoiceId" TEXT,
    "economicTier" TEXT,
    "diseaseCategory" TEXT,
    "treatmentCategory" TEXT,
    "householdIncome" DECIMAL(12,2),
    "assessmentNotes" TEXT,
    "documents" JSONB,
    "status" "SsuAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "recommendedBy" TEXT,
    "recommendedAt" TIMESTAMP(3),
    "recommendedSubsidy" DECIMAL(12,2),
    "approvedSubsidy" DECIMAL(12,2),
    "governmentContribution" DECIMAL(12,2),
    "hospitalContribution" DECIMAL(12,2),
    "patientContribution" DECIMAL(12,2),
    "totalBillAmount" DECIMAL(12,2),
    "ruleId" TEXT,
    "ruleVersion" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ssu_assessments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ssu_assessments_tenantId_status_idx" ON "ssu_assessments"("tenantId", "status");
CREATE INDEX "ssu_assessments_tenantId_patientId_idx" ON "ssu_assessments"("tenantId", "patientId");
ALTER TABLE "ssu_assessments" ADD CONSTRAINT "ssu_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ssu_assessments" ADD CONSTRAINT "ssu_assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- ssu_committee_decisions
-- ============================================================
CREATE TABLE "ssu_committee_decisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "members" JSONB NOT NULL,
    "decision" TEXT NOT NULL,
    "approvedAmount" DECIMAL(12,2),
    "reason" TEXT,
    "documents" JSONB,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ssu_committee_decisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ssu_committee_decisions_tenantId_assessmentId_idx" ON "ssu_committee_decisions"("tenantId", "assessmentId");
ALTER TABLE "ssu_committee_decisions" ADD CONSTRAINT "ssu_committee_decisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ssu_committee_decisions" ADD CONSTRAINT "ssu_committee_decisions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ssu_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- bipanna_cases
-- ============================================================
CREATE TABLE "bipanna_cases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "diseaseCategory" TEXT NOT NULL,
    "diagnosis" TEXT,
    "eligibilityStatus" TEXT,
    "status" "BipannaCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "utilizedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejectedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "claimedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedClaimAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "documents" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bipanna_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bipanna_cases_caseNumber_key" ON "bipanna_cases"("caseNumber");
CREATE INDEX "bipanna_cases_tenantId_status_idx" ON "bipanna_cases"("tenantId", "status");
CREATE INDEX "bipanna_cases_tenantId_patientId_idx" ON "bipanna_cases"("tenantId", "patientId");
ALTER TABLE "bipanna_cases" ADD CONSTRAINT "bipanna_cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bipanna_cases" ADD CONSTRAINT "bipanna_cases_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- brain_death_cases
-- ============================================================
CREATE TABLE "brain_death_cases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT,
    "encounterId" TEXT,
    "caseNumber" TEXT NOT NULL,
    "status" "BrainDeathStatus" NOT NULL DEFAULT 'SUSPECTED',
    "checklist" JSONB,
    "certifiedBy" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "certificationRef" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_death_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brain_death_cases_caseNumber_key" ON "brain_death_cases"("caseNumber");
CREATE INDEX "brain_death_cases_tenantId_status_idx" ON "brain_death_cases"("tenantId", "status");
ALTER TABLE "brain_death_cases" ADD CONSTRAINT "brain_death_cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brain_death_cases" ADD CONSTRAINT "brain_death_cases_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- donor_alerts
-- ============================================================
CREATE TABLE "donor_alerts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brainDeathCaseId" TEXT NOT NULL,
    "trigger" TEXT,
    "recipientOrg" TEXT,
    "recipientUser" TEXT,
    "channel" TEXT,
    "status" "DonorAlertStatus" NOT NULL DEFAULT 'SENT',
    "sentBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "response" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "donor_alerts_tenantId_brainDeathCaseId_idx" ON "donor_alerts"("tenantId", "brainDeathCaseId");
ALTER TABLE "donor_alerts" ADD CONSTRAINT "donor_alerts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "donor_alerts" ADD CONSTRAINT "donor_alerts_brainDeathCaseId_fkey" FOREIGN KEY ("brainDeathCaseId") REFERENCES "brain_death_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- senior_queue_entries
-- ============================================================
CREATE TABLE "senior_queue_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "servicePoint" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "priority" "QueuePriority" NOT NULL DEFAULT 'SENIOR_PRIORITY',
    "ageAtEntry" INTEGER NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "servedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "waitingSeconds" INTEGER,
    "overrideReason" TEXT,
    "handledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "senior_queue_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "senior_queue_entries_tenantId_servicePoint_priority_idx" ON "senior_queue_entries"("tenantId", "servicePoint", "priority");
CREATE INDEX "senior_queue_entries_tenantId_patientId_idx" ON "senior_queue_entries"("tenantId", "patientId");
ALTER TABLE "senior_queue_entries" ADD CONSTRAINT "senior_queue_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "senior_queue_entries" ADD CONSTRAINT "senior_queue_entries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- vip_classifications
-- ============================================================
CREATE TABLE "vip_classifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "accessPolicy" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" "VipClassificationStatus" NOT NULL DEFAULT 'ACTIVE',
    "authorizedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_classifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vip_classifications_tenantId_patientId_status_idx" ON "vip_classifications"("tenantId", "patientId", "status");
ALTER TABLE "vip_classifications" ADD CONSTRAINT "vip_classifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vip_classifications" ADD CONSTRAINT "vip_classifications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- vip_access_logs
-- ============================================================
CREATE TABLE "vip_access_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "vipClassificationId" TEXT,
    "userId" TEXT,
    "userRole" TEXT,
    "action" "VipAccessAction" NOT NULL,
    "recordModule" TEXT,
    "ipAddress" TEXT,
    "sessionId" TEXT,
    "accessReason" TEXT,
    "dataExported" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_access_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vip_access_logs_tenantId_patientId_idx" ON "vip_access_logs"("tenantId", "patientId");
CREATE INDEX "vip_access_logs_tenantId_userId_idx" ON "vip_access_logs"("tenantId", "userId");
ALTER TABLE "vip_access_logs" ADD CONSTRAINT "vip_access_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vip_access_logs" ADD CONSTRAINT "vip_access_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- gov_sync_records
-- ============================================================
CREATE TABLE "gov_sync_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "externalTxnId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payloadVersion" TEXT,
    "payload" JSONB,
    "response" JSONB,
    "httpStatus" INTEGER,
    "status" "GovSyncStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "initiatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gov_sync_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gov_sync_records_requestId_key" ON "gov_sync_records"("requestId");
CREATE UNIQUE INDEX "gov_sync_records_tenantId_entityType_entityId_requestId_key" ON "gov_sync_records"("tenantId", "entityType", "entityId", "requestId");
CREATE INDEX "gov_sync_records_tenantId_status_idx" ON "gov_sync_records"("tenantId", "status");
ALTER TABLE "gov_sync_records" ADD CONSTRAINT "gov_sync_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- regulatory_events
-- ============================================================
CREATE TABLE "regulatory_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" TEXT,
    "payload" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "regulatory_events_tenantId_eventType_idx" ON "regulatory_events"("tenantId", "eventType");
CREATE INDEX "regulatory_events_tenantId_createdAt_idx" ON "regulatory_events"("tenantId", "createdAt");
ALTER TABLE "regulatory_events" ADD CONSTRAINT "regulatory_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- regulatory_exceptions
-- ============================================================
CREATE TABLE "regulatory_exceptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "entityType" TEXT,
    "entityId" TEXT,
    "patientId" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_exceptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "regulatory_exceptions_tenantId_kind_idx" ON "regulatory_exceptions"("tenantId", "kind");
ALTER TABLE "regulatory_exceptions" ADD CONSTRAINT "regulatory_exceptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- subsidy_ledger_entries
-- ============================================================
CREATE TABLE "subsidy_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "ssuAssessmentId" TEXT,
    "bipannaCaseId" TEXT,
    "patientId" TEXT,
    "invoiceId" TEXT,
    "entryType" "SubsidyLedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "funder" TEXT,
    "balanceAfter" DECIMAL(12,2),
    "reference" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subsidy_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subsidy_ledger_entries_tenantId_program_patientId_idx" ON "subsidy_ledger_entries"("tenantId", "program", "patientId");
CREATE INDEX "subsidy_ledger_entries_tenantId_invoiceId_idx" ON "subsidy_ledger_entries"("tenantId", "invoiceId");
ALTER TABLE "subsidy_ledger_entries" ADD CONSTRAINT "subsidy_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subsidy_ledger_entries" ADD CONSTRAINT "subsidy_ledger_entries_ssuAssessmentId_fkey" FOREIGN KEY ("ssuAssessmentId") REFERENCES "ssu_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subsidy_ledger_entries" ADD CONSTRAINT "subsidy_ledger_entries_bipannaCaseId_fkey" FOREIGN KEY ("bipannaCaseId") REFERENCES "bipanna_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
