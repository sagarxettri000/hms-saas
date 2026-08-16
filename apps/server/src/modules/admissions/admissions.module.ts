import { Module } from "@nestjs/common";
import { AdmissionsService } from "./admissions.service";
import { AdmissionsController } from "./admissions.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
