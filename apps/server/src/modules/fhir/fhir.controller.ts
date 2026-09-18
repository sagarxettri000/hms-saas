import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { FhirService } from "./fhir.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("FHIR")
@Controller("fhir")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class FhirController {
  constructor(private readonly fhirService: FhirService) {}

  private fhirHeaders(res: Response) {
    res.setHeader("Content-Type", "application/fhir+json; charset=utf-8");
  }

  @Get("metadata")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "FHIR CapabilityStatement" })
  async metadata(@Req() req: any, @Res() res: Response) {
    this.fhirHeaders(res);
    const statement = await this.fhirService.getCapabilityStatement(
      req.user.tenantId,
    );
    return res.json(statement);
  }

  @Get("Patient")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "FHIR search Patient resources" })
  async searchPatients(
    @Req() req: any,
    @Res() res: Response,
    @Query() query: any,
  ) {
    this.fhirHeaders(res);
    const bundle = await this.fhirService.searchPatients(
      req.user.tenantId,
      query,
    );
    return res.json(bundle);
  }

  @Get("Patient/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "FHIR read a Patient resource" })
  async readPatient(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    this.fhirHeaders(res);
    const resource = await this.fhirService.getPatient(req.user.tenantId, id);
    return res.json(resource);
  }

  @Get("Observation")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "FHIR search Observation resources" })
  async searchObservations(
    @Req() req: any,
    @Res() res: Response,
    @Query() query: any,
  ) {
    this.fhirHeaders(res);
    const bundle = await this.fhirService.searchObservations(
      req.user.tenantId,
      query,
    );
    return res.json(bundle);
  }

  @Get("Observation/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "FHIR read an Observation resource" })
  async readObservation(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    this.fhirHeaders(res);
    const resource = await this.fhirService.getObservation(
      req.user.tenantId,
      id,
    );
    return res.json(resource);
  }

  @Get("DiagnosticReport")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "FHIR search DiagnosticReport resources" })
  async searchReports(
    @Req() req: any,
    @Res() res: Response,
    @Query() query: any,
  ) {
    this.fhirHeaders(res);
    const bundle = await this.fhirService.searchDiagnosticReports(
      req.user.tenantId,
      query,
    );
    return res.json(bundle);
  }

  @Get("DiagnosticReport/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "FHIR read a DiagnosticReport resource" })
  async readReport(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    this.fhirHeaders(res);
    const resource = await this.fhirService.getDiagnosticReport(
      req.user.tenantId,
      id,
    );
    return res.json(resource);
  }
}
