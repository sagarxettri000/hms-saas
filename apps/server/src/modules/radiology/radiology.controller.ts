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
  RadiologyService,
  CreateRadiologyOrderDto,
  RadiologyOrderSearchParams,
} from "./radiology.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Radiology")
@Controller("radiology")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class RadiologyController {
  constructor(private readonly radiologyService: RadiologyService) {}

  @Post("orders")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a radiology order" })
  create(@Body() dto: CreateRadiologyOrderDto, @Req() req: any) {
    return this.radiologyService.create(req.user.tenantId, dto, req.user.id);
  }

  @Get("orders")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List radiology orders" })
  findAll(@Query() query: RadiologyOrderSearchParams, @Req() req: any) {
    return this.radiologyService.findAll(req.user.tenantId, query);
  }

  @Get("orders/worklist")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Radiology worklist" })
  getWorklist(@Req() req: any) {
    return this.radiologyService.getWorklist(req.user.tenantId);
  }

  @Get("orders/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get radiology order" })
  findById(@Param("id") id: string, @Req() req: any) {
    return this.radiologyService.findById(req.user.tenantId, id);
  }

  @Patch("orders/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Transition order status" })
  transitionStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.radiologyService.transitionStatus(
      req.user.tenantId,
      id,
      body.status,
      req.user.id,
    );
  }

  @Post("orders/:id/images")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Register an uploaded image" })
  addImage(
    @Param("id") id: string,
    @Body()
    dto: {
      fileName: string;
      filePath: string;
      mimeType: string;
      fileSize: number;
      description?: string;
    },
    @Req() req: any,
  ) {
    return this.radiologyService.addImage(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Patch("orders/:id/report")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Write radiology report" })
  writeReport(
    @Param("id") id: string,
    @Body() dto: { findings?: string; impression?: string; report?: string },
    @Req() req: any,
  ) {
    return this.radiologyService.writeReport(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }
}
