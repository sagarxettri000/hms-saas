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
import {
  RadiologyService,
  CreateRadiologyOrderDto,
  RadiologyOrderSearchParams,
} from "./radiology.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  Roles,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction, UserRole } from "@hms/shared";

@ApiTags("Radiology")
@Controller("radiology")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard, RolesGuard)
@TenantScoped()
@ApiBearerAuth()
export class RadiologyController {
  constructor(private readonly radiologyService: RadiologyService) {}

  @Post("orders")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a radiology order" })
  create(@Body() dto: CreateRadiologyOrderDto, @Req() req: any) {
    return this.radiologyService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get("orders")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List radiology orders" })
  findAll(@Query() query: RadiologyOrderSearchParams, @Req() req: any) {
    return this.radiologyService.findAll(req.user.tenantId, query);
  }

  @Get("orders/worklist")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Radiology worklist" })
  getWorklist(@Req() req: any) {
    return this.radiologyService.getWorklist(req.user.tenantId);
  }

  @Get("orders/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get radiology order" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.radiologyService.findById(req.user.tenantId, id);
  }

  @Patch("orders/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Transition order status" })
  transitionStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.radiologyService.transitionStatus(
      req.user.tenantId,
      id,
      body.status,
      req.user.id,
      req.user.role,
    );
  }

  @Post("orders/:id/images")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Register an uploaded image" })
  addImage(
    @Param("id") id: string,
    @Body()
    dto: {
      fileName: string;
      filePath: string;
      mimeType: string;
      fileSize: number;
      description?: string;
    },
    @Req() req: any,
  ) {
    return this.radiologyService.addImage(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Patch("orders/:id/report")
  @Permissions(PermissionAction.EDIT)
  @Roles(
    UserRole.RADIOLOGIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.IT_ADMIN,
  )
  @ApiOperation({ summary: "Write radiology report" })
  writeReport(
    @Param("id") id: string,
    @Body() dto: { findings?: string; impression?: string; report?: string },
    @Req() req: any,
  ) {
    return this.radiologyService.writeReport(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
      req.user.role,
    );
  }

  @Post("orders/:id/revisions")
  @Permissions(PermissionAction.EDIT)
  @Roles(
    UserRole.RADIOLOGIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.IT_ADMIN,
  )
  @ApiOperation({ summary: "Add a report addendum/revision" })
  addRevision(
    @Param("id") id: string,
    @Body()
    dto: {
      findings?: string;
      impression?: string;
      report?: string;
      reason?: string;
    },
    @Req() req: any,
  ) {
    return this.radiologyService.addRevision(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
      req.user.role,
    );
  }

  @Get("orders/:id/revisions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List report revisions for an order" })
  listRevisions(@Param("id") id: string, @Req() req: any) {
    return this.radiologyService.listRevisions(req.user.tenantId, id);
  }

  @Post("orders/:id/critical")
  @Permissions(PermissionAction.EDIT)
  @Roles(
    UserRole.RADIOLOGIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.IT_ADMIN,
  )
  @ApiOperation({ summary: "Flag or clear a critical finding" })
  setCriticalFlag(
    @Param("id") id: string,
    @Body() dto: { isCritical: boolean; note?: string },
    @Req() req: any,
  ) {
    return this.radiologyService.setCriticalFlag(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
      req.user.role,
    );
  }

  @Post("orders/:id/assign")
  @Permissions(PermissionAction.EDIT)
  @Roles(
    UserRole.RADIOLOGIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.IT_ADMIN,
    UserRole.RADIOLOGY_TECHNICIAN,
  )
  @ApiOperation({ summary: "Assign or auto-assign a radiologist to an order" })
  assignRadiologist(
    @Param("id") id: string,
    @Body() dto: { radiologistId?: string },
    @Req() req: any,
  ) {
    return this.radiologyService.assignRadiologist(
      req.user.tenantId,
      id,
      dto.radiologistId,
      req.user.id,
    );
  }

  @Get("tat-metrics")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Radiologist turnaround-time metrics" })
  getTatMetrics(
    @Query() query: { from?: string; to?: string },
    @Req() req: any,
  ) {
    return this.radiologyService.tatMetrics(req.user.tenantId, query);
  }

  @Post("orders/:id/peer-review")
  @Permissions(PermissionAction.EDIT)
  @Roles(
    UserRole.RADIOLOGIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.IT_ADMIN,
  )
  @ApiOperation({ summary: "Request a peer review / second opinion" })
  requestPeerReview(
    @Param("id") id: string,
    @Body() dto: { reviewerId: string; note?: string },
    @Req() req: any,
  ) {
    return this.radiologyService.requestPeerReview(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
      req.user.role,
    );
  }

  @Get("orders/:id/peer-reviews")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List peer reviews for an order" })
  listOrderPeerReviews(@Param("id") id: string, @Req() req: any) {
    return this.radiologyService.listPeerReviews(req.user.tenantId, id);
  }

  @Get("peer-reviews")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List pending peer reviews" })
  listPeerReviews(@Req() req: any) {
    return this.radiologyService.listPeerReviews(req.user.tenantId);
  }

  @Post("peer-reviews/:id/decide")
  @Permissions(PermissionAction.EDIT)
  @Roles(
    UserRole.RADIOLOGIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.IT_ADMIN,
  )
  @ApiOperation({ summary: "Decide a peer review (approve/reject/override)" })
  decidePeerReview(
    @Param("id") id: string,
    @Body()
    dto: { status: "APPROVED" | "REJECTED" | "OVERRIDE"; note?: string },
    @Req() req: any,
  ) {
    return this.radiologyService.decidePeerReview(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
      req.user.role,
    );
  }

  @Get("orders/:id/pdf")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Download radiology report PDF" })
  async downloadReportPdf(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const buffer = await this.radiologyService.generateReportPdf(
      req.user.tenantId,
      id,
      req.user.id,
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="radiology-report-${id.slice(0, 8)}.pdf"`,
    });
    res.send(buffer);
  }

  @Get("summary")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Radiology department summary" })
  getSummary(@Req() req: any) {
    return this.radiologyService.getSummary(req.user.tenantId);
  }
}
