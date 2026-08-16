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
  EncountersService,
  CreateEncounterDto,
  UpdateEncounterDto,
  CreateVitalDto,
  CreatePrescriptionDto,
} from "./encounters.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Encounters")
@Controller("encounters")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Start a clinical encounter" })
  create(@Body() dto: CreateEncounterDto, @Req() req: any) {
    return this.encountersService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List encounters" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.encountersService.findAll(req.user.tenantId, query);
  }

  @Get("vitals/patient/:patientId")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get patient vital history" })
  getVitals(@Param("patientId") patientId: string, @Req() req: any) {
    return this.encountersService.getVitals(req.user.tenantId, patientId);
  }

  @Post("vitals")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Record patient vitals" })
  recordVital(@Body() dto: CreateVitalDto, @Req() req: any) {
    return this.encountersService.recordVital(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Post("prescriptions")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a prescription" })
  createPrescription(@Body() dto: CreatePrescriptionDto, @Req() req: any) {
    return this.encountersService.createPrescription(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("prescriptions/patient/:patientId")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get patient prescriptions" })
  getPatientPrescriptions(
    @Param("patientId") patientId: string,
    @Req() req: any,
  ) {
    return this.encountersService.getPatientPrescriptions(
      req.user.tenantId,
      patientId,
    );
  }

  @Get("prescriptions/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get prescription details" })
  getPrescription(@Param("id") id: string, @Req() req: any) {
    return this.encountersService.getPrescription(req.user.tenantId, id);
  }

  @Patch("prescriptions/:id/approve")
  @Permissions(PermissionAction.SIGN)
  @ApiOperation({ summary: "Approve a prescription (doctor sign-off)" })
  approvePrescription(
    @Param("id") id: string,
    @Body()
    body: {
      signatureData?: string;
      consentText?: string;
    },
    @Req() req: any,
  ) {
    return this.encountersService.approvePrescription(
      req.user.tenantId,
      id,
      req.user.id,
      {
        data: body?.signatureData,
        consentText: body?.consentText,
        ipAddress: req.ip,
        userAgent: req.headers?.["user-agent"],
      },
    );
  }

  @Get("doctor/:doctorId")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get doctor encounters" })
  getDoctorEncounters(
    @Param("doctorId") doctorId: string,
    @Query("date") date: string,
    @Req() req: any,
  ) {
    return this.encountersService.getDoctorEncounters(
      req.user.tenantId,
      doctorId,
      date,
    );
  }

  @Get("follow-ups")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List scheduled patient follow-ups" })
  listFollowUps(@Query() query: any, @Req() req: any) {
    return this.encountersService.listFollowUps(req.user.tenantId, query);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update encounter" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateEncounterDto,
    @Req() req: any,
  ) {
    return this.encountersService.update(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Patch(":id/complete")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Complete an encounter" })
  complete(@Param("id") id: string, @Req() req: any) {
    return this.encountersService.complete(req.user.tenantId, id, req.user.id);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get encounter with full clinical record" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.encountersService.findById(req.user.tenantId, id);
  }
}
