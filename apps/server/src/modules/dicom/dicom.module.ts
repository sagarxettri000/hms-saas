import { Module } from "@nestjs/common";
import { DicomController } from "./dicom.controller";
import { DicomService } from "./dicom.service";
import { DicomWebService } from "./dicomweb.service";
import { DicomMwlService } from "./net/dicom-mwl.service";
import { DicomScpService } from "./net/dicom-scp.service";
import { DicomScuService } from "./net/dicom-scu.service";
import { AtnaAuditService } from "./net/atna-audit.service";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [StorageModule, AuditModule],
  controllers: [DicomController],
  providers: [
    DicomService,
    DicomWebService,
    DicomScpService,
    DicomScuService,
    DicomMwlService,
    AtnaAuditService,
  ],
  exports: [
    DicomService,
    DicomWebService,
    DicomScpService,
    DicomScuService,
    DicomMwlService,
    AtnaAuditService,
  ],
})
export class DicomModule {}
