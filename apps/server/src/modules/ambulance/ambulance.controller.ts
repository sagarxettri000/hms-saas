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
  AmbulanceService,
  CreateVehicleDto,
  UpdateVehicleDto,
  CreateCallDto,
} from "./ambulance.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Ambulance")
@Controller("ambulance")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class AmbulanceController {
  constructor(private readonly service: AmbulanceService) {}

  // ---------- Vehicles ----------

  @Get("vehicles")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List ambulance fleet" })
  findVehicles(@Query() query: any, @Req() req: any) {
    return this.service.findVehicles(req.user.tenantId, query);
  }

  @Get("vehicles/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get a vehicle" })
  findVehicleById(@Param("id") id: string, @Req() req: any) {
    return this.service.findVehicleById(req.user.tenantId, id);
  }

  @Post("vehicles")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Add a vehicle" })
  createVehicle(@Body() dto: CreateVehicleDto, @Req() req: any) {
    return this.service.createVehicle(req.user.tenantId, dto);
  }

  @Patch("vehicles/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a vehicle" })
  updateVehicle(
    @Param("id") id: string,
    @Body() dto: UpdateVehicleDto,
    @Req() req: any,
  ) {
    return this.service.updateVehicle(req.user.tenantId, id, dto);
  }

  @Patch("vehicles/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update vehicle status (available/maintenance)" })
  setVehicleStatus(
    @Param("id") id: string,
    @Body() body: { status: string; currentLocation?: string },
    @Req() req: any,
  ) {
    return this.service.setVehicleStatus(
      req.user.tenantId,
      id,
      body.status,
      body.currentLocation,
    );
  }

  @Delete("vehicles/:id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a vehicle" })
  deleteVehicle(@Param("id") id: string, @Req() req: any) {
    return this.service.deleteVehicle(req.user.tenantId, id);
  }

  // ---------- Calls ----------

  @Get("calls")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List ambulance calls" })
  findCalls(@Query() query: any, @Req() req: any) {
    return this.service.findCalls(req.user.tenantId, query);
  }

  @Get("calls/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get a call" })
  findCallById(@Param("id") id: string, @Req() req: any) {
    return this.service.findCallById(req.user.tenantId, id);
  }

  @Post("calls")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Log a new call" })
  createCall(@Body() dto: CreateCallDto, @Req() req: any) {
    return this.service.createCall(req.user.tenantId, dto);
  }

  @Patch("calls/:id/dispatch")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Dispatch a pending call to an available vehicle" })
  dispatchCall(@Param("id") id: string, @Req() req: any) {
    return this.service.dispatchCall(req.user.tenantId, id);
  }

  @Patch("calls/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Advance call status (en-route/arrived/completed)" })
  setCallStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    const target = body.status;
    if (!["EN_ROUTE", "ARRIVED", "COMPLETED"].includes(target)) {
      return this.service.cancelCall(req.user.tenantId, id);
    }
    return this.service.advanceCall(
      req.user.tenantId,
      id,
      target as "EN_ROUTE" | "ARRIVED" | "COMPLETED",
    );
  }

  @Patch("calls/:id/cancel")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Cancel a call" })
  cancelCall(@Param("id") id: string, @Req() req: any) {
    return this.service.cancelCall(req.user.tenantId, id);
  }

  @Delete("calls/:id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a call" })
  deleteCall(@Param("id") id: string, @Req() req: any) {
    return this.service.deleteCall(req.user.tenantId, id);
  }
}
