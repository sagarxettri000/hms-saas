import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  PatientsService,
  CreatePatientDto,
  UpdatePatientDto,
  PatientSearchParams,
} from "./patients.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Patients")
@Controller("patients")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Register a new patient" })
  create(@Body() dto: CreatePatientDto, @Req() req: any) {
    return this.patientsService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Search and list patients" })
  async findAll(@Query() query: PatientSearchParams, @Req() req: any) {
    const result = await this.patientsService.findAll(
      req.user.tenantId,
      query,
    );
    result.data = this.patientsService.maskPatientPhi(
      req.user.role,
      result.data,
    );
    return result;
  }

  @Get("duplicates")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Find duplicate patients" })
  findDuplicates(@Query() query: any, @Req() req: any) {
    return this.patientsService.findDuplicates(req.user.tenantId, query);
  }

  @Get("search")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Global patient search" })
  async search(@Query() query: PatientSearchParams, @Req() req: any) {
    const result = await this.patientsService.findAll(
      req.user.tenantId,
      query,
    );
    result.data = this.patientsService.maskPatientPhi(
      req.user.role,
      result.data,
    );
    return result;
  }

  @Get("by-mrn/:mrn")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Find patient by MRN" })
  findByMrn(@Param("mrn") mrn: string, @Req() req: any) {
    return this.patientsService.findByMrn(req.user.tenantId, mrn);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get patient details with full record" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.patientsService.findById(req.user.tenantId, id);
  }

  @Get(":id/timeline")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get patient timeline (EMR)" })
  getTimeline(@Param("id") id: string, @Req() req: any) {
    return this.patientsService.getTimeline(req.user.tenantId, id);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update patient details" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdatePatientDto,
    @Req() req: any,
  ) {
    return this.patientsService.update(req.user.tenantId, id, dto, req.user.id);
  }

  @Delete(":id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Soft-delete a patient" })
  remove(@Param("id") id: string, @Req() req: any) {
    return this.patientsService.remove(req.user.tenantId, id, req.user.id);
  }
}
