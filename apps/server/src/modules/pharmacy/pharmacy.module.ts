import { Module } from "@nestjs/common";
import { PharmacyService } from "./pharmacy.service";
import { PharmacyController } from "./pharmacy.controller";
import { SettingsModule } from "../settings/settings.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [SettingsModule, AuditModule],
  controllers: [PharmacyController],
  providers: [PharmacyService],
  exports: [PharmacyService],
})
export class PharmacyModule {}
