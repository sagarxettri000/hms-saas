-- AlterTable
ALTER TABLE "beds" ADD COLUMN     "freeBedEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quotaCategory" TEXT;

-- AlterTable
ALTER TABLE "regulatory_rules" ADD COLUMN     "benefitExpression" TEXT,
ADD COLUMN     "eligibilityExpression" TEXT,
ADD COLUMN     "jurisdiction" TEXT,
ADD COLUMN     "ruleType" TEXT;

-- CreateTable
CREATE TABLE "bipanna_claims" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "BipannaClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "periodFrom" TIMESTAMP(3),
    "patientId" TEXT,
    "submittedBy" TEXT,
    "approvedAmount" DECIMAL(12,2),
    "rejectedAmount" DECIMAL(12,2),
    "settledAmount" DECIMAL(12,2),
    "settledAt" TIMESTAMP(3),
    "approvalRef" TEXT,
    "documents" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bipanna_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bipanna_claims_claimNumber_key" ON "bipanna_claims"("claimNumber");

-- CreateIndex
CREATE INDEX "bipanna_claims_tenantId_status_idx" ON "bipanna_claims"("tenantId", "status");

-- CreateIndex
CREATE INDEX "bipanna_claims_tenantId_caseId_idx" ON "bipanna_claims"("tenantId", "caseId");

-- AddForeignKey
ALTER TABLE "bipanna_claims" ADD CONSTRAINT "bipanna_claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bipanna_claims" ADD CONSTRAINT "bipanna_claims_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "bipanna_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;