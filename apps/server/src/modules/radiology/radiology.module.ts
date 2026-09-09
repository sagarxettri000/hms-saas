import { Module } from "@nestjs/common";
import { RadiologyService } from "./radiology.service";
import { RadiologyController } from "./radiology.controller";
import { Hl7Module } from "../hl7/hl7.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [Hl7Module, NotificationsModule],
  controllers: [RadiologyController],
  providers: [RadiologyService],
  exports: [RadiologyService],
})
export class RadiologyModule {}
