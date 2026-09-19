import { Module } from "@nestjs/common";
import { FhirController } from "./fhir.controller";
import { FhirService } from "./fhir.service";
import { RegulatoryModule } from "../regulatory/regulatory.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  controllers: [FhirController],
  imports: [RegulatoryModule, AuditModule],
  providers: [FhirService],
})
export class FhirModule {}
