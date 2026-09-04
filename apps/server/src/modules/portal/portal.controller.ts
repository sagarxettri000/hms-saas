import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PortalService } from "./portal.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { Roles, TenantScoped } from "../../common/decorators/permissions.decorator";
import { UserRole } from "@hms/shared";

// The portal exposes patient clinical/financial data keyed by patientId. There is
// currently no patient<->user-account link, so the patientId is caller-supplied.
// To prevent any authenticated staff role from reading arbitrary patients' PHI,
// access is restricted to the staff roles that legitimately manage patient care
// (plus PATIENT for future self-service once patient accounts are wired up).
// Tenant isolation is still enforced by TenantGuard + the { patientId, tenantId }
// filters in PortalService.
@ApiTags("Patient Portal")
@Controller("portal")
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantScoped()
@Roles(
  UserRole.PATIENT,
  UserRole.DOCTOR,
  UserRole.NURSE,
  UserRole.WARD_INCHARGE,
  UserRole.ICU_STAFF,
  UserRole.EMERGENCY_STAFF,
  UserRole.RECEPTIONIST,
  UserRole.RECEPTION_SUPERVISOR,
  UserRole.DEPARTMENT_HEAD,
  UserRole.FINANCE_MANAGER,
  UserRole.HOSPITAL_ADMIN,
  UserRole.HOSPITAL_OWNER,
  UserRole.IT_ADMIN,
  UserRole.PLATFORM_SUPER_ADMIN,
)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get("lookup")
  @ApiOperation({ summary: "Lookup patient by MRN" })
  async lookup(@Query("mrn") mrn: string, @Req() req: any) {
    return this.portalService.lookupByMrn(mrn, req.user.tenantId);
  }

  @Get("labs")
  @ApiOperation({ summary: "Get patient lab results" })
  async getLabs(@Query("patientId") patientId: string, @Req() req: any) {
    return this.portalService.getPatientLabs(patientId, req.user.tenantId);
  }

  @Get("invoices")
  @ApiOperation({ summary: "Get patient invoices" })
  async getInvoices(@Query("patientId") patientId: string, @Req() req: any) {
    return this.portalService.getPatientInvoices(patientId, req.user.tenantId);
  }

  @Get("appointments")
  @ApiOperation({ summary: "Get patient appointments" })
  async getAppointments(@Query("patientId") patientId: string, @Req() req: any) {
    return this.portalService.getPatientAppointments(patientId, req.user.tenantId);
  }

  @Post("appointments")
  @ApiOperation({ summary: "Book an appointment" })
  async bookAppointment(@Body() dto: any, @Req() req: any) {
    return this.portalService.bookAppointment(req.user.tenantId, dto);
  }
}
