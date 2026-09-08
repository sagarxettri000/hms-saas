-- CreateTable
CREATE TABLE "dicom_studies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT,
    "radiologyOrderId" TEXT,
    "studyInstanceUid" TEXT NOT NULL,
    "studyDate" TIMESTAMP(3),
    "studyDescription" TEXT,
    "accessionNumber" TEXT,
    "modality" TEXT,
    "bodyPart" TEXT,
    "referringPhysician" TEXT,
    "institutionName" TEXT,
    "numberOfSeries" INTEGER NOT NULL DEFAULT 0,
    "numberOfInstances" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dicom_studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dicom_series" (
    "id" TEXT NOT NULL,
    "dicomStudyId" TEXT NOT NULL,
    "seriesInstanceUid" TEXT NOT NULL,
    "seriesNumber" TEXT,
    "modality" TEXT,
    "seriesDescription" TEXT,
    "bodyPart" TEXT,
    "numberOfInstances" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dicom_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dicom_instances" (
    "id" TEXT NOT NULL,
    "dicomSeriesId" TEXT NOT NULL,
    "sopInstanceUid" TEXT NOT NULL,
    "instanceNumber" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "colorSpace" TEXT,
    "rows" INTEGER,
    "columns" INTEGER,
    "numberOfFrames" INTEGER,
    "bitsAllocated" INTEGER,
    "transferSyntax" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'application/dicom',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dicom_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dicom_nodes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aeTitle" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 104,
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dicom_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dicom_studies_patientId_idx" ON "dicom_studies"("patientId");

-- CreateIndex
CREATE INDEX "dicom_studies_radiologyOrderId_idx" ON "dicom_studies"("radiologyOrderId");

-- CreateIndex
CREATE INDEX "dicom_studies_accessionNumber_idx" ON "dicom_studies"("accessionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "dicom_studies_tenantId_studyInstanceUid_key" ON "dicom_studies"("tenantId", "studyInstanceUid");

-- CreateIndex
CREATE UNIQUE INDEX "dicom_series_dicomStudyId_seriesInstanceUid_key" ON "dicom_series"("dicomStudyId", "seriesInstanceUid");

-- CreateIndex
CREATE INDEX "dicom_instances_sopInstanceUid_idx" ON "dicom_instances"("sopInstanceUid");

-- CreateIndex
CREATE UNIQUE INDEX "dicom_instances_dicomSeriesId_sopInstanceUid_key" ON "dicom_instances"("dicomSeriesId", "sopInstanceUid");

-- CreateIndex
CREATE INDEX "dicom_nodes_tenantId_idx" ON "dicom_nodes"("tenantId");

-- AddForeignKey
ALTER TABLE "dicom_studies" ADD CONSTRAINT "dicom_studies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dicom_studies" ADD CONSTRAINT "dicom_studies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dicom_studies" ADD CONSTRAINT "dicom_studies_radiologyOrderId_fkey" FOREIGN KEY ("radiologyOrderId") REFERENCES "radiology_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dicom_series" ADD CONSTRAINT "dicom_series_dicomStudyId_fkey" FOREIGN KEY ("dicomStudyId") REFERENCES "dicom_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dicom_instances" ADD CONSTRAINT "dicom_instances_dicomSeriesId_fkey" FOREIGN KEY ("dicomSeriesId") REFERENCES "dicom_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dicom_nodes" ADD CONSTRAINT "dicom_nodes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;