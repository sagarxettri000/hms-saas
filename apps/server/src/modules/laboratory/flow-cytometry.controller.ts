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
  FlowCytometryService,
  CreateFlowOrderDto,
  FlowListParams,
  StartStudyDto,
  AddRunDto,
  AddPopulationDto,
  UpdatePopulationDto,
  SetMarkerResultDto,
  SubmitResultsDto,
} from "./flow-cytometry.service";
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

@ApiTags("Flow Cytometry")
@Controller("flow-cytometry")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard, RolesGuard, ForbidRolesGuard)
@TenantScoped()
@ApiBearerAuth()
export class FlowCytometryController {
  constructor(private readonly flowCytometryService: FlowCytometryService) {}

  @Get("catalog")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Flow cytometry catalogue (panels with marker layout, markers, instruments)" })
  findCatalog(@Req() req: any) {
    return this.flowCytometryService.findCatalog(req.user.tenantId);
  }

  @Post("ensure-catalog")
  @Permissions(PermissionAction.EDIT)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Idempotently (re)create the flow cytometry catalogue for this tenant" })
  ensureCatalog(@Req() req: any) {
    return this.flowCytometryService.ensureCatalog(req.user.tenantId);
  }

  @Post("orders")
  @Permissions(PermissionAction.CREATE)
  @Roles(...ORDERERS)
  @ApiOperation({ summary: "Create a flow cytometry order (one panel item)" })
  createOrder(@Body() dto: CreateFlowOrderDto, @Req() req: any) {
    return this.flowCytometryService.createOrder(req.user.tenantId, dto, req.user.id);
  }

  @Get("orders")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List flow cytometry orders (worklist)" })
  findOrders(@Query() query: FlowListParams, @Req() req: any) {
    return this.flowCytometryService.findOrders(req.user.tenantId, query);
  }

  @Get("orders/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Flow cytometry order with attached study" })
  findOrderById(@Param("id") id: string, @Req() req: any) {
    return this.flowCytometryService.findOrderById(req.user.tenantId, id);
  }

  @Post("orders/:id/study")
  @Permissions(PermissionAction.CREATE)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Start a study for the order (creates study + initial acquisition run)" })
  startStudy(@Param("id") id: string, @Body() dto: StartStudyDto, @Req() req: any) {
    return this.flowCytometryService.startStudy(req.user.tenantId, id, dto, req.user.id);
  }

  @Post("studies/:id/runs")
  @Permissions(PermissionAction.CREATE)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Add an acquisition run to a study" })
  addRun(@Param("id") id: string, @Body() dto: AddRunDto, @Req() req: any) {
    return this.flowCytometryService.addRun(req.user.tenantId, id, dto, req.user.id);
  }

  @Post("studies/:id/populations")
  @Permissions(PermissionAction.CREATE)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Add a gated population to a study" })
  addPopulation(@Param("id") id: string, @Body() dto: AddPopulationDto, @Req() req: any) {
    return this.flowCytometryService.addPopulation(req.user.tenantId, id, dto, req.user.id);
  }

  @Patch("populations/:id")
  @Permissions(PermissionAction.EDIT)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Update a population (percentages / qualitative interpretation)" })
  updatePopulation(@Param("id") id: string, @Body() dto: UpdatePopulationDto, @Req() req: any) {
    return this.flowCytometryService.updatePopulation(req.user.tenantId, id, dto, req.user.id);
  }

  @Patch("populations/:id/marker-results")
  @Permissions(PermissionAction.EDIT)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Set a marker result for a population (upsert)" })
  setMarkerResult(@Param("id") id: string, @Body() dto: SetMarkerResultDto, @Req() req: any) {
    return this.flowCytometryService.setMarkerResult(req.user.tenantId, id, dto, req.user.id);
  }

  @Post("studies/:id/submit")
  @Permissions(PermissionAction.EDIT)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Finalize populations and submit reportable results" })
  submitResults(@Param("id") id: string, @Body() dto: SubmitResultsDto, @Req() req: any) {
    return this.flowCytometryService.submitResults(req.user.tenantId, id, dto, req.user.id);
  }

  @Get("studies/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Study detail (population tree, marker matrix, runs, analyses)" })
  findStudy(@Param("id") id: string, @Req() req: any) {
    return this.flowCytometryService.findStudy(req.user.tenantId, id);
  }

  @Get("orders/:id/report")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Report payload (whitelisted fields only)" })
  getReport(@Param("id") id: string, @Req() req: any) {
    return this.flowCytometryService.getReport(req.user.tenantId, id);
  }

  @Post("orders/:id/verify")
  @Permissions(PermissionAction.VERIFY)
  @Roles(...PERFORMERS)
  @ApiOperation({ summary: "Verify finalized flow cytometry results" })
  verify(@Param("id") id: string, @Req() req: any) {
    return this.flowCytometryService.verify(req.user.tenantId, id, req.user.id);
  }

  @Post("orders/:id/approve")
  @Permissions(PermissionAction.APPROVE)
  @Roles(...APPROVERS)
  @ApiOperation({ summary: "Approve flow cytometry results" })
  approve(@Param("id") id: string, @Req() req: any) {
    return this.flowCytometryService.approve(req.user.tenantId, id, req.user.id);
  }

  @Post("orders/:id/report")
  @Permissions(PermissionAction.SIGN)
  @Roles(...APPROVERS)
  @ApiOperation({ summary: "Release (sign) the final flow cytometry report" })
  report(@Param("id") id: string, @Req() req: any) {
    return this.flowCytometryService.report(req.user.tenantId, id, req.user.id);
  }

  @Get("orders/:id/pdf")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Flow cytometry report PDF (multi-page)" })
  async downloadReportPdf(@Param("id") id: string, @Req() req: any, @Res() res: any) {
    const buffer = await this.flowCytometryService.generateReportPdf(
      req.user.tenantId,
      id,
      req.user.id,
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="flow-cytometry-report-${id.slice(0, 8)}.pdf"`,
    });
    res.send(buffer);
  }
}