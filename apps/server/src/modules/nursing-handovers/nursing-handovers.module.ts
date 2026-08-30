import { Module } from "@nestjs/common";
import { NursingHandoversService } from "./nursing-handovers.service";
import { NursingHandoversController } from "./nursing-handovers.controller";

@Module({
  controllers: [NursingHandoversController],
  providers: [NursingHandoversService],
  exports: [NursingHandoversService],
})
export class NursingHandoversModule {}
