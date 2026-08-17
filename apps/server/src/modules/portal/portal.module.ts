import { Module } from "@nestjs/common";
import { PortalService } from "./portal.service";
import { PortalController } from "./portal.controller";

@Module({
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
