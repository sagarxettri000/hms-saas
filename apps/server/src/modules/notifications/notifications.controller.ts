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
  NotificationsService,
  CreateNotificationDto,
} from "./notifications.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Notifications")
@Controller("notifications")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("mine")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get my notifications" })
  findMine(@Query() query: any, @Req() req: any) {
    return this.notificationsService.findMine(
      req.user.tenantId,
      req.user.id,
      query,
    );
  }

  @Patch("read-all")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Mark all as read" })
  markAllRead(@Req() req: any) {
    return this.notificationsService.markAllRead(
      req.user.tenantId,
      req.user.id,
    );
  }

  @Patch(":id/read")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Mark notification as read" })
  markAsRead(@Param("id") id: string, @Req() req: any) {
    return this.notificationsService.markAsRead(
      req.user.tenantId,
      id,
      req.user.id,
    );
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create notification" })
  create(@Body() dto: CreateNotificationDto, @Req() req: any) {
    return this.notificationsService.create(req.user.tenantId, dto);
  }
}
