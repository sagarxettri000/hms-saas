import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  EmergencyService,
  CreateEmergencyCaseDto,
  CreateEmergencyInvoiceDto,
} from "./emergency.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  Roles,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction, UserRole } from "@hms/shared";

// ER finance surfaces (billing list/create + revenue summary) are restricted to
// the ER role and platform/hospital administrators. ER revenue never appears on
// the shared billing surfaces, so these endpoints are its only window besides
// the ER reports.
const ER_BILLING_ROLES = [
  UserRole.EMERGENCY_STAFF,
  UserRole.HOSPITAL_ADMIN,
  UserRole.HOSPITAL_OWNER,
  UserRole.PLATFORM_SUPER_ADMIN,
];

@ApiTags("Emergency")
@Controller("emergency")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Get("dashboard")
  @Permissions(PermissionAction.VIEW)
  getDashboard(@Req() req: any) {
    return this.emergencyService.getDashboard(req.user.tenantId);
  }

  // ---------- ER billing (static routes BEFORE :id) ----------

  @Get("billing/summary")
  @Roles(...ER_BILLING_ROLES)
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Emergency revenue summary (ER-only surface)" })
  billingSummary(@Req() req: any) {
    return this.emergencyService.billingSummary(req.user.tenantId);
  }

  @Get("billing/services")
  @Roles(...ER_BILLING_ROLES)
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Emergency charge presets for the billing form" })
  servicePresets() {
    return this.emergencyService.servicePresets();
  }

  @Get("billing/invoices")
  @Roles(...ER_BILLING_ROLES)
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List EMERGENCY invoices only" })
  listInvoices(@Query() query: any, @Req() req: any) {
    return this.emergencyService.listInvoices(req.user.tenantId, query);
  }

  @Post("billing/invoices")
  @Roles(...ER_BILLING_ROLES)
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create an EMERGENCY invoice (shared billing engine)" })
  createInvoice(@Body() dto: CreateEmergencyInvoiceDto, @Req() req: any) {
    return this.emergencyService.createInvoice(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  // ---------- Cases ----------

  @Get()
  @Permissions(PermissionAction.VIEW)
  findAll(@Query() query: any, @Req() req: any) {
    return this.emergencyService.findAll(req.user.tenantId, query);
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  create(@Body() dto: CreateEmergencyCaseDto, @Req() req: any) {
    return this.emergencyService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  findById(@Param("id") id: string, @Req() req: any) {
    return this.emergencyService.findById(req.user.tenantId, id);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateEmergencyCaseDto>,
    @Req() req: any,
  ) {
    return this.emergencyService.update(req.user.tenantId, id, dto);
  }

  @Patch(":id/admit")
  @Permissions(PermissionAction.EDIT)
  admit(
    @Param("id") id: string,
    @Body() body: { admittedTo?: string; bedId?: string; notes?: string },
    @Req() req: any,
  ) {
    return this.emergencyService.admit(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Patch(":id/discharge")
  @Permissions(PermissionAction.EDIT)
  discharge(
    @Param("id") id: string,
    @Body() body: { dischargeSummary?: string },
    @Req() req: any,
  ) {
    return this.emergencyService.discharge(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }
}
