import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ControlledSubstancesService,
  CreateControlledLogDto,
} from "./controlled-substances.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Pharmacy Controlled Substances")
@Controller("pharmacy/controlled-substances")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class ControlledSubstancesController {
  constructor(private readonly service: ControlledSubstancesService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Log a controlled substance dispense/usage" })
  create(@Body() dto: CreateControlledLogDto, @Req() req: any) {
    const u = req.user;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email;
    return this.service.create(req.user.tenantId, dto, req.user.id, name);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List controlled substance log entries" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll(req.user.tenantId, query);
  }

  @Delete(":id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a controlled substance log entry" })
  remove(@Param("id") id: string, @Req() req: any) {
    return this.service.remove(req.user.tenantId, id);
  }
}
