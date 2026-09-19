import { Module } from "@nestjs/common";
import { RegulatoryController } from "./regulatory.controller";
import { RegulatoryService } from "./regulatory.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

@Module({
  controllers: [RegulatoryController],
  providers: [RegulatoryService, RegulatoryRuleService],
  exports: [RegulatoryService, RegulatoryRuleService],
})
export class RegulatoryModule {}
