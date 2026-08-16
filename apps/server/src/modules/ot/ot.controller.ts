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
import { OtService, CreateOtCaseDto } from "./ot.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("OT")
@Controller("ot")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class OtController {
  constructor(private readonly otService: OtService) {}

  @Get("schedule")
  @Permissions(PermissionAction.VIEW)
  getSchedule(@Query("date") date: string, @Req() req: any) {
    return this.otService.getSchedule(req.user.tenantId, date);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  findAll(@Query() query: any, @Req() req: any) {
    return this.otService.findAll(req.user.tenantId, query);
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  create(@Body() dto: CreateOtCaseDto, @Req() req: any) {
    return this.otService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  findById(@Param("id") id: string, @Req() req: any) {
    return this.otService.findById(req.user.tenantId, id);
  }

  @Patch(":id/status")
  @Permissions(PermissionAction.EDIT)
  updateStatus(
    @Param("id") id: string,
    @Body()
    body: {
      status: string;
      otRoom?: string;
      startTime?: string;
      endTime?: string;
    },
    @Req() req: any,
  ) {
    return this.otService.updateStatus(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Patch(":id/checklist")
  @Permissions(PermissionAction.EDIT)
  saveChecklist(
    @Param("id") id: string,
    @Body() body: { checklist: any },
    @Req() req: any,
  ) {
    return this.otService.saveChecklist(req.user.tenantId, id, body.checklist);
  }

  @Patch(":id/findings")
  @Permissions(PermissionAction.EDIT)
  updateFindings(
    @Param("id") id: string,
    @Body() body: { findings: string },
    @Req() req: any,
  ) {
    return this.otService.updateFindings(req.user.tenantId, id, body.findings);
  }
}
