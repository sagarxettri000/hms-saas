import {
  Controller,
  Get,
  Header,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { ExportsService } from "./exports.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Exports")
@Controller("exports")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get("patients.csv")
  @Permissions(PermissionAction.EXPORT)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="patients.csv"')
  @ApiOperation({ summary: "Export patients to CSV" })
  async patients(@Req() req: any) {
    return this.exportsService.patientsCsv(req.user.tenantId);
  }

  @Get("invoices.csv")
  @Permissions(PermissionAction.EXPORT)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="invoices.csv"')
  @ApiOperation({ summary: "Export invoices to CSV" })
  async invoices(
    @Req() req: any,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.exportsService.invoicesCsv(req.user.tenantId, { from, to });
  }

  @Get("lab-results.csv")
  @Permissions(PermissionAction.EXPORT)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="lab-results.csv"')
  @ApiOperation({ summary: "Export lab results to CSV" })
  async labResults(@Req() req: any) {
    return this.exportsService.labResultsCsv(req.user.tenantId);
  }

  @Get("prescriptions.csv")
  @Permissions(PermissionAction.EXPORT)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="prescriptions.csv"')
  @ApiOperation({ summary: "Export prescriptions to CSV" })
  async prescriptions(@Req() req: any) {
    return this.exportsService.prescriptionsCsv(req.user.tenantId);
  }

  @Get("reports/revenue.pdf")
  @Permissions(PermissionAction.EXPORT)
  @Header("Content-Type", "application/pdf")
  @Header("Content-Disposition", 'attachment; filename="revenue-summary.pdf"')
  @ApiOperation({ summary: "Export revenue summary to PDF" })
  async revenuePdf(
    @Req() req: any,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const pdf = await this.exportsService.revenuePdf(req.user.tenantId, {
      from,
      to,
    });
    return res.send(pdf);
  }

  @Get("reports/doctor-workload.pdf")
  @Permissions(PermissionAction.EXPORT)
  @Header("Content-Type", "application/pdf")
  @Header("Content-Disposition", 'attachment; filename="doctor-workload.pdf"')
  @ApiOperation({ summary: "Export doctor workload to PDF" })
  async doctorWorkloadPdf(
    @Req() req: any,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const pdf = await this.exportsService.doctorWorkloadPdf(req.user.tenantId, {
      from,
      to,
    });
    return res.send(pdf);
  }
}
