import { Module } from "@nestjs/common";
import { BedManagementService } from "./bed-management.service";
import { BedManagementController } from "./bed-management.controller";

@Module({
  controllers: [BedManagementController],
  providers: [BedManagementService],
  exports: [BedManagementService],
})
export class BedManagementModule {}
