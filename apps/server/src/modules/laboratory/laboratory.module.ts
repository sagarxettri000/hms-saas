import { Module } from "@nestjs/common";
import { LaboratoryService } from "./laboratory.service";
import { LaboratoryController } from "./laboratory.controller";
import { HematologyService } from "./hematology.service";
import { HematologyController } from "./hematology.controller";
import { FlowCytometryService } from "./flow-cytometry.service";
import { FlowCytometryController } from "./flow-cytometry.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [LaboratoryController, HematologyController, FlowCytometryController],
  providers: [LaboratoryService, HematologyService, FlowCytometryService],
  exports: [LaboratoryService, HematologyService, FlowCytometryService],
})
export class LaboratoryModule {}