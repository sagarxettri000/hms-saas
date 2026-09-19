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

  @Post("validate")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "FHIR validation — profile checks before exchange (FHIR $validate equivalent) (spec #12/#53)" })
  validate(@Body() body: any, @Req() req: any) {
    return this.fhirService.validateResource(req.user.tenantId, body?.resource ?? body);
  }

  @Post("Bundle")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Generate a FHIR document bundle with provenance record (spec #10/#11)" })
  buildBundle(@Body() body: any, @Req() req: any) {
    return this.fhirService.buildBundle(req.user.tenantId, body);
  }

  @Post("consents")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Record patient-authorized sharing consent (spec #49)" })
  createConsent(@Body() body: any, @Req() req: any) {
    return this.fhirService.createConsent(req.user.tenantId, { ...body, createdBy: req.user.id });
  }

  @Post("consents/:id/revoke")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Revoke a consent record (reason required)" })
  revokeConsent(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.fhirService.revokeConsent(req.user.tenantId, id, { ...body, revokedBy: req.user.id });
  }

  @Get("consents")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List consent records" })
  listConsents(@Query("patientId") patientId: string | undefined, @Req() req: any) {
    return this.fhirService.listConsents(req.user.tenantId, patientId || undefined);
  }
}