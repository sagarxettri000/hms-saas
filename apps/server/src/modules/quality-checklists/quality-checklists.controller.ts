import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { QualityChecklistsService } from "./quality-checklists.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Quality Checklists")
@Controller("quality/checklists")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class QualityChecklistsController {
  constructor(private readonly service: QualityChecklistsService) {}

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List quality checklist items and their status" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll(req.user.tenantId, query);
  }

  @Patch("toggle")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Toggle a checklist item checked state" })
  setItem(@Body() body: { category?: string; item?: string; checked?: boolean }, @Req() req: any) {
    return this.service.setItem(req.user.tenantId, body, req.user.id);
  }
}
