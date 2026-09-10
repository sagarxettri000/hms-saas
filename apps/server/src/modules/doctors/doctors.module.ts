import { Module } from "@nestjs/common";
import { DoctorsService } from "./doctors.service";
import { DoctorsController } from "./doctors.controller";
import { MailService } from "../auth/mail.service";

@Module({
  controllers: [DoctorsController],
  providers: [DoctorsService, MailService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
