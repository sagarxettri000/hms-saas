import { Module } from "@nestjs/common";
import { LaboratoryService } from "./laboratory.service";
import { LaboratoryController } from "./laboratory.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
