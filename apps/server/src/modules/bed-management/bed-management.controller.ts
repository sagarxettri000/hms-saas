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
  BedManagementService,
  CreateWardDto,
  UpdateWardDto,
  CreateRoomDto,
  UpdateRoomDto,
  CreateBedDto,
  UpdateBedDto,
  AllocateBedDto,
  TransferBedDto,
  CreateMaintenanceDto,
  UpdateMaintenanceDto,
  BedSearchParams,
} from "./bed-management.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Bed Management")
@Controller("bed-management")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class BedManagementController {
  constructor(private readonly service: BedManagementService) {}

  @Get("dashboard")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Bed management dashboard with occupancy stats" })
  getDashboard(@Req() req: any) {
    return this.service.getDashboard(req.user.tenantId);
  }

  @Get("board")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({
    summary: "Nursing bed board: all wards with beds, patients and status",
  })
  getBoard(@Req() req: any) {
    return this.service.getBoard(req.user.tenantId);
  }

  @Get("wards")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List all wards" })
  findAllWards(
    @Query() query: { search?: string; page?: number; limit?: number },
    @Req() req: any,
  ) {
    return this.service.findAllWards(req.user.tenantId, query);
  }

  @Get("wards/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get ward detail with beds" })
  findWardById(@Param("id") id: string, @Req() req: any) {
    return this.service.findWardById(req.user.tenantId, id);
  }

  @Post("wards")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a ward" })
  createWard(@Body() dto: CreateWardDto, @Req() req: any) {
    return this.service.createWard(req.user.tenantId, dto);
  }

  @Patch("wards/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a ward" })
  updateWard(
    @Param("id") id: string,
    @Body() dto: UpdateWardDto,
    @Req() req: any,
  ) {
    return this.service.updateWard(req.user.tenantId, id, dto);
  }

  @Delete("wards/:id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a ward" })
  deleteWard(@Param("id") id: string, @Req() req: any) {
    return this.service.deleteWard(req.user.tenantId, id);
  }

  @Get("rooms")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List all rooms" })
  findAllRooms(
    @Query()
    query: { wardId?: string; search?: string; page?: number; limit?: number },
    @Req() req: any,
  ) {
    return this.service.findAllRooms(req.user.tenantId, query);
  }

  @Post("rooms")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a room" })
  createRoom(@Body() dto: CreateRoomDto, @Req() req: any) {
    return this.service.createRoom(req.user.tenantId, dto);
  }

  @Patch("rooms/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a room" })
  updateRoom(
    @Param("id") id: string,
    @Body() dto: UpdateRoomDto,
    @Req() req: any,
  ) {
    return this.service.updateRoom(req.user.tenantId, id, dto);
  }

  @Delete("rooms/:id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a room" })
  deleteRoom(@Param("id") id: string, @Req() req: any) {
    return this.service.deleteRoom(req.user.tenantId, id);
  }

  @Get("beds")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List all beds" })
  findAllBeds(@Query() query: BedSearchParams, @Req() req: any) {
    return this.service.findAllBeds(req.user.tenantId, query);
  }

  @Get("beds/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get bed detail" })
  findBedById(@Param("id") id: string, @Req() req: any) {
    return this.service.findBedById(req.user.tenantId, id);
  }

  @Post("beds")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a bed" })
  createBed(@Body() dto: CreateBedDto, @Req() req: any) {
    return this.service.createBed(req.user.tenantId, dto);
  }

  @Patch("beds/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a bed" })
  updateBed(
    @Param("id") id: string,
    @Body() dto: UpdateBedDto,
    @Req() req: any,
  ) {
    return this.service.updateBed(req.user.tenantId, id, dto);
  }

  @Patch("beds/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update bed status" })
  updateBedStatus(
    @Param("id") id: string,
    @Body() body: { status: string; reason?: string },
    @Req() req: any,
  ) {
    return this.service.updateBedStatus(
      req.user.tenantId,
      id,
      body.status,
      body.reason,
    );
  }

  // ------------------------------------------------------------------
  // Hospital-wide free-bed management (§65.2) — server-side source of truth
  // for compliance, availability, and bed designation.
  // ------------------------------------------------------------------

  @Get("free-beds/summary")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Hospital-wide free-bed compliance summary (required/allocated/available/occupied by ward)" })
  getFreeBedSummary(@Req() req: any) {
    return this.service.getFreeBedSummary(req.user.tenantId);
  }

  @Get("free-beds/available")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Available designated free beds across all wards" })
  getAvailableFreeBeds(@Req() req: any) {
    return this.service.getAvailableFreeBeds(req.user.tenantId);
  }

  @Patch("beds/:id/free-bed")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Designate / un-designate a bed for the free-treatment quota (audited)" })
  setFreeBedDesignation(
    @Param("id") id: string,
    @Body() body: { freeBedEligible: boolean; quotaCategory?: string | null; reason?: string },
    @Req() req: any,
  ) {
    return this.service.setFreeBedDesignation(
      req.user.tenantId,
      id,
      body,
      req.user?.id ?? req.user?.userId,
    );
  }

  @Delete("beds/:id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a bed" })
  deleteBed(@Param("id") id: string, @Req() req: any) {
    return this.service.deleteBed(req.user.tenantId, id);
  }

  @Post("allocate")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Allocate a bed to an admission" })
  allocateBed(@Body() dto: AllocateBedDto, @Req() req: any) {
    return this.service.allocateBed(req.user.tenantId, dto, req.user.id);
  }

  @Post("deallocate/:bedId")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Deallocate a bed" })
  deallocateBed(@Param("bedId") bedId: string, @Req() req: any) {
    return this.service.deallocateBed(req.user.tenantId, bedId);
  }

  @Post("transfer")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Transfer patient to another bed" })
  transferBed(@Body() dto: TransferBedDto, @Req() req: any) {
    return this.service.transferBed(req.user.tenantId, dto, req.user.id);
  }

  @Get("maintenance")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List maintenance records" })
  findAllMaintenance(
    @Query()
    query: { wardId?: string; status?: string; page?: number; limit?: number },
    @Req() req: any,
  ) {
    return this.service.findAllMaintenance(req.user.tenantId, query);
  }

  @Post("maintenance")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a maintenance record" })
  createMaintenance(@Body() dto: CreateMaintenanceDto, @Req() req: any) {
    return this.service.createMaintenance(req.user.tenantId, dto);
  }

  @Patch("maintenance/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a maintenance record" })
  updateMaintenance(
    @Param("id") id: string,
    @Body() dto: UpdateMaintenanceDto,
    @Req() req: any,
  ) {
    return this.service.updateMaintenance(req.user.tenantId, id, dto);
  }

  @Delete("maintenance/:id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a maintenance record" })
  deleteMaintenance(@Param("id") id: string, @Req() req: any) {
    return this.service.deleteMaintenance(req.user.tenantId, id);
  }
}
