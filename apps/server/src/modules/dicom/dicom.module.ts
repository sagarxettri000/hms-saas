import { Module } from "@nestjs/common";
import { DicomController } from "./dicom.controller";
import { DicomService } from "./dicom.service";
import { DicomWebService } from "./dicomweb.service";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [StorageModule],
  controllers: [DicomController],
  providers: [DicomService, DicomWebService],
  exports: [DicomService, DicomWebService],
})
export class DicomModule {}