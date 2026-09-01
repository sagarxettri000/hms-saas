import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PortalService } from "./portal.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { TenantScoped } from "../../common/decorators/permissions.decorator";

// No @Permissions decorator here — the portal is patient self-service.
// Access is scoped to the authenticated patient via TenantGuard + JwtAuthGuard;
// MRN/ patientId params are resolved server-side against req.user.
@ApiTags("Patient Portal")
@Controller("portal")
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantScoped()
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
