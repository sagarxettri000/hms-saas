import { Module } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { DischargeBillingService } from "./discharge-billing.service";
import { BillingController } from "./billing.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService, DischargeBillingService],
  exports: [BillingService, DischargeBillingService],
})
export class BillingModule {}
