-- Revenue engine: payor linkage, versioned split rules, per-line allocations,
-- consultant history, claim items, invoice finalization + SSOT columns.

-- CreateEnum
CREATE TYPE "PayorPriority" AS ENUM ('PRIMARY', 'SECONDARY');
CREATE TYPE "PayorStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED');
CREATE TYPE "ClaimItemStatus" AS ENUM ('CLAIMED', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'SETTLED');

-- Extend invoice lifecycle with FINALIZED
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'FINALIZED';

-- RevenueSplitRule
CREATE TABLE "revenue_split_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schemeId" TEXT,
    "billingMode" TEXT,
    "encounterType" TEXT,
    "serviceId" TEXT,
    "serviceCategoryId" TEXT,
    "basis" TEXT NOT NULL DEFAULT 'NET_EXCL_TAX',
    "participants" JSONB NOT NULL,
    "allowUnallocated" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "changeReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_split_rules_pkey" PRIMARY KEY ("id")
);

-- RevenueAllocation
CREATE TABLE "revenue_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceItemId" TEXT NOT NULL,
    "participantType" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "shareType" TEXT NOT NULL,
    "shareValue" DECIMAL(10,2) NOT NULL,
    "basis" TEXT NOT NULL,
    "basisAmount" DECIMAL(14,2) NOT NULL,
    "calculatedAmount" DECIMAL(14,2) NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "ruleTier" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "reversed" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_allocations_pkey" PRIMARY KEY ("id")
);

-- PatientPayor
CREATE TABLE "patient_payors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "policyId" TEXT,
    "priority" "PayorPriority" NOT NULL DEFAULT 'PRIMARY',
    "status" "PayorStatus" NOT NULL DEFAULT 'ACTIVE',
    "memberNumber" TEXT,
    "coveragePercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "copayPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "deductible" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "coverageLimit" DECIMAL(14,2),
    "requiresAuth" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_payors_pkey" PRIMARY KEY ("id")
);

-- ConsultantAssignment
CREATE TABLE "consultant_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PRIMARY_CONSULTANT',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "departmentId" TEXT,
    "specialty" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "assignedBy" TEXT,
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_assignments_pkey" PRIMARY KEY ("id")
);

-- ClaimItem
CREATE TABLE "claim_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "invoiceItemId" TEXT NOT NULL,
    "providerId" TEXT,
    "policyId" TEXT,
    "claimedAmount" DECIMAL(14,2) NOT NULL,
    "approvedAmount" DECIMAL(14,2),
    "deductedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "ClaimItemStatus" NOT NULL DEFAULT 'CLAIMED',
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_items_pkey" PRIMARY KEY ("id")
);

-- Invoice finalization + idempotency + billing mode
ALTER TABLE "invoices" ADD COLUMN "finalizedAt" TIMESTAMP(3),
ADD COLUMN "finalizedBy" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "billingMode" TEXT;
CREATE UNIQUE INDEX "invoices_tenantId_idempotencyKey_key" ON "invoices"("tenantId", "idempotencyKey");
CREATE INDEX "invoices_tenantId_finalizedAt_idx" ON "invoices"("tenantId", "finalizedAt");

-- InvoiceItem SSOT columns
ALTER TABLE "invoice_items" ADD COLUMN "chargeTransactionId" TEXT,
ADD COLUMN "netAmount" DECIMAL(14,2),
ADD COLUMN "schemeId" TEXT,
ADD COLUMN "billingMode" TEXT,
ADD COLUMN "priceRuleId" TEXT,
ADD COLUMN "priceRuleVersion" INTEGER,
ADD COLUMN "revenueRuleId" TEXT,
ADD COLUMN "revenueRuleVersion" INTEGER,
ADD COLUMN "participants" JSONB;
CREATE INDEX "invoice_items_tenantId_chargeTransactionId_idx" ON "invoice_items"("tenantId", "chargeTransactionId");

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_chargeTransactionId_fkey" FOREIGN KEY ("chargeTransactionId") REFERENCES "charge_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- InsuranceClaim received amount
ALTER TABLE "insurance_claims" ADD COLUMN "receivedAmount" DECIMAL(14,2);

-- Foreign keys
ALTER TABLE "revenue_split_rules" ADD CONSTRAINT "revenue_split_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenue_split_rules" ADD CONSTRAINT "revenue_split_rules_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "billing_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "revenue_split_rules" ADD CONSTRAINT "revenue_split_rules_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "billing_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "revenue_split_rules" ADD CONSTRAINT "revenue_split_rules_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "revenue_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "patient_payors" ADD CONSTRAINT "patient_payors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_payors" ADD CONSTRAINT "patient_payors_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_payors" ADD CONSTRAINT "patient_payors_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "billing_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_payors" ADD CONSTRAINT "patient_payors_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consultant_assignments" ADD CONSTRAINT "consultant_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consultant_assignments" ADD CONSTRAINT "consultant_assignments_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consultant_assignments" ADD CONSTRAINT "consultant_assignments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "claim_items" ADD CONSTRAINT "claim_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_items" ADD CONSTRAINT "claim_items_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "insurance_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_items" ADD CONSTRAINT "claim_items_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_items" ADD CONSTRAINT "claim_items_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "insurance_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "claim_items" ADD CONSTRAINT "claim_items_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE UNIQUE INDEX "revenue_split_rules_tenantId_ruleCode_version_key" ON "revenue_split_rules"("tenantId", "ruleCode", "version");
CREATE INDEX "revenue_split_rules_tenantId_isActive_idx" ON "revenue_split_rules"("tenantId", "isActive");
CREATE INDEX "revenue_split_rules_tenantId_schemeId_idx" ON "revenue_split_rules"("tenantId", "schemeId");
CREATE INDEX "revenue_split_rules_serviceId_idx" ON "revenue_split_rules"("serviceId");

CREATE INDEX "revenue_allocations_tenantId_invoiceId_idx" ON "revenue_allocations"("tenantId", "invoiceId");
CREATE INDEX "revenue_allocations_tenantId_invoiceItemId_idx" ON "revenue_allocations"("tenantId", "invoiceItemId");
CREATE INDEX "revenue_allocations_tenantId_participantId_idx" ON "revenue_allocations"("tenantId", "participantId");
CREATE INDEX "revenue_allocations_reversalOfId_idx" ON "revenue_allocations"("reversalOfId");

CREATE INDEX "patient_payors_tenantId_patientId_idx" ON "patient_payors"("tenantId", "patientId");
CREATE INDEX "patient_payors_tenantId_schemeId_idx" ON "patient_payors"("tenantId", "schemeId");
CREATE INDEX "patient_payors_patientId_effectiveFrom_idx" ON "patient_payors"("patientId", "effectiveFrom");

CREATE INDEX "consultant_assignments_tenantId_admissionId_idx" ON "consultant_assignments"("tenantId", "admissionId");
CREATE INDEX "consultant_assignments_tenantId_doctorId_idx" ON "consultant_assignments"("tenantId", "doctorId");
CREATE INDEX "consultant_assignments_patientId_idx" ON "consultant_assignments"("patientId");

CREATE UNIQUE INDEX "claim_items_claimId_invoiceItemId_key" ON "claim_items"("claimId", "invoiceItemId");
CREATE INDEX "claim_items_tenantId_claimId_idx" ON "claim_items"("tenantId", "claimId");
CREATE INDEX "claim_items_tenantId_invoiceItemId_idx" ON "claim_items"("tenantId", "invoiceItemId");
