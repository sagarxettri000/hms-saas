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
  Roles,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction, UserRole } from "@hms/shared";

const ADMIN_ROLES = [UserRole.HOSPITAL_ADMIN, UserRole.HOSPITAL_OWNER, UserRole.HR_MANAGER];

@ApiTags("HR Attendance & Training")
@Controller("hr")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // ---------------------------------------------------------------
  // Self-service attendance (any authenticated staff member)
  // ---------------------------------------------------------------

  @Get("attendance/me")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "My attendance status for today" })
  meToday(@Req() req: any) {
    return this.service.meToday(req.user.tenantId, req.user.id);
  }

  @Get("attendance/me/history")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "My attendance history" })
  myHistory(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
    @Req() req: any,
  ) {
    return this.service.history(
      req.user.tenantId,
      req.user.id,
      from,
      to,
      Number(page) || 1,
      Math.min(90, Number(limit) || 30),
    );
  }

  @Post("attendance/clock-in")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Clock in (PRESENT or ABSENT) — server-side timestamp" })
  clockIn(@Body() dto: ClockInDto, @Req() req: any) {
    const u = req.user;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email;
    return this.service.clockIn(req.user.tenantId, dto, req.user.id, name);
  }

  @Post("attendance/clock-out")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Clock out — server-side timestamp" })
  clockOut(@Req() req: any) {
    return this.service.clockOut(req.user.tenantId, req.user.id);
  }

  // ---------------------------------------------------------------
  // Admin attendance management
  // ---------------------------------------------------------------

  @Get("attendance/admin")
  @Roles(...ADMIN_ROLES)
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Admin attendance list + summary (filters: status, role, department, search, dates)" })
  adminList(@Query() query: any, @Req() req: any) {
    return this.service.adminList(req.user.tenantId, query);
  }

  @Get("attendance/admin/roster")
  @Roles(...ADMIN_ROLES)
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "All active staff with today's attendance state (incl. NOT_CLOCKED_IN)" })
  adminTodayRoster(@Query() query: any, @Req() req: any) {
    return this.service.adminTodayRoster(req.user.tenantId, query);
  }

  @Get("attendance/admin/:userId")
  @Roles(...ADMIN_ROLES)
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "One staff member's attendance history" })
  adminUserHistory(@Param("userId") userId: string, @Query() query: any, @Req() req: any) {
    return this.service.adminUserHistory(req.user.tenantId, userId, query);
  }

  // Legacy endpoints (kept for the existing HR page)
  @Get("attendance")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List attendance records" })
  listAttendance(@Query() query: any, @Req() req: any) {
    return this.service.listAttendance(req.user.tenantId, query);
  }

  // ---------------------------------------------------------------
  // Training (unchanged)
  // ---------------------------------------------------------------

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
