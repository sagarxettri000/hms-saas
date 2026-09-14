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
  ProcurementService,
  CreateSupplierDto,
  CreatePurchaseOrderDto,
  CreatePurchaseRequestDto,
  CreateGoodsReceiptDto,
} from "./procurement.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Procurement")
@Controller("procurement")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  // ---------- Suppliers ----------

  @Get("suppliers")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List suppliers" })
  findSuppliers(@Query() query: any, @Req() req: any) {
    return this.procurementService.findSuppliers(req.user.tenantId, query);
  }

  @Post("suppliers")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create supplier" })
  createSupplier(@Body() dto: CreateSupplierDto, @Req() req: any) {
    return this.procurementService.createSupplier(req.user.tenantId, dto);
  }

  @Patch("suppliers/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update supplier" })
  updateSupplier(
    @Param("id") id: string,
    @Body() dto: Partial<CreateSupplierDto>,
    @Req() req: any,
  ) {
    return this.procurementService.updateSupplier(req.user.tenantId, id, dto);
  }

  // ---------- Purchase Requests ----------

  @Get("purchase-requests")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List purchase requests" })
  findPurchaseRequests(@Query() query: any, @Req() req: any) {
    return this.procurementService.findPurchaseRequests(
      req.user.tenantId,
      query,
    );
  }

  @Post("purchase-requests")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create purchase request" })
  createPurchaseRequest(
    @Body() dto: CreatePurchaseRequestDto,
    @Req() req: any,
  ) {
    return this.procurementService.createPurchaseRequest(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Patch("purchase-requests/:id/approve")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Approve purchase request" })
  approvePurchaseRequest(@Param("id") id: string, @Req() req: any) {
    return this.procurementService.approvePurchaseRequest(
      req.user.tenantId,
      id,
      req.user.id,
    );
  }

  @Patch("purchase-requests/:id/reject")
  @Permissions(PermissionAction.REJECT)
  @ApiOperation({ summary: "Reject purchase request" })
  rejectPurchaseRequest(
    @Param("id") id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.procurementService.rejectPurchaseRequest(
      req.user.tenantId,
      id,
      req.user.id,
      body.reason,
    );
  }

  @Post("purchase-requests/:id/convert")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Convert an approved purchase request into a PO" })
  convertPurchaseRequestToPO(
    @Param("id") id: string,
    @Body() body: Partial<CreatePurchaseOrderDto>,
    @Req() req: any,
  ) {
    return this.procurementService.convertPurchaseRequestToPO(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  // ---------- Purchase Orders ----------

  @Get("purchase-orders")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List purchase orders" })
  findPurchaseOrders(@Query() query: any, @Req() req: any) {
    return this.procurementService.findPurchaseOrders(req.user.tenantId, query);
  }

  @Post("purchase-orders")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create purchase order" })
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto, @Req() req: any) {
    return this.procurementService.createPurchaseOrder(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("purchase-orders/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get purchase order" })
  findPurchaseOrderById(@Param("id") id: string, @Req() req: any) {
    return this.procurementService.findPurchaseOrderById(req.user.tenantId, id);
  }

  @Patch("purchase-orders/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update purchase order status" })
  updatePurchaseOrderStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.procurementService.updatePurchaseOrderStatus(
      req.user.tenantId,
      id,
      body.status,
      req.user.id,
    );
  }

  // ---------- Goods Receipts ----------

  @Get("goods-receipts")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List goods receipts" })
  findGoodsReceipts(@Query() query: any, @Req() req: any) {
    return this.procurementService.findGoodsReceipts(req.user.tenantId, query);
  }

  @Post("goods-receipts")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create goods receipt (stock in)" })
  createGoodsReceipt(@Body() dto: CreateGoodsReceiptDto, @Req() req: any) {
    return this.procurementService.createGoodsReceipt(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }
}
