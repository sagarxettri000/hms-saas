-- Clinical-context isolation (spec §64): patient location history + transfer
-- state machine. Visibility is derived from PatientLocation, never from
-- "patient exists".

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ER', 'OPD', 'IPD_WARD', 'ICU', 'OT', 'RADIOLOGY', 'LABORATORY', 'DIALYSIS', 'ONCOLOGY', 'PHARMACY', 'OTHER');
CREATE TYPE "LocationStatus" AS ENUM ('ACTIVE', 'TEMPORARY', 'ENDED');
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- PatientLocation
CREATE TABLE "patient_locations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "admissionId" TEXT,
    "locationType" "LocationType" NOT NULL,
    "departmentId" TEXT,
    "wardId" TEXT,
    "bedId" TEXT,
    "status" "LocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_locations_pkey" PRIMARY KEY ("id")
);

-- PatientTransfer
CREATE TABLE "patient_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "fromLocationId" TEXT,
    "toLocationType" "LocationType" NOT NULL,
    "toDepartmentId" TEXT,
    "toWardId" TEXT,
    "toBedId" TEXT,
    "reason" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "cancelledBy" TEXT,
    "rejectionReason" TEXT,
    "resultingLocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_transfers_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "patient_transfers" ADD CONSTRAINT "patient_transfers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_transfers" ADD CONSTRAINT "patient_transfers_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_transfers" ADD CONSTRAINT "patient_transfers_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "patient_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_transfers" ADD CONSTRAINT "patient_transfers_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_transfers" ADD CONSTRAINT "patient_transfers_toWardId_fkey" FOREIGN KEY ("toWardId") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_transfers" ADD CONSTRAINT "patient_transfers_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes (visibility queries filter by tenant + type/status + dept/ward)
CREATE INDEX "patient_locations_tenantId_patientId_status_idx" ON "patient_locations"("tenantId", "patientId", "status");
CREATE INDEX "patient_locations_tenantId_locationType_status_idx" ON "patient_locations"("tenantId", "locationType", "status");
CREATE INDEX "patient_locations_tenantId_departmentId_status_idx" ON "patient_locations"("tenantId", "departmentId", "status");
CREATE INDEX "patient_locations_tenantId_wardId_status_idx" ON "patient_locations"("tenantId", "wardId", "status");
CREATE INDEX "patient_locations_encounterId_idx" ON "patient_locations"("encounterId");
CREATE INDEX "patient_locations_admissionId_idx" ON "patient_locations"("admissionId");

CREATE INDEX "patient_transfers_tenantId_patientId_status_idx" ON "patient_transfers"("tenantId", "patientId", "status");
CREATE INDEX "patient_transfers_tenantId_status_idx" ON "patient_transfers"("tenantId", "status");
CREATE INDEX "patient_transfers_fromLocationId_idx" ON "patient_transfers"("fromLocationId");
