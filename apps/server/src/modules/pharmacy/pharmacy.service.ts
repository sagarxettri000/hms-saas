import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateMedicineDto {
  name: string;
  genericName?: string;
  brandName?: string;
  category?: string;
  sku?: string;
  unit?: string;
  strength?: string;
  form?: string;
  purchaseRate?: number;
  salesRate?: number;
  margin?: number;
  reorderLevel?: number;
  requiresPrescription?: boolean;
}

export interface CreateStoreDto {
  name: string;
  code?: string;
  type?: string;
  location?: string;
}

export interface CreateInventoryItemDto {
  medicineId?: string;
  storeId: string;
  name: string;
  itemType?: string;
  sku?: string;
  unit?: string;
  currentStock?: number;
  minStock?: number;
  maxStock?: number;
  reorderLevel?: number;
  location?: string;
  expiryDate?: Date | string;
  batchNumber?: string;
  purchaseRate?: number;
  salesRate?: number;
}

export interface StockAdjustmentDto {
  type:
    | "RECEIPT"
    | "ISSUE"
    | "CONSUMPTION"
    | "ADJUSTMENT"
    | "RETURN"
    | "TRANSFER_IN"
    | "TRANSFER_OUT"
    | "OPENING";
  quantity: number;
  unitPrice?: number;
  batchNumber?: string;
  expiryDate?: Date | string;
  referenceType?: string;
  referenceId?: string;
  remarks?: string;
  direction?: "IN" | "OUT";
}

export interface DispenseItemDto {
  prescriptionItemId?: string;
  medicineName: string;
  medicineId?: string;
  quantity: number;
  batchNumber?: string;
  unitPrice?: number;
}

export interface DispenseDto {
  patientId: string;
  prescriptionId?: string;
  storeId: string;
  items: DispenseItemDto[];
  notes?: string;
}

