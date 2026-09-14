import {
  BadRequestException,
  Injectable,
  Logger,
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
  purchaseRequestId?: string;
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
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  neededBy?: Date | string;
  justification?: string;
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
  private readonly logger = new Logger(ProcurementService.name);

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
        priority: dto.priority || "NORMAL",
        neededBy: dto.neededBy
          ? this.normalizeDate(dto.neededBy)
          : undefined,
        justification: dto.justification,
        notes: dto.notes,
        requestedBy: userId,
        status: "PENDING",
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

    const [rows, total] = await Promise.all([
      this.prisma.purchaseRequest.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    const departmentIds = Array.from(
      new Set(rows.map((r) => r.departmentId).filter(Boolean)),
    ) as string[];
    const userIds = Array.from(
      new Set(rows.map((r) => [r.requestedBy, r.approvedBy]).flat().filter(Boolean)),
    ) as string[];

    const [departments, users] = await Promise.all([
      departmentIds.length
        ? this.prisma.department.findMany({
            where: { tenantId, id: { in: departmentIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
    ]);

    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = rows.map((r: any) => ({
      ...r,
      department: r.departmentId
        ? { id: r.departmentId, name: deptMap.get(r.departmentId) }
        : null,
      requestedBy: r.requestedBy ? userMap.get(r.requestedBy) : null,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async approvePurchaseRequest(tenantId: string, id: string, userId?: string) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, tenantId },
    });
    if (!pr) throw new NotFoundException("Purchase request not found");
    if (pr.status === "APPROVED" || pr.status === "CONVERTED")
      throw new BadRequestException("Purchase request is already approved/converted");
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedBy: userId,
        approvedAt: new Date(),
        rejectedBy: null,
        rejectedAt: null,
      },
    });
  }

  async rejectPurchaseRequest(
    tenantId: string,
    id: string,
    userId?: string,
    reason?: string,
  ) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, tenantId },
    });
    if (!pr) throw new NotFoundException("Purchase request not found");
    if (pr.status === "APPROVED" || pr.status === "CONVERTED")
      throw new BadRequestException("Approved/converted requests cannot be rejected");
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedBy: userId,
        rejectedAt: new Date(),
        notes: reason
          ? [pr.notes, `Rejection reason: ${reason}`].filter(Boolean).join("\n")
          : pr.notes,
      },
    });
  }

  async convertPurchaseRequestToPO(
    tenantId: string,
    id: string,
    dto: { supplierId?: string; storeId?: string; expectedDate?: Date | string; deliveryAddress?: string; terms?: string; notes?: string },
    userId?: string,
  ) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!pr) throw new NotFoundException("Purchase request not found");
    if (pr.status !== "APPROVED")
      throw new BadRequestException("Only approved purchase requests can be converted to a purchase order");
    if (!pr.items || pr.items.length === 0)
      throw new BadRequestException("Purchase request has no items");

    const poNumber = await this.generateNumber(
      tenantId,
      "PO",
      "purchaseOrder",
      "poNumber",
    );

    const totalAmount = pr.items.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity) *
          (Number((item as any).estimatedPrice) || 0),
      0,
    );

    const po = await this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        poNumber,
        purchaseRequestId: pr.id,
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
          create: pr.items.map((item: any) => ({
            itemName: item.itemName,
            medicineId: item.medicineId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: Number(item.estimatedPrice) || 0,
            totalPrice:
              Number(item.quantity) * (Number(item.estimatedPrice) || 0),
          })),
        },
      },
      include: { items: true, supplier: true, store: true, purchaseRequest: true },
    });

    await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: "CONVERTED" },
    });

    return po;
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
        purchaseRequestId: dto.purchaseRequestId,
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
        include: {
          items: true,
          supplier: true,
          store: true,
          purchaseRequest: { select: { id: true, requestNumber: true } },
        },
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
        goodsReceipts: { include: { items: true } },
        purchaseRequest: { select: { id: true, requestNumber: true } },
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

    if (dto.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: dto.storeId, tenantId },
      });
      if (!store) throw new NotFoundException("Store not found");
    }

    const grnNumber = await this.generateNumber(
      tenantId,
      "GRN",
      "goodsReceipt",
      "grnNumber",
    );

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
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

      // Stock in: upsert inventory items and record RECEIPT transactions
      if (dto.storeId) {
        for (const item of dto.items) {
          const existing = await tx.inventoryItem.findFirst({
            where: {
              tenantId,
              storeId: dto.storeId,
              ...(item.medicineId
                ? { medicineId: item.medicineId }
                : { name: item.itemName }),
            },
          });

          let inventory: any;
          if (existing) {
            inventory = await tx.inventoryItem.update({
              where: { id: existing.id },
              data: {
                currentStock: { increment: item.quantity },
                ...(item.batchNumber
                  ? { batchNumber: item.batchNumber }
                  : {}),
                ...(item.expiryDate
                  ? { expiryDate: this.normalizeDate(item.expiryDate) }
                  : {}),
              },
            });
          } else {
            inventory = await tx.inventoryItem.create({
              data: {
                tenantId,
                storeId: dto.storeId,
                medicineId: item.medicineId,
                name: item.itemName,
                itemType: item.medicineId ? "MEDICINE" : "OTHER",
                unit: item.unit,
                currentStock: item.quantity,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate
                  ? this.normalizeDate(item.expiryDate)
                  : undefined,
                purchaseRate: item.unitPrice || 0,
              },
            });
          }

          await tx.inventoryTransaction.create({
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

      // Track received quantities and move the PO forward
      if (dto.purchaseOrderId) {
        for (const item of dto.items) {
          await tx.purchaseOrderItem
            .updateMany({
              where: {
                purchaseOrderId: dto.purchaseOrderId,
                itemName: item.itemName,
              },
              data: { receivedQuantity: { increment: item.quantity } },
            })
            .catch((err) =>
              this.logger.warn(
                "purchaseOrderItem receivedQuantity update failed",
                err,
              ),
            );
        }
        const poItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: dto.purchaseOrderId },
        });
        const fullyReceived =
          poItems.length > 0 &&
          poItems.every(
            (i) => Number(i.receivedQuantity) >= Number(i.quantity),
          );
        await tx.purchaseOrder.update({
          where: { id: dto.purchaseOrderId },
          data: { status: fullyReceived ? "RECEIVED" : "PARTIAL_RECEIVED" },
        });
      }

      return receipt;
    });
  }

  async findGoodsReceipts(
    tenantId: string,
    params: { page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const [rows, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where: { tenantId },
        include: {
          items: true,
          purchaseOrder: { select: { id: true, poNumber: true } },
        },
        orderBy: { receivedDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.goodsReceipt.count({ where: { tenantId } }),
    ]);

    const supplierIds = Array.from(
      new Set(rows.map((r) => r.supplierId).filter(Boolean)),
    ) as string[];
    const storeIds = Array.from(
      new Set(rows.map((r) => r.storeId).filter(Boolean)),
    ) as string[];
    const [suppliers, stores] = await Promise.all([
      supplierIds.length
        ? this.prisma.supplier.findMany({
            where: { tenantId, id: { in: supplierIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      storeIds.length
        ? this.prisma.store.findMany({
            where: { tenantId, id: { in: storeIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));

    const data = rows.map((r: any) => ({
      ...r,
      supplier: r.supplierId
        ? { id: r.supplierId, name: supplierMap.get(r.supplierId) }
        : null,
      store: r.storeId ? { id: r.storeId, name: storeMap.get(r.storeId) } : null,
    }));

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
