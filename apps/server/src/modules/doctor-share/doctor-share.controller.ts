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
import { DoctorShareService, CreateShareRuleDto } from "./doctor-share.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  Permissions,
  Roles,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction, UserRole } from "@hms/shared";

@ApiTags("Doctor Share")
@Controller("doctor-share")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard, RolesGuard)
@Roles(
  UserRole.HOSPITAL_ADMIN,
  UserRole.HOSPITAL_OWNER,
  UserRole.PLATFORM_SUPER_ADMIN,
  UserRole.IT_ADMIN,
)
@TenantScoped()
@ApiBearerAuth()
export class DoctorShareController {
  constructor(private readonly doctorShareService: DoctorShareService) {}

  @Get("rules")
  @Permissions(PermissionAction.VIEW)
  findRules(@Query("doctorId") doctorId: string, @Req() req: any) {
    return this.doctorShareService.findRules(req.user.tenantId, doctorId);
  }

  @Post("rules")
  @Permissions(PermissionAction.CREATE)
  createRule(@Body() dto: CreateShareRuleDto, @Req() req: any) {
    return this.doctorShareService.createRule(req.user.tenantId, dto);
  }

  @Patch("rules/:id")
  @Permissions(PermissionAction.EDIT)
  updateRule(
    @Param("id") id: string,
    @Body() dto: Partial<CreateShareRuleDto>,
    @Req() req: any,
  ) {
    return this.doctorShareService.updateRule(req.user.tenantId, id, dto);
  }

  @Get("transactions")
  @Permissions(PermissionAction.VIEW)
  findTransactions(
    @Query("doctorId") doctorId: string,
    @Query("status") status: string,
    @Req() req: any,
  ) {
    return this.doctorShareService.findTransactions(
      req.user.tenantId,
      doctorId,
      status,
    );
  }

  @Post("calculate")
  @Permissions(PermissionAction.CREATE)
  calculateForInvoice(@Body() body: { invoiceId: string }, @Req() req: any) {
    return this.doctorShareService.calculateForInvoice(
      req.user.tenantId,
      body.invoiceId,
    );
  }

  @Patch("transactions/:id/status")
  @Permissions(PermissionAction.EDIT)
  updateTransactionStatus(
    @Param("id") id: string,
    @Body()
    body: {
      status: string;
      paymentMethod?: string;
      paymentReference?: string;
      notes?: string;
    },
    @Req() req: any,
  ) {
    return this.doctorShareService.updateTransactionStatus(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Get("summary/:doctorId")
  @Permissions(PermissionAction.VIEW)
  getDoctorSummary(@Param("doctorId") doctorId: string, @Req() req: any) {
    return this.doctorShareService.getDoctorSummary(
      req.user.tenantId,
      doctorId,
    );
  }

  // ------- Versioned multi-participant revenue rules (spec §14/§17/§46) -------

  @Get("revenue-rules")
  @Permissions(PermissionAction.VIEW)
  findRevenueRules(@Query("schemeId") schemeId: string, @Req() req: any) {
    return this.doctorShareService.findRevenueRules(req.user.tenantId, schemeId);
  }

  /** Configuration (CONFIGURE) ≠ audit — RBAC separation of duties (spec §41). */
  @Post("revenue-rules")
  @Permissions(PermissionAction.CONFIGURE)
  createRevenueRule(@Body() dto: any, @Req() req: any) {
    return this.doctorShareService.createRevenueRule(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Patch("revenue-rules/:id/deactivate")
  @Permissions(PermissionAction.CONFIGURE)
  deactivateRevenueRule(
    @Param("id") id: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    return this.doctorShareService.deactivateRevenueRule(
      req.user.tenantId,
      id,
      body.reason,
      req.user.id,
    );
  }

  /** Exception dashboard counts (spec §53); read-only for finance roles. */
  @Get("reconciliation/exceptions")
  @Permissions(PermissionAction.VIEW)
  getReconciliationExceptions(@Req() req: any) {
    return this.doctorShareService.getReconciliationExceptions(
      req.user.tenantId,
    );
  }
}
