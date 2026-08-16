import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateSupplierDto {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  panNumber?: string;
}

export interface CreatePurchaseOrderDto {
  supplierId?: string;
  storeId?: string;
  expectedDate?: Date | string;
  deliveryAddress?: string;
  terms?: string;
  notes?: string;
  items: Array<{
    itemName: string;
    medicineId?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
  }>;
}

export interface CreatePurchaseRequestDto {
  departmentId?: string;
  notes?: string;
  items: Array<{
    itemName: string;
    quantity: number;
    unit?: string;
    estimatedPrice?: number;
    remarks?: string;
  }>;
}

export interface CreateGoodsReceiptDto {
  purchaseOrderId?: string;
  supplierId?: string;
  storeId?: string;
  invoiceNumber?: string;
  remarks?: string;
  items: Array<{
    itemName: string;
    medicineId?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    batchNumber?: string;
    expiryDate?: Date | string;
  }>;
}

@Injectable()
export class ProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Suppliers ----------

  async createSupplier(tenantId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: { tenantId, ...dto } });
  }

  async findSuppliers(
    tenantId: string,
    params: { query?: string; page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 50;
    const where: any = { tenantId };
    if (params.query) {
      where.OR = [
        { name: { contains: params.query, mode: "insensitive" } },
        { contactPerson: { contains: params.query, mode: "insensitive" } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateSupplier(
    tenantId: string,
    id: string,
    dto: Partial<CreateSupplierDto>,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  // ---------- Purchase Requests ----------

  async createPurchaseRequest(
    tenantId: string,
    dto: CreatePurchaseRequestDto,
    userId?: string,
  ) {
    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException("At least one item required");
    const requestNumber = await this.generateNumber(
      tenantId,
      "PR",
      "purchaseRequest",
      "requestNumber",
    );

    return this.prisma.purchaseRequest.create({
      data: {
        tenantId,
        requestNumber,
        departmentId: dto.departmentId,
        notes: dto.notes,
        requestedBy: userId,
        items: {
          create: dto.items.map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
            estimatedPrice: item.estimatedPrice,
            remarks: item.remarks,
          })),
        },
      },
      include: { items: true },
    });
  }

  async findPurchaseRequests(
    tenantId: string,
    params: { status?: string; page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const where: any = { tenantId };
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.purchaseRequest.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async approvePurchaseRequest(tenantId: string, id: string, userId?: string) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, tenantId },
    });
    if (!pr) throw new NotFoundException("Purchase request not found");
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
    });
  }

  // ---------- Purchase Orders ----------

  async createPurchaseOrder(
    tenantId: string,
    dto: CreatePurchaseOrderDto,
    userId?: string,
  ) {
    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException("At least one item required");

    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const poNumber = await this.generateNumber(
      tenantId,
      "PO",
      "purchaseOrder",
      "poNumber",
    );

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        poNumber,
        supplierId: dto.supplierId,
        storeId: dto.storeId,
        expectedDate: dto.expectedDate
          ? this.normalizeDate(dto.expectedDate)
          : undefined,
        deliveryAddress: dto.deliveryAddress,
        terms: dto.terms,
        notes: dto.notes,
        totalAmount,
        createdBy: userId,
        items: {
          create: dto.items.map((item) => ({
            itemName: item.itemName,
            medicineId: item.medicineId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          })),
        },
      },
      include: { items: true, supplier: true, store: true },
    });
  }

  async findPurchaseOrders(
    tenantId: string,
    params: {
      status?: string;
      supplierId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const where: any = { tenantId };
    if (params.status) where.status = params.status;
    if (params.supplierId) where.supplierId = params.supplierId;

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { items: true, supplier: true, store: true },
        orderBy: { orderDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findPurchaseOrderById(tenantId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        items: true,
        supplier: true,
        store: true,
        goodsReceipts: true,
      },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    return po;
  }

  async updatePurchaseOrderStatus(
    tenantId: string,
    id: string,
    status: string,
    userId?: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    const data: any = { status: status as any };
    if (status === "CONFIRMED") data.approvedAt = new Date();
    if (status === "APPROVED" || status === "CONFIRMED")
      data.approvedBy = userId;
    return this.prisma.purchaseOrder.update({ where: { id }, data });
  }

  // ---------- Goods Receipts ----------

  async createGoodsReceipt(
    tenantId: string,
    dto: CreateGoodsReceiptDto,
    userId?: string,
  ) {
    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException("At least one item required");

    let purchaseOrder: any = null;
    if (dto.purchaseOrderId) {
      purchaseOrder = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, tenantId },
      });
      if (!purchaseOrder)
        throw new NotFoundException("Purchase order not found");
    }

    const grnNumber = await this.generateNumber(
      tenantId,
      "GRN",
      "goodsReceipt",
      "grnNumber",
    );

    const receipt = await this.prisma.goodsReceipt.create({
      data: {
        tenantId,
        grnNumber,
        purchaseOrderId: dto.purchaseOrderId,
        supplierId: dto.supplierId,
        storeId: dto.storeId,
        invoiceNumber: dto.invoiceNumber,
        remarks: dto.remarks,
        receivedBy: userId,
        items: {
          create: dto.items.map((item) => ({
            itemName: item.itemName,
            medicineId: item.medicineId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate
              ? this.normalizeDate(item.expiryDate)
              : undefined,
            receivedStock: item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    // Update inventory stock + PO received quantity
    if (dto.storeId) {
      for (const item of dto.items) {
        const inventory = await this.prisma.inventoryItem.findFirst({
          where: {
            tenantId,
            storeId: dto.storeId,
            ...(item.medicineId
              ? { medicineId: item.medicineId }
              : { name: item.itemName }),
          },
        });

        if (inventory) {
          await this.prisma.inventoryItem.update({
            where: { id: inventory.id },
            data: {
              currentStock: Number(inventory.currentStock) + item.quantity,
            },
          });
          await this.prisma.inventoryTransaction.create({
            data: {
              tenantId,
              itemId: inventory.id,
              storeId: dto.storeId,
              type: "RECEIPT",
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalValue: item.quantity * item.unitPrice,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate
                ? this.normalizeDate(item.expiryDate)
                : undefined,
              referenceType: "GoodsReceipt",
              referenceId: receipt.id,
              createdBy: userId,
            },
          });
        }
      }
    }

    if (dto.purchaseOrderId) {
      for (const item of dto.items) {
        await this.prisma.purchaseOrderItem
          .updateMany({
            where: {
              purchaseOrderId: dto.purchaseOrderId,
              itemName: item.itemName,
            },
            data: { receivedQuantity: { increment: item.quantity } },
          })
          .catch(() => {});
      }
      await this.prisma.purchaseOrder
        .update({
          where: { id: dto.purchaseOrderId },
          data: { status: "PARTIAL_RECEIVED" },
        })
        .catch(() => {});
    }

    return receipt;
  }

  async findGoodsReceipts(
    tenantId: string,
    params: { page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const [data, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where: { tenantId },
        include: { items: true },
        orderBy: { receivedDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.goodsReceipt.count({ where: { tenantId } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async generateNumber(
    tenantId: string,
    prefix: string,
    model: "purchaseRequest" | "purchaseOrder" | "goodsReceipt",
    field: string,
  ): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest: any = await (this.prisma as any)[model].findFirst({
      where: { tenantId, [field]: { startsWith: `${prefix}-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { [field]: true },
    });

    let seq = 1;
    if (latest) {
      const parts = latest[field].split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}-${ymd}-${String(seq).padStart(4, "0")}`;
  }

  private normalizeDate(input: Date | string): Date {
    if (input instanceof Date) return input;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(input);
  }
}
