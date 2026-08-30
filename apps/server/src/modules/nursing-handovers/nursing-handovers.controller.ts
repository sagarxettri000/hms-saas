import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateHandoverDto,
  NursingHandoversService,
} from "./nursing-handovers.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Nursing Shift Handovers")
@Controller("nursing-handovers")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class NursingHandoversController {
  constructor(private readonly service: NursingHandoversService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Save a nursing shift handover" })
  create(@Body() dto: CreateHandoverDto, @Req() req: any) {
    const u = req.user;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email;
    return this.service.create(req.user.tenantId, dto, req.user.id, name);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List nursing shift handovers" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll(req.user.tenantId, query);
  }
}
