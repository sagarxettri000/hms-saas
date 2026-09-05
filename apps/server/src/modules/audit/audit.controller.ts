import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuditService } from "./audit.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  Permissions,
  Roles,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction, UserRole } from "@hms/shared";

@ApiTags("Audit")
@Controller("audit")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard, RolesGuard)
@Roles(
  UserRole.HOSPITAL_ADMIN,
  UserRole.HOSPITAL_OWNER,
  UserRole.PLATFORM_SUPER_ADMIN,
  UserRole.IT_ADMIN,
  UserRole.AUDITOR,
)
@TenantScoped()
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List audit logs" })
  find(@Query() query: any, @Req() req: any) {
    return this.auditService.find(req.user.tenantId, query);
  }
}
