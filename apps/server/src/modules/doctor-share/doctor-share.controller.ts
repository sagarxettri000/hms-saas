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
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Doctor Share")
@Controller("doctor-share")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
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
}
