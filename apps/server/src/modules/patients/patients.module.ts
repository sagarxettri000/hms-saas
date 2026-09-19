import { Module } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { PatientsController } from "./patients.controller";
import { PatientVisibilityService } from "./patient-visibility.service";
import { PatientLocationsController } from "./patient-locations.controller";

@Module({
  controllers: [PatientsController, PatientLocationsController],
  providers: [PatientsService, PatientVisibilityService],
  exports: [PatientsService, PatientVisibilityService],
})
export class PatientsModule {}