@Injectable()
export class PharmacyService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Medicines ----------

  async createMedicine(tenantId: string, dto: CreateMedicineDto) {
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Medicine name is required");
    const { tenantId: _t, ...clean } = dto as any;
    return this.prisma.medicine.create({
      data: {
        tenantId,
        ...clean,
        purchaseRate: dto.purchaseRate || 0,
        salesRate: dto.salesRate || 0,
        reorderLevel: dto.reorderLevel || 0,
        requiresPrescription: dto.requiresPrescription ?? true,
      },
    });
  }

  async findMedicines(
    tenantId: string,
    params: {
      query?: string;
      category?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 50;

    const where: any = { tenantId };
    if (params.category) where.category = params.category;
    if (params.query) {
      where.OR = [
        { name: { contains: params.query, mode: "insensitive" } },
        { genericName: { contains: params.query, mode: "insensitive" } },
        { brandName: { contains: params.query, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.medicine.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.medicine.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findMedicineById(tenantId: string, id: string) {
    const med = await this.prisma.medicine.findFirst({
      where: { id, tenantId },
    });
    if (!med) throw new NotFoundException("Medicine not found");
    return med;
  }

  async updateMedicine(
    tenantId: string,
    id: string,
    dto: Partial<CreateMedicineDto>,
  ) {
    await this.findMedicineById(tenantId, id);
    const { tenantId: _t, id: _id, ...clean } = dto as any;
    return this.prisma.medicine.update({ where: { id }, data: clean });
  }

  // ---------- Stores ----------

  async createStore(tenantId: string, dto: CreateStoreDto) {
    return this.prisma.store.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code,
        type: (dto.type || "MAIN") as any,
        location: dto.location,
      },
    });
  }

  async findStores(tenantId: string) {
    return this.prisma.store.findMany({
      where: { tenantId },
      include: {
        _count: { select: { inventoryItems: true, purchaseOrders: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async updateStore(
    tenantId: string,
    id: string,
    dto: Partial<CreateStoreDto>,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
    });
    if (!store) throw new NotFoundException("Store not found");
    return this.prisma.store.update({
      where: { id },
      data: { ...(dto as any) },
    });
  }

  // ---------- Inventory Items ----------

  async createInventoryItem(
    tenantId: string,
    dto: CreateInventoryItemDto,
    userId?: string,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { id: dto.storeId, tenantId },
    });
    if (!store) throw new NotFoundException("Store not found");
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Item name is required");

    const ITEM_TYPES = ["MEDICINE", "SUPPLIES", "EQUIPMENT", "CONSUMABLE", "OTHER"];
    const itemType = dto.itemType || "OTHER";
    if (!ITEM_TYPES.includes(itemType))
      throw new BadRequestException("Invalid item type");

    const currentStock = Number(dto.currentStock) || 0;
    if (currentStock < 0)
      throw new BadRequestException("Current stock cannot be negative");

    const item = await this.prisma.inventoryItem.create({
      data: {
        tenantId,
        storeId: dto.storeId,
        medicineId: dto.medicineId,
        name: dto.name,
        itemType: itemType as any,
        sku: dto.sku,
        unit: dto.unit,
        currentStock,
        minStock: dto.minStock,
        maxStock: dto.maxStock,
        reorderLevel: dto.reorderLevel,
        location: dto.location,
        expiryDate: dto.expiryDate
          ? this.normalizeDate(dto.expiryDate)
          : undefined,
        batchNumber: dto.batchNumber,
        purchaseRate: dto.purchaseRate || 0,
        salesRate: dto.salesRate || 0,
      },
    });

    if (dto.currentStock && dto.currentStock > 0) {
      await this.prisma.inventoryTransaction.create({
        data: {
          tenantId,
          itemId: item.id,
          storeId: dto.storeId,
          type: "OPENING",
          quantity: dto.currentStock,
          unitPrice: dto.purchaseRate,
          totalValue: (dto.purchaseRate || 0) * dto.currentStock,
          batchNumber: dto.batchNumber,
          expiryDate: dto.expiryDate
            ? this.normalizeDate(dto.expiryDate)
            : undefined,
          remarks: "Opening stock",
          createdBy: userId,
        },
      });
    }

    return item;
  }

  async findInventory(
    tenantId: string,
    params: {
      storeId?: string;
      query?: string;
      search?: string;
      lowStock?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 50;

    const where: any = { tenantId };
    if (params.storeId) where.storeId = params.storeId;
    const q = params.query || params.search;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        include: { store: true, medicine: true },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    if (params.lowStock === "true") {
      const allItems = await this.prisma.inventoryItem.findMany({
        where: {
          tenantId,
          currentStock: { gt: 0 },
          reorderLevel: { not: null, gt: 0 },
        },
        include: { store: true, medicine: true },
        orderBy: { currentStock: "asc" },
      });
      const lowStockItems = allItems.filter(
        (item) => Number(item.currentStock) <= Number(item.reorderLevel)
      );
      return {
        data: lowStockItems,
        total: lowStockItems.length,
        page: 1,
        limit: lowStockItems.length || 1,
        totalPages: 1,
      };
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findInventoryItemById(tenantId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId },
      include: {
        store: true,
        medicine: true,
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!item) throw new NotFoundException("Inventory item not found");
    return item;
  }

  async updateInventoryItem(
    tenantId: string,
    id: string,
    dto: Partial<CreateInventoryItemDto>,
  ) {
    await this.findInventoryItemById(tenantId, id);
    const ALLOWED = [
      "name",
      "sku",
      "unit",
      "itemType",
      "minStock",
      "maxStock",
      "reorderLevel",
      "location",
      "expiryDate",
      "batchNumber",
      "purchaseRate",
      "salesRate",
    ];
    const data: any = {};
    for (const field of ALLOWED) {
      if ((dto as any)[field] !== undefined) data[field] = (dto as any)[field];
    }
    if (data.itemType !== undefined) {
      const ITEM_TYPES = ["MEDICINE", "SUPPLIES", "EQUIPMENT", "CONSUMABLE", "OTHER"];
      if (!ITEM_TYPES.includes(data.itemType))
        throw new BadRequestException("Invalid item type");
    }
    if (dto.expiryDate)
      data.expiryDate = this.normalizeDate(dto.expiryDate);
    return this.prisma.inventoryItem.update({
      where: { id },
      data,
    });
  }

  async adjustStock(
    tenantId: string,
    id: string,
    dto: StockAdjustmentDto,
    userId?: string,
  ) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException("Inventory item not found");

    const quantity = Number(dto.quantity);
    if (!quantity || quantity <= 0)
      throw new BadRequestException("Quantity must be a positive number");

    const isInflow = ["RECEIPT", "RETURN", "TRANSFER_IN", "OPENING"].includes(
      dto.type,
    );
    const isOutflow = ["ISSUE", "CONSUMPTION", "TRANSFER_OUT"].includes(
      dto.type,
    );
    // ADJUSTMENT may be either direction; default to outflow for
    // backward compatibility, or honor the explicit direction hint.
    const adjustmentInflow =
      dto.type === "ADJUSTMENT" && dto.direction === "IN";

    const newStock = isInflow || adjustmentInflow
      ? Number(item.currentStock) + quantity
      : isOutflow || dto.type === "ADJUSTMENT"
        ? Number(item.currentStock) - quantity
        : Number(item.currentStock);

    if (newStock < 0)
      throw new ConflictException("Insufficient stock for this transaction");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id },
        data: { currentStock: newStock },
      });

      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          itemId: id,
          storeId: item.storeId,
          type: dto.type as any,
          quantity,
          unitPrice: dto.unitPrice,
          totalValue: dto.unitPrice ? dto.unitPrice * quantity : undefined,
          batchNumber: dto.batchNumber,
          expiryDate: dto.expiryDate
            ? this.normalizeDate(dto.expiryDate)
            : undefined,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
          remarks: dto.remarks,
          createdBy: userId,
        },
      });

      return updated;
    });
  }

  private normalizeDate(input: Date | string): Date {
    if (input instanceof Date) return input;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(input);
  }

  // ---------- Prescriptions ----------

  async findPrescriptions(tenantId: string, params: { status?: string; patientId?: string; page?: number; limit?: number }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 50;

    const where: any = { tenantId };
    if (params.status) where.status = params.status;
    if (params.patientId) where.patientId = params.patientId;

    const [data, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        include: {
          items: true,
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true, mobile: true } },
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async dispense(tenantId: string, dto: DispenseDto, userId: string) {
    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException("At least one item is required");

    const store = await this.prisma.store.findFirst({
      where: { id: dto.storeId, tenantId },
    });
    if (!store) throw new NotFoundException("Store not found");

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const results: any[] = [];

    for (const item of dto.items) {
      const quantity = Number(item.quantity);
      if (!quantity || quantity <= 0)
        throw new BadRequestException(`Invalid quantity for ${item.medicineName}`);

      let unitPrice = Number(item.unitPrice) || 0;

      const inventoryItem = item.medicineId
        ? await this.prisma.inventoryItem.findFirst({
            where: {
              tenantId,
              storeId: dto.storeId,
              medicineId: item.medicineId,
              batchNumber: item.batchNumber || undefined,
            },
          })
        : null;

      if (inventoryItem) {
        const currentStock = Number(inventoryItem.currentStock);
        if (currentStock < quantity)
          throw new ConflictException(
            `Insufficient stock for ${item.medicineName}. Available: ${currentStock}, Requested: ${quantity}`
          );

        if (!unitPrice) unitPrice = Number(inventoryItem.salesRate) || 0;

        await this.adjustStock(tenantId, inventoryItem.id, {
          type: "CONSUMPTION",
          quantity,
          unitPrice,
          batchNumber: item.batchNumber || inventoryItem.batchNumber || undefined,
          referenceType: "DISPENSING",
          remarks: `Dispensed to ${patient.firstName} ${patient.lastName}`,
        }, userId);
      }

      const result = {
        medicineName: item.medicineName,
        quantity,
        unitPrice,
        total: unitPrice * quantity,
      };
      results.push(result);
    }

    if (dto.prescriptionId) {
      await this.prisma.prescription.update({
        where: { id: dto.prescriptionId, tenantId },
        data: { status: "DISPENSED" },
      });
    }

    return {
      success: true,
      patientName: `${patient.firstName} ${patient.lastName}`,
      storeName: store.name,
      items: results,
      totalAmount: results.reduce((sum, r) => sum + r.total, 0),
      dispensedAt: new Date(),
      dispensedBy: userId,
    };
  }

  // ---------- Stock Alerts ----------

  async getStockAlerts(tenantId: string) {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [rawLowStock, nearExpiryItems, outOfStockItems] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: {
          tenantId,
          currentStock: { gt: 0 },
          reorderLevel: { not: null, gt: 0 },
        },
        include: { store: true, medicine: true },
        orderBy: { currentStock: "asc" },
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          tenantId,
          expiryDate: { not: null, lte: thirtyDaysFromNow },
          currentStock: { gt: 0 },
        },
        include: { store: true, medicine: true },
        orderBy: { expiryDate: "asc" },
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          tenantId,
          currentStock: { lte: 0 },
        },
        include: { store: true, medicine: true },
      }),
    ]);

    const lowStockItems = rawLowStock.filter(
      (item) => Number(item.currentStock) <= Number(item.reorderLevel)
    );

    return {
      lowStock: lowStockItems,
      nearExpiry: nearExpiryItems,
      outOfStock: outOfStockItems,
      summary: {
        lowStockCount: lowStockItems.length,
        nearExpiryCount: nearExpiryItems.length,
        outOfStockCount: outOfStockItems.length,
      },
    };
  }

  async getDispensingHistory(
    tenantId: string,
    params: { patientId?: string; from?: string; to?: string; page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, 100);

    const where: any = { tenantId, status: "DISPENSED" };
    if (params.patientId) where.patientId = params.patientId;
    if (params.from || params.to) {
      where.updatedAt = {};
      if (params.from) where.updatedAt.gte = new Date(params.from);
      if (params.to) { const d = new Date(params.to); d.setHours(23, 59, 59, 999); where.updatedAt.lte = d; }
    }

    const [items, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true, phone: true } },
          doctor: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
          items: true,
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPharmacySummary(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalMedicines, pendingPrescriptions, dispensedToday, lowStockCount, totalStockValue] =
      await Promise.all([
        this.prisma.medicine.count({ where: { tenantId, isActive: true } }),
        this.prisma.prescription.count({ where: { tenantId, status: { in: ["DRAFT", "APPROVED"] } } }),
        this.prisma.prescription.count({ where: { tenantId, status: "DISPENSED", updatedAt: { gte: todayStart } } }),
        this.prisma.inventoryItem.count({
          where: { tenantId, currentStock: { gt: 0 }, reorderLevel: { not: null, gt: 0 } },
        }).then(async (c) => {
          const items = await this.prisma.inventoryItem.findMany({
            where: { tenantId, currentStock: { gt: 0 }, reorderLevel: { not: null, gt: 0 } },
            select: { currentStock: true, reorderLevel: true },
          });
          return items.filter((i) => Number(i.currentStock) <= Number(i.reorderLevel)).length;
        }),
        this.prisma.inventoryItem.aggregate({
          where: { tenantId },
          _sum: { currentStock: true },
        }).then(async (r) => {
          const items = await this.prisma.inventoryItem.findMany({
            where: { tenantId },
            select: { currentStock: true, salesRate: true },
          });
          return items.reduce((s, i) => s + Number(i.currentStock) * Number(i.salesRate), 0);
        }),
      ]);

    return {
      totalMedicines,
      pendingPrescriptions,
      dispensedToday,
      lowStockCount,
      totalStockValue,
    };
  }
}
