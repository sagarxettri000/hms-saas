import { Module } from "@nestjs/common";
import { BloodBankService } from "./blood-bank.service";
import { BloodBankController } from "./blood-bank.controller";

@Module({
  controllers: [BloodBankController],
  providers: [BloodBankService],
  exports: [BloodBankService],
})
export class BloodBankModule {}
