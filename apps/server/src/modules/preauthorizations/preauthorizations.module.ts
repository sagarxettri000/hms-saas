import { Module } from "@nestjs/common";
import { PreauthorizationsService } from "./preauthorizations.service";
import { PreauthorizationsController } from "./preauthorizations.controller";

@Module({
  controllers: [PreauthorizationsController],
  providers: [PreauthorizationsService],
  exports: [PreauthorizationsService],
})
export class PreauthorizationsModule {}
