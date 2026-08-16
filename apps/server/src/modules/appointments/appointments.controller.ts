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
  AppointmentsService,
  CreateAppointmentDto,
  UpdateAppointmentDto,
  AppointmentSearchParams,
} from "./appointments.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Appointments")
@Controller("appointments")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Book an appointment" })
  create(@Body() dto: CreateAppointmentDto, @Req() req: any) {
    return this.appointmentsService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Search and list appointments" })
  findAll(@Query() query: AppointmentSearchParams, @Req() req: any) {
    return this.appointmentsService.findAll(req.user.tenantId, query);
  }

  @Get("today")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get today's appointments with summary" })
  getToday(@Req() req: any) {
    return this.appointmentsService.getToday(req.user.tenantId);
  }

  @Get("queue")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get live appointment queue" })
  getQueue(
    @Query("departmentId") departmentId: string,
    @Query("doctorId") doctorId: string,
    @Req() req: any,
  ) {
    return this.appointmentsService.getQueue(
      req.user.tenantId,
      departmentId,
      doctorId,
    );
  }

  @Patch(":id/check-in")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Check in a patient for appointment" })
  checkIn(@Param("id") id: string, @Req() req: any) {
    return this.appointmentsService.updateStatus(
      req.user.tenantId,
      id,
      "CHECKED_IN",
      req.user.id,
    );
  }

  @Patch(":id/start")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Start consultation (move to in-consultation)" })
  start(@Param("id") id: string, @Req() req: any) {
    return this.appointmentsService.updateStatus(
      req.user.tenantId,
      id,
      "IN_CONSULTATION",
      req.user.id,
    );
  }

  @Patch(":id/complete")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Complete consultation" })
  complete(@Param("id") id: string, @Req() req: any) {
    return this.appointmentsService.updateStatus(
      req.user.tenantId,
      id,
      "COMPLETED",
      req.user.id,
    );
  }

  @Patch(":id/cancel")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Cancel appointment" })
  cancel(
    @Param("id") id: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    return this.appointmentsService.cancel(
      req.user.tenantId,
      id,
      body.reason,
      req.user.id,
    );
  }

  @Patch(":id/no-show")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Mark appointment as no-show" })
  noShow(@Param("id") id: string, @Req() req: any) {
    return this.appointmentsService.markNoShow(
      req.user.tenantId,
      id,
      req.user.id,
    );
  }

  @Patch(":id/reschedule")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Reschedule an appointment" })
  reschedule(
    @Param("id") id: string,
    @Body()
    body: { appointmentDate: Date; startTime: string; endTime?: string },
    @Req() req: any,
  ) {
    return this.appointmentsService.reschedule(
      req.user.tenantId,
      id,
      body.appointmentDate,
      body.startTime,
      body.endTime,
    );
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update appointment" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAppointmentDto,
    @Req() req: any,
  ) {
    return this.appointmentsService.update(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get appointment details" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.appointmentsService.findById(req.user.tenantId, id);
  }
}
