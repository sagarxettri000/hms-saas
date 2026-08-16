import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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
}
