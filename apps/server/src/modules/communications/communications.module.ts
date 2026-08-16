import { Module } from "@nestjs/common";
import { CommunicationsService } from "./communications.service";

@Module({
  providers: [CommunicationsService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
