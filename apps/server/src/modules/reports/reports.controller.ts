import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { ReportsService } from "./reports.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Reports")
@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("summary")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Hospital-wide KPI summary" })
  summary(@Query() query: any, @Req() req: any) {
    return this.reportsService.getSummary(req.user.tenantId, query);
  }

  @Get("revenue-by-status")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Revenue grouped by invoice status" })
  revenueByStatus(@Query() query: any, @Req() req: any) {
    return this.reportsService.revenueByStatus(req.user.tenantId, query);
  }

  @Get("appointments-by-status")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Appointments grouped by status" })
  appointmentsByStatus(@Query() query: any, @Req() req: any) {
    return this.reportsService.appointmentsByStatus(req.user.tenantId, query);
  }

  @Get("admissions-by-status")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Admissions grouped by status" })
  admissionsByStatus(@Query() query: any, @Req() req: any) {
    return this.reportsService.admissionsByStatus(req.user.tenantId, query);
  }

  @Get("lab-by-status")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Laboratory orders grouped by status" })
  labByStatus(@Query() query: any, @Req() req: any) {
    return this.reportsService.labByStatus(req.user.tenantId, query);
  }

  @Get("doctor-workload")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Doctor workload by appointment count" })
  doctorWorkload(@Query() query: any, @Req() req: any) {
    return this.reportsService.doctorWorkload(req.user.tenantId, query);
  }

  @Get("departments")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Encounters grouped by department" })
  departments(@Req() req: any) {
    return this.reportsService.departmentStats(req.user.tenantId);
  }

  @Get("analysis")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Analysis report tree" })
  analysisTree(@Req() req: any) {
    return { success: true, data: this.reportsService.getAnalysisTree() };
  }

  @Get("analysis/definitions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "All analysis report definitions" })
  analysisDefinitions(@Req() req: any) {
    return {
      success: true,
      data: this.reportsService.getAnalysisDefinitions(),
    };
  }

  @Get("analysis/options")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({
    summary: "Filter option values for the universal filter engine",
  })
  async analysisOptions(
    @Req() req: any,
    @Query("name") name: string,
    @Query("search") search?: string,
  ) {
    const options = await this.reportsService.getAnalysisOptions(
      req.user.tenantId,
      name,
      search,
    );
    return { success: true, data: options };
  }

  @Get("analysis/:reportId")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Single report definition" })
  analysisDefinition(@Param("reportId") reportId: string, @Req() req: any) {
    return {
      success: true,
      data: this.reportsService.getAnalysisDefinition(reportId),
    };
  }

  @Post("analysis/:reportId/generate")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Generate an analysis report from live data" })
  async generate(
    @Param("reportId") reportId: string,
    @Body() body: Record<string, any>,
    @Req() req: any,
  ) {
    const data = await this.reportsService.generateAnalysis(
      req.user.tenantId,
      req.user.id,
      reportId,
      body || {},
    );
    return { success: true, data };
  }

  @Get("analysis/:reportId/export/:format")
  @Permissions(PermissionAction.EXPORT)
  @ApiOperation({ summary: "Export a generated report as CSV, PDF or Excel" })
  async export(
    @Param("reportId") reportId: string,
    @Param("format") format: string,
    @Query() query: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const out = await this.reportsService.exportAnalysis(
      req.user.tenantId,
      req.user.id,
      reportId,
      query,
      format.toLowerCase(),
    );
    res.setHeader("Content-Type", out.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${out.filename}"`,
    );
    res.setHeader("X-Report-Filename", out.filename);
    return res.send(out.data);
  }
}
