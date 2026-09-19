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
import {
  AdmissionsService,
  AddConsultantDto,
  CreateAdmissionDto,
  UpdateAdmissionDto,
  AdmissionSearchParams,
} from "./admissions.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Admissions")
@Controller("admissions")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class AdmissionsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Admit a patient" })
  create(@Body() dto: CreateAdmissionDto, @Req() req: any) {
    return this.admissionsService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List admissions" })
  findAll(@Query() query: AdmissionSearchParams, @Req() req: any) {
    return this.admissionsService.findAll(req.user.tenantId, query);
  }

  @Get("active")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Currently admitted patients" })
  getActive(@Req() req: any) {
    return this.admissionsService.getActiveAdmissions(req.user.tenantId);
  }

  @Get("bed-board")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Bed board with occupancy summary" })
  getBedBoard(@Req() req: any) {
    return this.admissionsService.getBedBoard(req.user.tenantId);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get admission details" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.admissionsService.findById(req.user.tenantId, id);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update admission" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAdmissionDto,
    @Req() req: any,
  ) {
    return this.admissionsService.update(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Post(":id/allocate-bed")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Allocate a bed to an admission" })
  allocateBed(
    @Param("id") id: string,
    @Body() body: { bedId: string },
    @Req() req: any,
  ) {
    return this.admissionsService.allocateBed(
      req.user.tenantId,
      id,
      body.bedId,
      req.user.id,
    );
  }

  @Post(":id/transfer-bed")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Transfer patient to another bed" })
  transferBed(
    @Param("id") id: string,
    @Body() body: { bedId: string; reason?: string },
    @Req() req: any,
  ) {
    return this.admissionsService.transferBed(
      req.user.tenantId,
      id,
      body.bedId,
      body.reason || "",
      req.user.id,
    );
  }

  @Post(":id/discharge")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Discharge a patient" })
  discharge(
    @Param("id") id: string,
    @Body()
    dto: {
      dischargeType?: string;
      dischargeSummary?: string;
      finalDiagnosis?: string;
    },
    @Req() req: any,
  ) {
    return this.admissionsService.discharge(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Get(":id/consultants")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List consultants on an admission (primary + additional)" })
  getConsultants(@Param("id") id: string, @Req() req: any) {
    return this.admissionsService.getConsultants(req.user.tenantId, id);
  }

  @Post(":id/consultants")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Add an additional consultant to an admission" })
  addConsultant(
    @Param("id") id: string,
    @Body() dto: AddConsultantDto,
    @Req() req: any,
  ) {
    return this.admissionsService.addConsultant(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Get(":id/nursing-notes")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get nursing notes for admission" })
  getNursingNotes(@Param("id") id: string, @Req() req: any) {
    return this.admissionsService.getNursingNotes(req.user.tenantId, id);
  }

  @Post(":id/nursing-notes")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Add a nursing note" })
  addNursingNote(
    @Param("id") id: string,
    @Body() dto: { note: string; assessment?: string; plan?: string },
    @Req() req: any,
  ) {
    return this.admissionsService.addNursingNote(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Get(":id/medications")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get medication schedule for admission" })
  getMedications(@Param("id") id: string, @Req() req: any) {
    return this.admissionsService.getMedications(req.user.tenantId, id);
  }

  @Post(":id/medications")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Schedule a medication administration" })
  addMedication(
    @Param("id") id: string,
    @Body()
    dto: {
      medicineName: string;
      dose: string;
      route?: string;
      scheduledTime: Date | string;
      medicineId?: string;
    },
    @Req() req: any,
  ) {
    return this.admissionsService.addMedication(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Post(":id/medications/:medId/administer")
  @Permissions(PermissionAction.VERIFY)
  @ApiOperation({ summary: "Record medication administration" })
  administerMedication(
    @Param("id") id: string,
    @Param("medId") medId: string,
    @Body()
    dto: { status?: string; givenTime?: Date | string; remarks?: string },
    @Req() req: any,
  ) {
    return this.admissionsService.administerMedication(
      req.user.tenantId,
      id,
      medId,
      dto,
      req.user.id,
    );
  }
}
