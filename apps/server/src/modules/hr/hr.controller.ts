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
  HrService,
  CreateShiftDto,
  CreateRosterDto,
  CreateLeaveDto,
} from "./hr.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("HR")
@Controller("hr")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Get("shifts")
  @Permissions(PermissionAction.VIEW)
  findShifts(@Req() req: any) {
    return this.hrService.findShifts(req.user.tenantId);
  }

  @Post("shifts")
  @Permissions(PermissionAction.CREATE)
  createShift(@Body() dto: CreateShiftDto, @Req() req: any) {
    return this.hrService.createShift(req.user.tenantId, dto);
  }

  @Patch("shifts/:id")
  @Permissions(PermissionAction.EDIT)
  updateShift(
    @Param("id") id: string,
    @Body() dto: Partial<CreateShiftDto>,
    @Req() req: any,
  ) {
    return this.hrService.updateShift(req.user.tenantId, id, dto);
  }

  @Get("rosters")
  @Permissions(PermissionAction.VIEW)
  findRosters(@Query("date") date: string, @Req() req: any) {
    return this.hrService.findRosters(req.user.tenantId, date);
  }

  @Post("rosters")
  @Permissions(PermissionAction.CREATE)
  createRoster(@Body() dto: CreateRosterDto, @Req() req: any) {
    return this.hrService.createRoster(req.user.tenantId, dto);
  }

  @Get("leaves")
  @Permissions(PermissionAction.VIEW)
  findLeaves(@Query("userId") userId: string, @Req() req: any) {
    return this.hrService.findLeaves(req.user.tenantId, userId);
  }

  @Post("leaves")
  @Permissions(PermissionAction.CREATE)
  createLeave(@Body() dto: CreateLeaveDto, @Req() req: any) {
    return this.hrService.createLeave(req.user.tenantId, dto);
  }

  @Patch("leaves/:id/status")
  @Permissions(PermissionAction.APPROVE)
  updateLeaveStatus(
    @Param("id") id: string,
    @Body() body: { status: string; rejectionReason?: string },
    @Req() req: any,
  ) {
    return this.hrService.updateLeaveStatus(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }
}
