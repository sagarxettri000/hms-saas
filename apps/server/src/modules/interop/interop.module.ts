import { Module } from "@nestjs/common";
import { InteropController } from "./interop.controller";
import { TerminologyService } from "./terminology.service";
import { InteropGatewayService } from "./interop-gateway.service";
import { PublicHealthService } from "./public-health.service";
import { BloodChainService } from "./blood-chain.service";
import { WasteService } from "./waste.service";
import { FhirMappingService } from "./fhir-mapping.service";
import { RegulatoryModule } from "../regulatory/regulatory.module";

@Module({
  imports: [RegulatoryModule],
  controllers: [InteropController],
  providers: [TerminologyService, InteropGatewayService, PublicHealthService, BloodChainService, WasteService, FhirMappingService],
  exports: [TerminologyService, InteropGatewayService, PublicHealthService, BloodChainService, WasteService, FhirMappingService],
})
export class InteropModule {}
