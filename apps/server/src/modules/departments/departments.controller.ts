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
  DepartmentsService,
  CreateDepartmentDto,
  CreateWardDto,
  CreateRoomDto,
  CreateBedDto,
} from "./departments.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Departments")
@Controller("departments")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List all departments" })
  findAll(@Query("includeInactive") includeInactive: string, @Req() req: any) {
    return this.departmentsService.findAll(
      req.user.tenantId,
      includeInactive === "true",
    );
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a department" })
  create(@Body() dto: CreateDepartmentDto, @Req() req: any) {
    return this.departmentsService.create(req.user.tenantId, dto);
  }

  @Patch(":id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a department" })
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateDepartmentDto>,
    @Req() req: any,
  ) {
    return this.departmentsService.update(req.user.tenantId, id, dto);
  }

  @Delete(":id")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Soft-delete a department" })
  remove(@Param("id") id: string, @Req() req: any) {
    return this.departmentsService.remove(req.user.tenantId, id);
  }

  // Wards
  @Get("wards")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List all wards" })
  getWards(@Req() req: any) {
    return this.departmentsService.getWards(req.user.tenantId);
  }

  @Post("wards")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a ward" })
  createWard(@Body() dto: CreateWardDto, @Req() req: any) {
    return this.departmentsService.createWard(req.user.tenantId, dto);
  }

  @Get("wards/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get ward details with rooms and beds" })
  getWardById(@Param("id") id: string, @Req() req: any) {
    return this.departmentsService.getWardById(req.user.tenantId, id);
  }

  // Rooms
  @Get("rooms")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List rooms" })
  getRooms(@Query("wardId") wardId: string, @Req() req: any) {
    return this.departmentsService.getRooms(req.user.tenantId, wardId);
  }

  @Post("rooms")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a room" })
  createRoom(@Body() dto: CreateRoomDto, @Req() req: any) {
    return this.departmentsService.createRoom(req.user.tenantId, dto);
  }

  // Beds
  @Get("beds")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List beds with filters" })
  getBeds(@Query() query: any, @Req() req: any) {
    return this.departmentsService.getBeds(req.user.tenantId, query);
  }

  @Get("bed-board")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get live bed board" })
  getBedBoard(@Req() req: any) {
    return this.departmentsService.getBedBoard(req.user.tenantId);
  }

  @Post("beds")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a bed" })
  createBed(@Body() dto: CreateBedDto, @Req() req: any) {
    return this.departmentsService.createBed(req.user.tenantId, dto);
  }

  @Patch("beds/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update bed status" })
  updateBedStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.departmentsService.updateBedStatus(
      req.user.tenantId,
      id,
      body.status,
    );
  }
}
