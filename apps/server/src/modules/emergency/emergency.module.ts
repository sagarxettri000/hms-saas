import { Module } from "@nestjs/common";
import { EmergencyService } from "./emergency.service";
import { EmergencyController } from "./emergency.controller";
import { BillingModule } from "../billing/billing.module";

@Module({
  imports: [BillingModule],
  controllers: [EmergencyController],
  providers: [EmergencyService],
  exports: [EmergencyService],
})
export class EmergencyModule {}
