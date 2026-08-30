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
  EquipmentService,
  CreateEquipmentDto,
  UpdateEquipmentDto,
  CreateLogDto,
} from "./equipment.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Equipment")
@Controller("equipment")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List equipment" })
  findEquipment(@Query() query: any, @Req() req: any) {
    return this.service.findEquipment(req.user.tenantId, query);
  }

  // ---------- Logs (before :id param routes) ----------

  @Get("logs")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List all maintenance logs" })
  findAllLogs(@Query() query: any, @Req() req: any) {
    return this.service.findLogs(req.user.tenantId, query);
  }

  @Post("logs")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a maintenance log entry" })
  createLog(@Body() dto: CreateLogDto, @Req() req: any) {
    return this.service.createLog(req.user.tenantId, dto);
  }

  @Post(":id/serviced")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Record equipment as serviced (adds log + updates last service)" })
  recordService(
    @Param("id") id: string,
    @Body() dto: CreateLogDto,
    @Req() req: any,
  ) {
    return this.service.recordService(req.user.tenantId, id, dto);
  }

  @Get(":id/logs")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List maintenance logs for equipment" })
  findEquipmentLogs(@Param("id") id: string, @Query() query: any, @Req() req: any) {
    return this.service.findLogs(req.user.tenantId, { ...query, equipmentId: id });
  }

  @Get(":id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get equipment" })
  findEquipmentById(@Param("id") id: string, @Req() req: any) {
    return this.service.findEquipmentById(req.user.tenantId, id);
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Add equipment" })
  createEquipment(@Body() dto: CreateEquipmentDto, @Req() req: any) {
    return this.service.createEquipment(req.user.tenantId, dto);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update equipment" })
  updateEquipment(
    @Param("id") id: string,
    @Body() dto: UpdateEquipmentDto,
    @Req() req: any,
  ) {
    return this.service.updateEquipment(req.user.tenantId, id, dto);
  }

  @Delete(":id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete equipment" })
  deleteEquipment(@Param("id") id: string, @Req() req: any) {
    return this.service.deleteEquipment(req.user.tenantId, id);
  }
}
