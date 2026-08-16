import { Module } from "@nestjs/common";
import { RadiologyService } from "./radiology.service";
import { RadiologyController } from "./radiology.controller";

@Module({
  controllers: [RadiologyController],
  providers: [RadiologyService],
  exports: [RadiologyService],
})
export class RadiologyModule {}
