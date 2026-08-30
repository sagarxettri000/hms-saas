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
  CreatePreauthDto,
  PreauthorizationsService,
  UpdatePreauthDto,
} from "./preauthorizations.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Insurance Pre-authorizations")
@Controller("insurance/preauthorizations")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class PreauthorizationsController {
  constructor(private readonly service: PreauthorizationsService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create an insurance pre-authorization request" })
  create(@Body() dto: CreatePreauthDto, @Req() req: any) {
    return this.service.create(req.user.tenantId, dto, req.user.id);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List insurance pre-authorizations" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll(req.user.tenantId, query);
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get a pre-authorization" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.service.findById(req.user.tenantId, id);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a pre-authorization" })
  update(@Param("id") id: string, @Body() dto: UpdatePreauthDto, @Req() req: any) {
    return this.service.update(req.user.tenantId, id, dto, req.user.id);
  }

  @Patch(":id/decision")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Approve or deny a pre-authorization" })
  decide(
    @Param("id") id: string,
    @Body() body: { decision: string; approvedAmount?: number },
    @Req() req: any,
  ) {
    return this.service.decide(
      req.user.tenantId,
      id,
      body.decision,
      body.approvedAmount,
    );
  }
}
