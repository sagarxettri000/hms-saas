import { Module, MiddlewareConsumer, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { CorrelationIdMiddleware } from "./common/middleware/correlation-id.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { UsersModule } from "./modules/users/users.module";
import { RolesModule } from "./modules/roles/roles.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { PatientsModule } from "./modules/patients/patients.module";
import { AppointmentsModule } from "./modules/appointments/appointments.module";
import { DoctorsModule } from "./modules/doctors/doctors.module";
import { EncountersModule } from "./modules/encounters/encounters.module";
import { DepartmentsModule } from "./modules/departments/departments.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { HealthModule } from "./modules/health/health.module";
import { LaboratoryModule } from "./modules/laboratory/laboratory.module";
import { RadiologyModule } from "./modules/radiology/radiology.module";
import { PharmacyModule } from "./modules/pharmacy/pharmacy.module";
import { AdmissionsModule } from "./modules/admissions/admissions.module";
import { ProcurementModule } from "./modules/procurement/procurement.module";
import { BillingModule } from "./modules/billing/billing.module";
import { InsuranceModule } from "./modules/insurance/insurance.module";
import { MembershipModule } from "./modules/membership/membership.module";
import { HrModule } from "./modules/hr/hr.module";
import { EmergencyModule } from "./modules/emergency/emergency.module";
import { OtModule } from "./modules/ot/ot.module";
import { BloodBankModule } from "./modules/blood-bank/blood-bank.module";
import { AccountingModule } from "./modules/accounting/accounting.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { CrmModule } from "./modules/crm/crm.module";
import { DoctorShareModule } from "./modules/doctor-share/doctor-share.module";
import { AuditModule } from "./modules/audit/audit.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { AdverseEventsModule } from "./modules/adverse-events/adverse-events.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { CommunicationsModule } from "./modules/communications/communications.module";
import { FhirModule } from "./modules/fhir/fhir.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { StorageModule } from "./modules/storage/storage.module";
import { PortalModule } from "./modules/portal/portal.module";
import { BedManagementModule } from "./modules/bed-management/bed-management.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { TenantGuard } from "./common/guards/tenant.guard";
import { MustChangePasswordGuard } from "./common/guards/must-change-password.guard";
import { AppController } from "./app.controller";

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
      cache: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>("THROTTLE_TTL") || 60000,
          limit: config.get<number>("THROTTLE_LIMIT") || 100,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    PatientsModule,
    AppointmentsModule,
    DoctorsModule,
    EncountersModule,
    DepartmentsModule,
    SettingsModule,
    HealthModule,
    LaboratoryModule,
    RadiologyModule,
    PharmacyModule,
    AdmissionsModule,
    ProcurementModule,
    BillingModule,
    InsuranceModule,
    MembershipModule,
    HrModule,
    EmergencyModule,
    OtModule,
    BloodBankModule,
    AccountingModule,
    NotificationsModule,
    CrmModule,
    DoctorShareModule,
    AuditModule,
    WebhooksModule,
    AdverseEventsModule,
    ReportsModule,
    CommunicationsModule,
    FhirModule,
    ExportsModule,
    CatalogModule,
    StorageModule,
    PortalModule,
    BedManagementModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MustChangePasswordGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
