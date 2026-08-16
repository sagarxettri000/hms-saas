import { Module } from "@nestjs/common";
import { OtService } from "./ot.service";
import { OtController } from "./ot.controller";

@Module({
  controllers: [OtController],
  providers: [OtService],
  exports: [OtService],
})
export class OtModule {}
