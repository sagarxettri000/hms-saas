import { Module } from "@nestjs/common";
import { AmbulanceService } from "./ambulance.service";
import { AmbulanceController } from "./ambulance.controller";

@Module({
  controllers: [AmbulanceController],
  providers: [AmbulanceService],
  exports: [AmbulanceService],
})
export class AmbulanceModule {}
