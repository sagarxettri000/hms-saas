import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PermissionAction, UserRole } from "@hms/shared";
import {
  HematologyService,
  CreateHematologyOrderDto,
  EnterHematologyResultDto,
  HematologyListParams,
} from "./hematology.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ForbidRolesGuard } from "../../common/guards/forbid-roles.guard";
import {
  Permissions,
  Roles,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";

const PERFORMERS: UserRole[] = [
  UserRole.LAB_TECHNICIAN,
  UserRole.PATHOLOGIST,
  UserRole.RADIOLOGIST,
  UserRole.HOSPITAL_ADMIN,
  UserRole.HOSPITAL_OWNER,
  UserRole.PLATFORM_SUPER_ADMIN,
];

const ORDERERS: UserRole[] = [
  ...PERFORMERS,
  UserRole.RADIOLOGY_TECHNICIAN,
  UserRole.DOCTOR,
  UserRole.NURSE,
  UserRole.WARD_INCHARGE,
  UserRole.ICU_STAFF,
  UserRole.EMERGENCY_STAFF,
  UserRole.RECEPTIONIST,
  UserRole.RECEPTION_SUPERVISOR,
  UserRole.ANESTHETIST,
  UserRole.DEPARTMENT_HEAD,
];

const APPROVERS: UserRole[] = [
  UserRole.PATHOLOGIST,
  UserRole.RADIOLOGIST,
  UserRole.HOSPITAL_ADMIN,
  UserRole.HOSPITAL_OWNER,
  UserRole.PLATFORM_SUPER_ADMIN,
];

@ApiTags("Hematology")
@Controller("hematology")
@UseGuards(
  JwtAuthGuard,
  PermissionsGuard,
  TenantGuard,
  RolesGuard,
  ForbidRolesGuard,
)
@TenantScoped()
@ApiBearerAuth()
export class HematologyController {
  constructor(private readonly hematologyService: HematologyService) {}

  @Get("catalog")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({
    summary: "Hematology catalogue (CBC components with reference data)",
  })
  findCatalog(@Req() req: any) {
    return this.hematologyService.findCatalog(req.user.tenantId);
  }

  @Post("ensure-catalog")
  @Permissions(PermissionAction.EDIT)
  @Roles(...PERFORMERS)
  @ApiOperation({
    summary: "Idempotently (re)create the hematology catalogue for this tenant",
  })
  ensureCatalog(@Req() req: any) {
    return this.hematologyService.ensureCatalog(req.user.tenantId);
  }

  @Post("orders")
  @Permissions(PermissionAction.CREATE)
  @Roles(...ORDERERS)
  @ApiOperation({
    summary: "Create a CBC hematology order (expands panel to components)",
  })
  createOrder(@Body() dto: CreateHematologyOrderDto, @Req() req: any) {
    return this.hematologyService.createOrder(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("orders")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List hematology orders" })
  findOrders(@Query() query: HematologyListParams, @Req() req: any) {
    return this.hematologyService.findOrders(req.user.tenantId, query);
  }

  @Get("orders/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Hematology order with items, patient and samples" })
  findOrderById(@Param("id") id: string, @Req() req: any) {
    return this.hematologyService.findOrderById(req.user.tenantId, id);
  }

  @Get("orders/:id/report")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Report payload (whitelisted fields only)" })
  getReport(@Param("id") id: string, @Req() req: any) {
    return this.hematologyService.getReport(req.user.tenantId, id);
  }

  @Patch("orders/:id/items/:itemId/result")
  @Permissions(PermissionAction.EDIT)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Enter a CBC component result (perform step)" })
  enterResult(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: EnterHematologyResultDto,
    @Req() req: any,
  ) {
    return this.hematologyService.enterResult(
      req.user.tenantId,
      id,
      itemId,
      dto,
      req.user.id,
    );
  }

  @Post("orders/:id/verify")
  @Permissions(PermissionAction.VERIFY)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Verify finalized results" })
  verify(@Param("id") id: string, @Req() req: any) {
    return this.hematologyService.verify(req.user.tenantId, id, req.user.id);
  }

  @Post("orders/:id/approve")
  @Permissions(PermissionAction.APPROVE)
  @Roles(...APPROVERS)
  @ApiOperation({ summary: "Approve results" })
  approve(@Param("id") id: string, @Req() req: any) {
    return this.hematologyService.approve(req.user.tenantId, id, req.user.id);
  }

  @Post("orders/:id/report")
  @Permissions(PermissionAction.SIGN)
  @Roles(...APPROVERS)
  @ApiOperation({ summary: "Release (sign) the final report" })
  report(@Param("id") id: string, @Req() req: any) {
    return this.hematologyService.report(req.user.tenantId, id, req.user.id);
  }

  @Get("orders/:id/pdf")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Hematology report PDF" })
  async downloadReportPdf(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const buffer = await this.hematologyService.generateReportPdf(
      req.user.tenantId,
      id,
      req.user.id,
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="hematology-report-${id.slice(0, 8)}.pdf"`,
    });
    res.send(buffer);
  }
}
