import { Module } from "@nestjs/common";
import { BloodBankService } from "./blood-bank.service";
import { BloodBankController } from "./blood-bank.controller";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [BloodBankController],
  providers: [BloodBankService],
  exports: [BloodBankService],
})
export class BloodBankModule {}
