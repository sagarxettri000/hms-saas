import { Module } from '@nestjs/common';
import { Hl7Controller } from './hl7.controller';
import { Hl7Service } from './hl7.service';
import { Hl7QueueService } from './hl7-queue.service';
import { Hl7QueueModule } from './hl7-queue.module';

@Module({
  imports: [Hl7QueueModule],
  controllers: [Hl7Controller],
  providers: [Hl7Service, Hl7QueueService],
  exports: [Hl7Service, Hl7QueueService],
})
export class Hl7Module {}