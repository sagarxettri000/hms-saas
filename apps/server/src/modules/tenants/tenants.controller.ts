import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  TenantsService,
  CreateTenantDto,
  CreateBranchDto,
} from "./tenants.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  Public,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Tenants")
@Controller("tenants")
@UseGuards(JwtAuthGuard, PermissionsGuard, SuperAdminGuard, TenantGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Public()
  @UseGuards(ThrottlerGuard)
  // Public (unauthenticated) onboarding: keep the limit low to discourage
  // scraping/abuse that provisions many tenants + admin accounts at once.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Create a new tenant (hospital onboarding)" })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List tenants (super admin: all; others: own tenant)" })
  findAll(
    @Req() req: any,
    @Query()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    },
  ) {
    const scopeTenantId =
      this.isSuperAdmin(req.user) ? undefined : req.user?.tenantId;
    return this.tenantsService.findAll(query, scopeTenantId);
  }

  @Get("usage/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get tenant usage metrics" })
  getUsage(@Req() req: any, @Param("id") id: string) {
    return this.tenantsService.getUsage(this.resolveTenantId(req, id));
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get tenant details" })
  findById(@Req() req: any, @Param("id") id: string) {
    return this.tenantsService.findById(this.resolveTenantId(req, id));
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update tenant details" })
  update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: Partial<CreateTenantDto>,
  ) {
    const payload = dto as Record<string, unknown>;
    if (payload.requireTwoFactor !== undefined && !this.isSuperAdmin(req.user)) {
      throw new ForbiddenException(
        "Only platform administrators can change the two-factor authentication policy.",
      );
    }
    return this.tenantsService.update(this.resolveTenantId(req, id), dto);
  }

  @Patch(":id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update tenant status (active/suspended/archived)" })
  updateStatus(@Req() req: any, @Param("id") id: string, @Body() body: { status: string }) {
    return this.tenantsService.updateStatus(this.resolveTenantId(req, id), body.status);
  }

  @Patch(":id/archive")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Archive a tenant" })
  archive(@Req() req: any, @Param("id") id: string) {
    return this.tenantsService.archive(this.resolveTenantId(req, id));
  }

  @Post(":id/branches")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a branch for a tenant" })
  createBranch(@Req() req: any, @Param("id") id: string, @Body() dto: CreateBranchDto) {
    return this.tenantsService.createBranch(this.resolveTenantId(req, id), dto);
  }

  @Get(":id/branches")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get tenant branches" })
  getBranches(@Req() req: any, @Param("id") id: string) {
    return this.tenantsService.getBranches(this.resolveTenantId(req, id));
  }

  @Get(":id/departments")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get tenant departments" })
  getDepartments(@Req() req: any, @Param("id") id: string) {
    return this.tenantsService.getDepartments(this.resolveTenantId(req, id));
  }

  private isSuperAdmin(user: any): boolean {
    return user?.role === "PLATFORM_SUPER_ADMIN";
  }

  private resolveTenantId(req: any, requestedId: string): string {
    // Only the platform super admin may operate on an arbitrary tenant id.
    // Hospital admins/owners are always bound to their own tenant.
    return this.isSuperAdmin(req.user) ? requestedId : req.user?.tenantId ?? "";
  }
}
