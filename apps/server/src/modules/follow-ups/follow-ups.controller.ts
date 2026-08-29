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
import {
  FollowUpsService,
  CreateFollowUpDto,
  UpdateFollowUpDto,
} from "./follow-ups.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Follow-ups")
@Controller("follow-ups")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a follow-up and assign doctor(s)" })
  create(@Body() dto: CreateFollowUpDto, @Req() req: any) {
    return this.followUpsService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List follow-ups" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.followUpsService.findAll(req.user.tenantId, query);
  }

  @Get("doctors")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List active doctors for follow-up assignment" })
  listActiveDoctors(@Req() req: any) {
    return this.followUpsService.listActiveDoctors(req.user.tenantId);
  }

  @Post(":id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update follow-up status" })
  updateStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.followUpsService.updateStatus(
      req.user.tenantId,
      id,
      body.status,
      req.user.id,
    );
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update follow-up" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateFollowUpDto,
    @Req() req: any,
  ) {
    return this.followUpsService.update(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get follow-up details" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.followUpsService.findById(req.user.tenantId, id);
  }
}
