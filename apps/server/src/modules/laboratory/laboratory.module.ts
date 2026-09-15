import { Module } from "@nestjs/common";
import { LaboratoryService } from "./laboratory.service";
import { LaboratoryController } from "./laboratory.controller";
import { HematologyService } from "./hematology.service";
import { HematologyController } from "./hematology.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [LaboratoryController, HematologyController],
  providers: [LaboratoryService, HematologyService],
  exports: [LaboratoryService, HematologyService],
})
export class LaboratoryModule {}
