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
  UsersService,
  CreateUserDto,
  UpdateUserDto,
  InviteUserDto,
} from "./users.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Users")
@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a new user" })
  create(@Body() dto: CreateUserDto, @Req() req: any) {
    const tenantId = req.user.tenantId;
    return this.usersService.create({ ...dto, tenantId }, req.user.role);
  }

  @Post("invite")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Invite a new user" })
  invite(@Body() dto: InviteUserDto, @Req() req: any) {
    return this.usersService.invite(req.user.tenantId, dto, req.user.role);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List users" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.usersService.findAll({
      ...query,
      tenantId:
        req.user.role === "PLATFORM_SUPER_ADMIN"
          ? query.tenantId
          : req.user.tenantId,
    });
  }

  @Get("sessions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get current user sessions" })
  getSessions(@Req() req: any) {
    return this.usersService.getSessions(req.user.id);
  }

  @Delete("sessions/:sessionId")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Revoke a user session" })
  revokeSession(@Req() req: any, @Param("sessionId") sessionId: string) {
    return this.usersService.revokeSession(req.user.id, sessionId);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get user details" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.usersService.findById(
      id,
      req.user.role === "PLATFORM_SUPER_ADMIN" ? undefined : req.user.tenantId,
    );
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update user details" })
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    return this.usersService.update(
      id,
      dto,
      req.user.role === "PLATFORM_SUPER_ADMIN" ? undefined : req.user.tenantId,
      req.user.role,
    );
  }

  @Patch(":id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update user status" })
  updateStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.usersService.updateStatus(
      id,
      body.status,
      req.user.role === "PLATFORM_SUPER_ADMIN" ? undefined : req.user.tenantId,
    );
  }

  @Patch(":id/activate")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Activate a user" })
  activate(@Param("id") id: string, @Req() req: any) {
    return this.usersService.activate(
      id,
      req.user.role === "PLATFORM_SUPER_ADMIN" ? undefined : req.user.tenantId,
    );
  }

  @Patch(":id/deactivate")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Deactivate a user" })
  deactivate(@Param("id") id: string, @Req() req: any) {
    return this.usersService.deactivate(
      id,
      req.user.role === "PLATFORM_SUPER_ADMIN" ? undefined : req.user.tenantId,
    );
  }

  @Delete(":id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Soft-delete a user" })
  delete(@Param("id") id: string, @Req() req: any) {
    return this.usersService.delete(
      id,
      req.user.role === "PLATFORM_SUPER_ADMIN" ? undefined : req.user.tenantId,
    );
  }
}
