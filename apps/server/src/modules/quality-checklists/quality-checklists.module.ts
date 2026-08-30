import { Module } from "@nestjs/common";
import { QualityChecklistsService } from "./quality-checklists.service";
import { QualityChecklistsController } from "./quality-checklists.controller";

@Module({
  controllers: [QualityChecklistsController],
  providers: [QualityChecklistsService],
  exports: [QualityChecklistsService],
})
export class QualityChecklistsModule {}
