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
import { EmergencyService, CreateEmergencyCaseDto } from "./emergency.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Emergency")
@Controller("emergency")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Get("dashboard")
  @Permissions(PermissionAction.VIEW)
  getDashboard(@Req() req: any) {
    return this.emergencyService.getDashboard(req.user.tenantId);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  findAll(@Query() query: any, @Req() req: any) {
    return this.emergencyService.findAll(req.user.tenantId, query);
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  create(@Body() dto: CreateEmergencyCaseDto, @Req() req: any) {
    return this.emergencyService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  findById(@Param("id") id: string, @Req() req: any) {
    return this.emergencyService.findById(req.user.tenantId, id);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateEmergencyCaseDto>,
    @Req() req: any,
  ) {
    return this.emergencyService.update(req.user.tenantId, id, dto);
  }

  @Patch(":id/admit")
  @Permissions(PermissionAction.EDIT)
  admit(
    @Param("id") id: string,
    @Body() body: { admittedTo?: string },
    @Req() req: any,
  ) {
    return this.emergencyService.admit(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Patch(":id/discharge")
  @Permissions(PermissionAction.EDIT)
  discharge(
    @Param("id") id: string,
    @Body() body: { dischargeSummary?: string },
    @Req() req: any,
  ) {
    return this.emergencyService.discharge(req.user.tenantId, id, body);
  }
}
