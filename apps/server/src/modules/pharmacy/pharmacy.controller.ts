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
  PharmacyService,
  CreateMedicineDto,
  CreateStoreDto,
  CreateInventoryItemDto,
  StockAdjustmentDto,
  DispenseDto,
  CreatePharmacySaleDto,
} from "./pharmacy.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Pharmacy")
@Controller("pharmacy")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  // ---------- Medicines ----------

  @Get("medicines")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List medicines" })
  findMedicines(@Query() query: any, @Req() req: any) {
    return this.pharmacyService.findMedicines(req.user.tenantId, query);
  }

  @Post("medicines")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a medicine" })
  createMedicine(@Body() dto: CreateMedicineDto, @Req() req: any) {
    return this.pharmacyService.createMedicine(req.user.tenantId, dto);
  }

  @Get("medicines/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get medicine" })
  findMedicineById(@Param("id") id: string, @Req() req: any) {
    return this.pharmacyService.findMedicineById(req.user.tenantId, id);
  }

  @Patch("medicines/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update medicine" })
  updateMedicine(
    @Param("id") id: string,
    @Body() dto: Partial<CreateMedicineDto>,
    @Req() req: any,
  ) {
    return this.pharmacyService.updateMedicine(req.user.tenantId, id, dto);
  }

  // ---------- Stores ----------

  @Get("stores")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List stores" })
  findStores(@Req() req: any) {
    return this.pharmacyService.findStores(req.user.tenantId);
  }

  @Post("stores")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a store" })
  createStore(@Body() dto: CreateStoreDto, @Req() req: any) {
    return this.pharmacyService.createStore(req.user.tenantId, dto);
  }

  @Patch("stores/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update store" })
  updateStore(
    @Param("id") id: string,
    @Body() dto: Partial<CreateStoreDto>,
    @Req() req: any,
  ) {
    return this.pharmacyService.updateStore(req.user.tenantId, id, dto);
  }

  // ---------- Inventory ----------

  @Get("inventory")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List inventory items" })
  findInventory(@Query() query: any, @Req() req: any) {
    return this.pharmacyService.findInventory(req.user.tenantId, query);
  }

  @Post("inventory")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create inventory item" })
  createInventoryItem(@Body() dto: CreateInventoryItemDto, @Req() req: any) {
    return this.pharmacyService.createInventoryItem(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("inventory/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get inventory item with transactions" })
  findInventoryItemById(@Param("id") id: string, @Req() req: any) {
    return this.pharmacyService.findInventoryItemById(req.user.tenantId, id);
  }

  @Patch("inventory/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update inventory item" })
  updateInventoryItem(
    @Param("id") id: string,
    @Body() dto: Partial<CreateInventoryItemDto>,
    @Req() req: any,
  ) {
    return this.pharmacyService.updateInventoryItem(req.user.tenantId, id, dto);
  }

  @Post("inventory/:id/adjust")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Adjust stock (receipt/issue/consumption)" })
  adjustStock(
    @Param("id") id: string,
    @Body() dto: StockAdjustmentDto,
    @Req() req: any,
  ) {
    return this.pharmacyService.adjustStock(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  // ---------- Prescriptions ----------

  @Get("prescriptions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List prescriptions" })
  findPrescriptions(@Query() query: any, @Req() req: any) {
    return this.pharmacyService.findPrescriptions(req.user.tenantId, query);
  }

  // ---------- Dispensing ----------

  @Post("sale")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create an atomic pharmacy sale (stock + billing)" })
  createSale(@Body() dto: CreatePharmacySaleDto, @Req() req: any) {
    return this.pharmacyService.sale(req.user.tenantId, dto, req.user.id);
  }

  @Post("dispense")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Dispense medicines to patient" })
  dispense(@Body() dto: DispenseDto, @Req() req: any) {
    return this.pharmacyService.dispense(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  // ---------- Stock Alerts ----------

  @Get("alerts")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get stock alerts (low stock, near expiry)" })
  getStockAlerts(@Req() req: any) {
    return this.pharmacyService.getStockAlerts(req.user.tenantId);
  }

  @Get("dispensing-history")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List dispensed prescriptions" })
  getDispensingHistory(@Query() query: any, @Req() req: any) {
    return this.pharmacyService.getDispensingHistory(req.user.tenantId, query);
  }

  @Get("summary")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Pharmacy summary statistics" })
  getPharmacySummary(@Req() req: any) {
    return this.pharmacyService.getPharmacySummary(req.user.tenantId);
  }
}
