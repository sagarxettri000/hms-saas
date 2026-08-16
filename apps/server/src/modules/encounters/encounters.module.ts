import { Module } from "@nestjs/common";
import { EncountersService } from "./encounters.service";
import { EncountersController } from "./encounters.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
