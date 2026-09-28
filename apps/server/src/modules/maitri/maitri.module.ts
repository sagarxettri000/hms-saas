import { Module } from "@nestjs/common";
import { MaitriController } from "./maitri.controller";
import { MaitriOrchestratorService } from "./maitri-orchestrator.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { PatientsModule } from "../patients/patients.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { BedManagementModule } from "../bed-management/bed-management.module";
import { PharmacyModule } from "../pharmacy/pharmacy.module";
import { BillingModule } from "../billing/billing.module";
import { LaboratoryModule } from "../laboratory/laboratory.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { UsersModule } from "../users/users.module";
import { EncountersModule } from "../encounters/encounters.module";
import { DepartmentsModule } from "../departments/departments.module";

/**
 * Maitri Assistant module. Imports the HMS feature modules whose services the
 * tool registry wraps — the assistant reuses the exact same business logic as
 * the HMS UI (spec: never duplicate business logic).
 */
@Module({
  imports: [
    PrismaModule,
    PatientsModule,
    AppointmentsModule,
    BedManagementModule,
    PharmacyModule,
    BillingModule,
    LaboratoryModule,
    DoctorsModule,
    UsersModule,
    EncountersModule,
    DepartmentsModule,
  ],
  controllers: [MaitriController],
  providers: [MaitriOrchestratorService],
  exports: [MaitriOrchestratorService],
})
export class MaitriModule {}
