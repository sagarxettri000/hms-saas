-- CreateEnum
CREATE TYPE "RadiologyPeerReviewStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'OVERRIDE');

-- AlterTable
ALTER TABLE "dicom_nodes" ADD COLUMN     "tls" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "radiology_orders" ADD COLUMN     "assignedRadiologistId" TEXT,
ADD COLUMN     "criticalFlaggedAt" TIMESTAMP(3),
ADD COLUMN     "criticalFlaggedBy" TEXT,
ADD COLUMN     "criticalSuggested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isCritical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reportVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "radiology_report_revisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "radiologyOrderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "findings" TEXT,
    "impression" TEXT,
    "report" TEXT,
    "reason" TEXT,
    "authoredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radiology_report_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radiology_peer_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "radiologyOrderId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerId" TEXT,
    "status" "RadiologyPeerReviewStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radiology_peer_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radiology_report_revisions_tenantId_idx" ON "radiology_report_revisions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "radiology_report_revisions_radiologyOrderId_version_key" ON "radiology_report_revisions"("radiologyOrderId", "version");

-- CreateIndex
CREATE INDEX "radiology_peer_reviews_tenantId_idx" ON "radiology_peer_reviews"("tenantId");

-- CreateIndex
CREATE INDEX "radiology_peer_reviews_radiologyOrderId_idx" ON "radiology_peer_reviews"("radiologyOrderId");

-- CreateIndex
CREATE INDEX "radiology_peer_reviews_reviewerId_status_idx" ON "radiology_peer_reviews"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "radiology_peer_reviews_status_idx" ON "radiology_peer_reviews"("status");

-- CreateIndex
CREATE INDEX "radiology_orders_assignedRadiologistId_idx" ON "radiology_orders"("assignedRadiologistId");

-- CreateIndex
CREATE INDEX "radiology_orders_isCritical_idx" ON "radiology_orders"("isCritical");

-- AddForeignKey
ALTER TABLE "radiology_report_revisions" ADD CONSTRAINT "radiology_report_revisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiology_report_revisions" ADD CONSTRAINT "radiology_report_revisions_radiologyOrderId_fkey" FOREIGN KEY ("radiologyOrderId") REFERENCES "radiology_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiology_peer_reviews" ADD CONSTRAINT "radiology_peer_reviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiology_peer_reviews" ADD CONSTRAINT "radiology_peer_reviews_radiologyOrderId_fkey" FOREIGN KEY ("radiologyOrderId") REFERENCES "radiology_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


