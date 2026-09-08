import { Module } from "@nestjs/common";
import { Hl7Controller } from "./hl7.controller";
import { Hl7Service } from "./hl7.service";

@Module({
  controllers: [Hl7Controller],
  providers: [Hl7Service],
  exports: [Hl7Service],
})
export class Hl7Module {}