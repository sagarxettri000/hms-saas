import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Settings")
@Controller("settings")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get all tenant settings" })
  getAll(@Req() req: any) {
    return this.settingsService.getAll(req.user.tenantId);
  }

  @Patch("bulk")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Set multiple settings at once" })
  setMany(
    @Body() body: Array<{ key: string; value: unknown }>,
    @Req() req: any,
  ) {
    return this.settingsService.setMany(req.user.tenantId, body, req.user.id);
  }

  @Get("feature-flags")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get tenant feature flags" })
  getFeatureFlags(@Req() req: any) {
    return this.settingsService.getFeatureFlags(req.user.tenantId);
  }

  @Patch("feature-flags/:key")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Set a feature flag" })
  setFeatureFlag(
    @Param("key") key: string,
    @Body() body: { enabled: boolean },
    @Req() req: any,
  ) {
    return this.settingsService.setFeatureFlag(
      req.user.tenantId,
      key,
      body.enabled,
      req.user.id,
    );
  }

  @Get("integrations")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get integration settings" })
  getIntegrations(@Req() req: any) {
    return this.settingsService.getIntegrations(req.user.tenantId);
  }

  @Patch("integrations/:provider")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Configure an integration" })
  setIntegration(
    @Param("provider") provider: string,
    @Body() body: { config: unknown; enabled: boolean },
    @Req() req: any,
  ) {
    return this.settingsService.setIntegration(
      req.user.tenantId,
      provider,
      body.config,
      body.enabled,
      req.user.id,
    );
  }

  @Get(":key")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get a setting by key" })
  get(@Param("key") key: string, @Req() req: any) {
    return this.settingsService.get(req.user.tenantId, key);
  }

  @Put(":key")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Set a setting value" })
  set(
    @Param("key") key: string,
    @Body() body: { value: unknown },
    @Req() req: any,
  ) {
    return this.settingsService.set(
      req.user.tenantId,
      key,
      body.value,
      req.user.id,
    );
  }
}
