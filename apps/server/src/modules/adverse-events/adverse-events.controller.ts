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
  AdverseEventsService,
  CreateAdverseEventDto,
  UpdateAdverseEventDto,
} from "./adverse-events.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Adverse Events")
@Controller("adverse-events")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class AdverseEventsController {
  constructor(private readonly adverseEventsService: AdverseEventsService) {}

  @Get("dashboard")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Adverse event dashboard metrics" })
  dashboard(@Req() req: any) {
    return this.adverseEventsService.dashboard(req.user.tenantId);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List adverse events" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.adverseEventsService.findAll(req.user.tenantId, query);
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Report an adverse event" })
  create(@Body() dto: CreateAdverseEventDto, @Req() req: any) {
    return this.adverseEventsService.create(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get adverse event details" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.adverseEventsService.findById(req.user.tenantId, id);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update adverse event" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAdverseEventDto,
    @Req() req: any,
  ) {
    return this.adverseEventsService.update(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }
}
