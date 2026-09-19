import { Module } from "@nestjs/common";
import { EncountersService } from "./encounters.service";
import { EncountersController } from "./encounters.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { InteropModule } from "../interop/interop.module";

@Module({
  imports: [NotificationsModule, InteropModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
