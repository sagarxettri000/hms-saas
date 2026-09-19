import { Module } from "@nestjs/common";
import { RegulatoryController } from "./regulatory.controller";
import { RegulatoryService } from "./regulatory.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";
import { MssService } from "./mss.service";
import { ProgramsService } from "./programs.service";
import { DisasterOfflineService } from "./disaster-offline.service";
import { BilingualService } from "./bilingual.service";

@Module({
  controllers: [RegulatoryController],
  providers: [RegulatoryService, RegulatoryRuleService, MssService, ProgramsService, DisasterOfflineService, BilingualService],
  exports: [RegulatoryService, RegulatoryRuleService, MssService, ProgramsService, DisasterOfflineService, BilingualService],
})
export class RegulatoryModule {}
