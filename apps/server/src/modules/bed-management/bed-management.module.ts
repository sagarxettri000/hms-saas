import { Module } from "@nestjs/common";
import { BedManagementService } from "./bed-management.service";
import { BedManagementController } from "./bed-management.controller";
import { RegulatoryModule } from "../regulatory/regulatory.module";

@Module({
  imports: [RegulatoryModule],
  controllers: [BedManagementController],
  providers: [BedManagementService],
  exports: [BedManagementService],
})
export class BedManagementModule {}
