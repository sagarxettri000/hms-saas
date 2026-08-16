import { Module } from "@nestjs/common";
import { AdverseEventsService } from "./adverse-events.service";
import { AdverseEventsController } from "./adverse-events.controller";

@Module({
  controllers: [AdverseEventsController],
  providers: [AdverseEventsService],
  exports: [AdverseEventsService],
})
export class AdverseEventsModule {}
