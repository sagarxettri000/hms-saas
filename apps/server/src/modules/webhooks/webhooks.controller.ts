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
  WebhooksService,
  CreateWebhookDto,
  CreateApiKeyDto,
} from "./webhooks.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Webhooks & API Keys")
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get("webhooks")
  @Permissions(PermissionAction.VIEW)
  findWebhooks(@Req() req: any) {
    return this.webhooksService.findWebhooks(req.user.tenantId);
  }

  @Post("webhooks")
  @Permissions(PermissionAction.CREATE)
  createWebhook(@Body() dto: CreateWebhookDto, @Req() req: any) {
    return this.webhooksService.createWebhook(req.user.tenantId, dto);
  }

  @Patch("webhooks/:id")
  @Permissions(PermissionAction.EDIT)
  updateWebhook(
    @Param("id") id: string,
    @Body() dto: Partial<CreateWebhookDto>,
    @Req() req: any,
  ) {
    return this.webhooksService.updateWebhook(req.user.tenantId, id, dto);
  }

  @Delete("webhooks/:id")
  @Permissions(PermissionAction.DELETE)
  deleteWebhook(@Param("id") id: string, @Req() req: any) {
    return this.webhooksService.deleteWebhook(req.user.tenantId, id);
  }

  @Get("webhook-deliveries")
  @Permissions(PermissionAction.VIEW)
  findDeliveries(@Query("webhookId") webhookId: string, @Req() req: any) {
    return this.webhooksService.findDeliveries(req.user.tenantId, webhookId);
  }

  @Get("api-keys")
  @Permissions(PermissionAction.VIEW)
  findApiKeys(@Req() req: any) {
    return this.webhooksService.findApiKeys(req.user.tenantId);
  }

  @Post("api-keys")
  @Permissions(PermissionAction.CREATE)
  createApiKey(@Body() dto: CreateApiKeyDto, @Req() req: any) {
    return this.webhooksService.createApiKey(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Delete("api-keys/:id")
  @Permissions(PermissionAction.DELETE)
  revokeApiKey(@Param("id") id: string, @Req() req: any) {
    return this.webhooksService.revokeApiKey(req.user.tenantId, id);
  }
}
