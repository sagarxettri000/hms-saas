import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RolesService, CreateRoleDto } from "./roles.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { PermissionAction, UserRole } from "@hms/shared";

@ApiTags("Roles")
@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List all roles" })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get("available")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({
    summary: "List all available system roles with their default permissions",
  })
  listAvailableRoles() {
    return this.rolesService.listAvailableRoles();
  }

  @Get("permissions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List all permission actions" })
  listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Get("default/:role")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get default permissions for a role" })
  getRolePermissions(@Param("role") role: UserRole) {
    return this.rolesService.getRolePermissions(role);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get role details" })
  findById(@Param("id") id: string) {
    return this.rolesService.findById(id);
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a custom role" })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a role" })
  update(@Param("id") id: string, @Body() dto: Partial<CreateRoleDto>) {
    return this.rolesService.update(id, dto);
  }

  @Delete(":id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a custom role" })
  remove(@Param("id") id: string) {
    return this.rolesService.remove(id);
  }
}
