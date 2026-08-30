import { Module } from "@nestjs/common";
import { ControlledSubstancesService } from "./controlled-substances.service";
import { ControlledSubstancesController } from "./controlled-substances.controller";

@Module({
  controllers: [ControlledSubstancesController],
  providers: [ControlledSubstancesService],
  exports: [ControlledSubstancesService],
})
export class ControlledSubstancesModule {}
