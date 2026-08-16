import { Module } from "@nestjs/common";
import { DoctorShareService } from "./doctor-share.service";
import { DoctorShareController } from "./doctor-share.controller";

@Module({
  controllers: [DoctorShareController],
  providers: [DoctorShareService],
  exports: [DoctorShareService],
})
export class DoctorShareModule {}
