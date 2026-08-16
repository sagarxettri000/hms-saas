import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsStreamController } from "./notifications-stream.controller";
import { NotificationsHub } from "./notifications.hub";
import { CommunicationsModule } from "../communications/communications.module";

@Module({
  imports: [CommunicationsModule],
  controllers: [NotificationsController, NotificationsStreamController],
  providers: [NotificationsService, NotificationsHub],
  exports: [NotificationsService, NotificationsHub],
})
export class NotificationsModule {}
