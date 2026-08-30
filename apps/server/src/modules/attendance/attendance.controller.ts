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
  AttendanceService,
  ClockInDto,
  EnrollTrainingDto,
} from "./attendance.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("HR Attendance & Training")
@Controller("hr")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post("attendance/clock-in")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Clock in for the day" })
  clockIn(@Body() dto: ClockInDto, @Req() req: any) {
    const u = req.user;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email;
    return this.service.clockIn(req.user.tenantId, dto, req.user.id, name);
  }

  @Post("attendance/clock-out")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Clock out for the day" })
  clockOut(@Req() req: any) {
    return this.service.clockOut(req.user.tenantId, req.user.id);
  }

  @Get("attendance")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List attendance records" })
  listAttendance(@Query() query: any, @Req() req: any) {
    return this.service.listAttendance(req.user.tenantId, query);
  }

  @Post("training")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Enroll staff in a training program" })
  enroll(@Body() dto: EnrollTrainingDto, @Req() req: any) {
    const u = req.user;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email;
    return this.service.enroll(req.user.tenantId, dto, req.user.id, name);
  }

  @Get("training")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List training records" })
  listTraining(@Query() query: any, @Req() req: any) {
    return this.service.listTraining(req.user.tenantId, query);
  }

  @Patch("training/:id/complete")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Toggle training completion" })
  toggleTraining(@Param("id") id: string, @Req() req: any) {
    return this.service.toggleTraining(req.user.tenantId, id);
  }

  @Patch("training/:id/certificate")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Set certificate date for training" })
  setCertificateDate(
    @Param("id") id: string,
    @Body() body: { certificateDate?: string },
    @Req() req: any,
  ) {
    return this.service.setCertificateDate(req.user.tenantId, id, body.certificateDate);
  }
}
