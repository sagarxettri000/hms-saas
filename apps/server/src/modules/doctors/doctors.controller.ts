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
  DoctorsService,
  CreateDoctorDto,
  UpdateDoctorDto,
  CreateScheduleDto,
} from "./doctors.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Doctors")
@Controller("doctors")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a doctor (creates linked user account)" })
  create(@Body() dto: CreateDoctorDto, @Req() req: any) {
    return this.doctorsService.create(req.user.tenantId, dto);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List doctors" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.doctorsService.findAll(req.user.tenantId, query);
  }

  @Get("schedules")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get doctor schedules" })
  getSchedules(@Query("doctorId") doctorId: string, @Req() req: any) {
    return this.doctorsService.getSchedules(req.user.tenantId, doctorId);
  }

  @Get(":id/availability")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get doctor availability for a date" })
  getAvailability(
    @Param("id") id: string,
    @Query("date") date: string,
    @Req() req: any,
  ) {
    return this.doctorsService.getAvailability(
      req.user.tenantId,
      id,
      new Date(date),
    );
  }

  @Get(":id/dashboard")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get doctor dashboard" })
  getDashboard(@Param("id") id: string, @Req() req: any) {
    return this.doctorsService.getDoctorDashboard(req.user.tenantId, id);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get doctor details" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.doctorsService.findById(req.user.tenantId, id);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update doctor details" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDoctorDto,
    @Req() req: any,
  ) {
    return this.doctorsService.update(req.user.tenantId, id, dto);
  }

  @Post("schedules")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a doctor schedule" })
  createSchedule(@Body() dto: CreateScheduleDto, @Req() req: any) {
    return this.doctorsService.createSchedule(req.user.tenantId, dto);
  }

  @Patch("schedules/:scheduleId")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a doctor schedule" })
  updateSchedule(
    @Param("scheduleId") scheduleId: string,
    @Body() dto: Partial<CreateScheduleDto>,
    @Req() req: any,
  ) {
    return this.doctorsService.updateSchedule(
      req.user.tenantId,
      scheduleId,
      dto,
    );
  }
}
