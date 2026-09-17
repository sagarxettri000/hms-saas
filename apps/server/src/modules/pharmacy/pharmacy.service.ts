import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";

const MAX_LIMIT = 100;

/** TenantSetting key holding the Pharmacy-scoped tax registration numbers. */
export const PHARMACY_BILLING_SETTING_KEY = "pharmacyBilling";

export interface PharmacyBillingSettings {
  vatNumber?: string;
  panNumber?: string;
}

/** Code 128-B encodes printable ASCII; anything else cannot be a barcode. */
const CODE128_PATTERN = /^[ -~]+$/;

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
  taxPercent?: number;
  discountAmount?: number;
  discountReason?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  isCredit?: boolean;
  notes?: string;
}

export interface SaleItemDto {
  medicineId: string;
  batchNumber?: string;
  quantity: number;
  unitPrice?: number;
  discountPercent?: number;
  taxPercent?: number;
}

export interface CreatePharmacySaleDto {
  patientId?: string;
  customerName?: string;
  customerPhone?: string;
  storeId: string;
  prescriptionId?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  taxPercent?: number;
  discountAmount?: number;
  discountReason?: string;
  isCredit?: boolean;
  notes?: string;
  items: SaleItemDto[];
}

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Pharmacy-scoped tax registration numbers (TenantSetting key
   * `pharmacyBilling`). Read at billing time — never copied into other
   * departments' documents.
   */
  async getBillingSettings(tenantId: string): Promise<PharmacyBillingSettings> {
    try {
      const setting = await this.prisma.tenantSetting.findUnique({
        where: {
          tenantId_key: { tenantId, key: PHARMACY_BILLING_SETTING_KEY },
        },
      });
      const value = (setting?.value ?? {}) as PharmacyBillingSettings;
      return {
        vatNumber:
          typeof value.vatNumber === "string" && value.vatNumber.trim()
            ? value.vatNumber.trim()
            : undefined,
        panNumber:
          typeof value.panNumber === "string" && value.panNumber.trim()
            ? value.panNumber.trim()
            : undefined,
      };
    } catch {
      return {};
    }
  }

  /**
   * Persist Pharmacy billing VAT/PAN settings. Uses the shared TenantSetting
   * store (no parallel settings system) under the Pharmacy-only key, so the
   * value is invisible to every other department's document renderer.
   */
  async setBillingSettings(
    tenantId: string,
    value: PharmacyBillingSettings,
    userId?: string,
  ): Promise<PharmacyBillingSettings> {
    await this.settings.set(tenantId, PHARMACY_BILLING_SETTING_KEY, value, userId);
    await this.audit.log(tenantId, userId, "TenantSetting", PHARMACY_BILLING_SETTING_KEY, "UPDATE", {
      key: PHARMACY_BILLING_SETTING_KEY,
      scope: "PHARMACY_BILLING",
      vatNumber: value.vatNumber ?? null,
      panNumber: value.panNumber ?? null,
    });
    return value;
  }

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

  async importMedicines(
    tenantId: string,
    rows: CreateMedicineDto[],
  ): Promise<{ imported: number; errors: { row: number; error: string }[] }> {
    if (!rows || rows.length === 0) {
      throw new BadRequestException("No rows to import");
    }
    const errors: { row: number; error: string }[] = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const dto = rows[i];
      try {
        if (!dto.name || !String(dto.name).trim()) {
          errors.push({ row: i + 1, error: "name is required" });
          continue;
        }
        const { tenantId: _t, ...clean } = dto as any;
        await this.prisma.medicine.create({
          data: {
            tenantId,
            ...clean,
            purchaseRate: dto.purchaseRate || 0,
            salesRate: dto.salesRate || 0,
            reorderLevel: dto.reorderLevel || 0,
            requiresPrescription: dto.requiresPrescription ?? true,
          },
        });
        imported++;
      } catch (e: any) {
        errors.push({ row: i + 1, error: e.message || "Unknown error" });
      }
    }

    return { imported, errors };
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
    const limit = Math.min(Number(params.limit) || 50, MAX_LIMIT);

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
    const { tenantId: _t, ...clean } = dto as any;
    return this.prisma.store.update({
      where: { id },
      data: { ...clean },
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
      itemType?: string;
      excludeItemType?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 50, MAX_LIMIT);

    const where: any = { tenantId };
    if (params.storeId) where.storeId = params.storeId;
    if (params.itemType) {
      const types = params.itemType
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.length) where.itemType = { in: types };
    }
    if (params.excludeItemType) {
      const types = params.excludeItemType
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.length) where.itemType = { not: { in: types } };
    }
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
      "currentStock",
      "minStock",
      "maxStock",
      "reorderLevel",
      "location",
      "expiryDate",
      "batchNumber",
      "purchaseRate",
      "salesRate",
      "isActive",
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
    if (dto.expiryDate !== undefined && dto.expiryDate !== null && dto.expiryDate !== "")
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
      let updated: any;
      if (isInflow || adjustmentInflow) {
        updated = await tx.inventoryItem.update({
          where: { id },
          data: { currentStock: { increment: quantity } },
        });
      } else {
        // Atomic claim: only succeeds if the current stock is still large
        // enough, so concurrent adjustments cannot double-spend stock.
        const claimed = await tx.inventoryItem.updateMany({
          where: { id, tenantId, currentStock: { gte: quantity } },
          data: { currentStock: { decrement: quantity } },
        });
        if (claimed.count === 0) {
          throw new ConflictException("Insufficient stock for this transaction");
        }
        updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
      }

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
    const limit = Math.min(Number(params.limit) || 50, MAX_LIMIT);

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

  /**
   * Pharmacy bill barcode. Reuses the existing invoice numbering scheme as
   * the barcode value (no second numbering system): the invoice's unique
   * `barcode` column is DB-enforced globally-unique, so two bills can never
   * collide even across tenants. Stable for the life of the bill.
   */
  private pharmacyBarcodeValue(invoiceNumber: string): string | undefined {
    return CODE128_PATTERN.test(invoiceNumber) ? invoiceNumber : undefined;
  }

  /**
   * Run a billing transaction, retrying with a fresh sequence on the rare
   * P2002 race (two concurrent sales drawing the same next number). The whole
   * transaction is retried — Postgres aborts a tx after a constraint
   * violation, so in-transaction retries are impossible (same pattern as
   * blood-bank unit numbering).
   */
  private async withInvoiceRetry<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(fn);
      } catch (err: any) {
        if (err?.code === "P2002") {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException(
      "Could not allocate a unique invoice/barcode number — please retry",
    );
  }

  /** Create the pharmacy invoice inside `tx` with its barcode value. */
  private async createPharmacyInvoice(
    tx: Prisma.TransactionClient,
    tenantId: string,
    base: Omit<Prisma.InvoiceUncheckedCreateInput, "invoiceNumber" | "barcode">,
  ): Promise<Prisma.InvoiceGetPayload<{ include: { items: true } }>> {
    const invoiceNumber = await this.nextNumber(
      tx,
      tenantId,
      "INV",
      "invoice",
      "invoiceNumber",
    );
    return tx.invoice.create({
      data: {
        ...base,
        invoiceNumber,
        barcode: this.pharmacyBarcodeValue(invoiceNumber),
      },
      include: { items: true },
    });
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

    const taxPercent = Number(dto.taxPercent ?? 0);

    // Wrap the whole dispensing (stock decrements + invoice + payment +
    // prescription status) in a single transaction so a failure mid-way rolls
    // back every change, and use atomic conditional updates to prevent two
    // concurrent dispatches from overselling the same batch.
    return this.withInvoiceRetry(async (tx) => {
      const results: any[] = [];
      const invoiceItems: any[] = [];
      let subtotal = 0;

      for (const item of dto.items) {
        const quantity = Number(item.quantity);
        if (!quantity || quantity <= 0)
          throw new BadRequestException(`Invalid quantity for ${item.medicineName}`);

        let unitPrice = Number(item.unitPrice) || 0;

        const inventoryItem = item.medicineId
          ? await tx.inventoryItem.findFirst({
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

          const updated = await tx.inventoryItem.updateMany({
            where: {
              id: inventoryItem.id,
              tenantId,
              currentStock: { gte: quantity },
            },
            data: { currentStock: currentStock - quantity },
          });
          if (updated.count === 0)
            throw new ConflictException(
              `Insufficient stock for ${item.medicineName}`
            );

          await tx.inventoryTransaction.create({
            data: {
              tenantId,
              itemId: inventoryItem.id,
              storeId: dto.storeId,
              type: "CONSUMPTION",
              quantity,
              unitPrice,
              totalValue: unitPrice ? unitPrice * quantity : undefined,
              batchNumber: item.batchNumber || inventoryItem.batchNumber || undefined,
              referenceType: "PHARMACY_SALE",
              remarks: `Dispensed to ${patient.firstName} ${patient.lastName}`,
              createdBy: userId,
            },
          });
        }

        if (!unitPrice && item.medicineId) {
          const med = await tx.medicine.findFirst({
            where: { id: item.medicineId, tenantId },
            select: { salesRate: true },
          });
          unitPrice = Number(med?.salesRate) || 0;
        }

        const gross = quantity * unitPrice;
        const taxAmount = (gross * taxPercent) / 100;
        const lineTotal = Math.round(gross + taxAmount);
        subtotal += lineTotal;

        results.push({
          medicineName: item.medicineName,
          quantity,
          unitPrice,
          total: gross,
        });

        invoiceItems.push({
          tenantId,
          serviceName: item.medicineName || inventoryItem?.name || "Medicine",
          quantity,
          rate: unitPrice,
          taxPercent: taxPercent || undefined,
          taxAmount,
          lineTotal,
          referenceType: "PRESCRIPTION_DISPENSE",
          referenceId: dto.prescriptionId,
        });
      }

      const invoiceDiscount = Math.max(
        0,
        Math.min(Number(dto.discountAmount || 0), subtotal),
      );
      const totalAmount = Math.max(0, subtotal - invoiceDiscount);

      const paidAmount =
        !dto.isCredit && dto.paymentMethod ? totalAmount : 0;
      const dueAmount = totalAmount - paidAmount;
      const status =
        dueAmount <= 0 ? "PAID" : dto.isCredit ? "PENDING" : "PARTIAL";

      const invoice = await this.createPharmacyInvoice(tx, tenantId, {
        tenantId,
        patientId: dto.patientId,
        type: "PHARMACY",
        status: status as any,
        subtotal,
        discountAmount: invoiceDiscount,
        discountReason: dto.discountReason || undefined,
        taxAmount: invoiceItems.reduce((s, i) => s + i.taxAmount, 0),
        taxPercent: taxPercent || undefined,
        totalAmount,
        paidAmount,
        dueAmount,
        isCredit: dto.isCredit || false,
        notes: dto.notes || "Pharmacy dispensing",
        createdBy: userId,
        items: { create: invoiceItems },
      });

      let paymentId: string | undefined;
      if (!dto.isCredit && dto.paymentMethod) {
        const paymentNumber = await this.nextNumber(
          tx,
          tenantId,
          "PAY",
          "payment",
          "paymentNumber",
        );
        const payment = await tx.payment.create({
          data: {
            tenantId,
            patientId: patient ? dto.patientId : undefined,
            invoiceId: invoice.id,
            paymentNumber,
            amount: totalAmount,
            method: dto.paymentMethod as any,
            status: "COMPLETED",
            referenceNumber: dto.referenceNumber,
            receivedBy: userId,
            paymentType: "INVOICE",
            notes: dto.notes || "Pharmacy dispensing payment",
          },
        });
        paymentId = payment.id;

        await tx.financialTransaction.create({
          data: {
            tenantId,
            txnNumber: await this.nextNumber(
              tx,
              tenantId,
              "FT",
              "financialTransaction",
              "txnNumber",
            ),
            type: "PAYMENT",
            direction: "CREDIT",
            amount: totalAmount,
            patientId: patient ? dto.patientId : undefined,
            invoiceId: invoice.id,
            referenceType: "payment",
            referenceId: payment.id,
            method: dto.paymentMethod as any,
            notes: `Payment ${paymentNumber} received`,
            createdBy: userId,
          },
        });
      }

      await tx.financialTransaction.create({
        data: {
          tenantId,
          txnNumber: await this.nextNumber(
            tx,
            tenantId,
            "FT",
            "financialTransaction",
            "txnNumber",
          ),
          type: "INVOICE",
          direction: "CREDIT",
          amount: totalAmount,
          patientId: dto.patientId,
          invoiceId: invoice.id,
          referenceType: "invoice",
          referenceId: invoice.id,
          notes: `Invoice ${invoice.invoiceNumber} issued`,
          createdBy: userId,
        },
      });

      if (dto.prescriptionId) {
        await tx.prescription.update({
          where: { id: dto.prescriptionId, tenantId },
          data: { status: "DISPENSED" },
        });
      }

      if (userId) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            entity: "Invoice",
            entityId: invoice.id,
            action: "CREATE",
            metadata: { source: "PHARMACY_DISPENSE", type: "PHARMACY" },
          },
        });
      }

      return {
        success: true,
        invoice,
        paymentId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        storeName: store.name,
        items: results,
        totalAmount,
        paidAmount,
        dueAmount,
        status,
        isCredit: dto.isCredit || false,
        dispensedAt: new Date(),
        dispensedBy: userId,
      };
    });
  }

  async sale(tenantId: string, dto: CreatePharmacySaleDto, userId?: string) {
    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException("At least one item is required");

    const store = await this.prisma.store.findFirst({
      where: { id: dto.storeId, tenantId },
    });
    if (!store) throw new NotFoundException("Store not found");

    let patient: { id: string; firstName: string; lastName: string; mrn?: string | null } | null = null;
    if (dto.patientId) {
      patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, tenantId },
        select: { id: true, firstName: true, lastName: true, mrn: true },
      });
      if (!patient) throw new NotFoundException("Patient not found");
    } else if (dto.customerName) {
      patient = null;
    } else {
      throw new BadRequestException(
        "Either a patient or a walk-in customer name is required",
      );
    }

    const customerLabel = patient
      ? `${patient.firstName} ${patient.lastName}`
      : dto.customerName?.trim() || "Walk-in customer";

    return this.withInvoiceRetry(async (tx) => {
      const invoiceItems: any[] = [];
      let subtotal = 0;

      for (const item of dto.items) {
        const quantity = Number(item.quantity);
        if (!quantity || quantity <= 0)
          throw new BadRequestException(
            `Invalid quantity for medicine ${item.medicineId}`,
          );

        const inventoryItem = await tx.inventoryItem.findFirst({
          where: {
            tenantId,
            storeId: dto.storeId,
            medicineId: item.medicineId,
            ...(item.batchNumber
              ? { batchNumber: item.batchNumber }
              : {}),
          },
        });
        if (!inventoryItem)
          throw new NotFoundException(
            `No stock found for medicine ${item.medicineId} in ${store.name}`,
          );

        const available = Number(inventoryItem.currentStock);
        if (available < quantity)
          throw new ConflictException(
            `Insufficient stock for ${inventoryItem.name}. Available: ${available}, Requested: ${quantity}`,
          );

        const medicine = inventoryItem.medicineId
          ? await tx.medicine.findFirst({
              where: { id: inventoryItem.medicineId, tenantId },
            })
          : null;

        const unitPrice = Number(item.unitPrice) || Number(inventoryItem.salesRate) || Number(medicine?.salesRate) || 0;
        const taxPercent = Number(item.taxPercent ?? dto.taxPercent ?? 0);
        const discountPercent = Number(item.discountPercent ?? 0);
        const gross = quantity * unitPrice;
        const discountAmount = (gross * discountPercent) / 100;
        const taxable = gross - discountAmount;
        const taxAmount = (taxable * taxPercent) / 100;
        const lineTotal = Math.round(taxable + taxAmount);

        subtotal += lineTotal;

        const updated = await tx.inventoryItem.updateMany({
          where: {
            id: inventoryItem.id,
            tenantId,
            currentStock: { gte: quantity },
          },
          data: {
            currentStock: available - quantity,
          },
        });
        if (updated.count === 0)
          throw new ConflictException(
            `Insufficient stock for ${inventoryItem.name}`,
          );

        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            itemId: inventoryItem.id,
            storeId: inventoryItem.storeId,
            type: "CONSUMPTION" as any,
            quantity,
            unitPrice,
            totalValue: unitPrice * quantity,
            batchNumber: item.batchNumber || inventoryItem.batchNumber || undefined,
            expiryDate: inventoryItem.expiryDate,
            referenceType: "PHARMACY_SALE",
            remarks: `Sold to ${customerLabel}`,
            createdBy: userId,
          },
        });

        invoiceItems.push({
          tenantId,
          serviceName: inventoryItem.name || medicine?.name || "Medicine",
          serviceCode: medicine?.sku || inventoryItem.sku || undefined,
          description: inventoryItem.batchNumber
            ? `Batch: ${inventoryItem.batchNumber}`
            : undefined,
          quantity,
          rate: unitPrice,
          discountPercent,
          discountAmount,
          taxPercent: taxPercent || undefined,
          taxAmount,
          lineTotal,
          referenceType: "PHARMACY_SALE",
          referenceId: inventoryItem.id,
        });
      }

      const invoiceDiscount = Math.max(
        0,
        Math.min(Number(dto.discountAmount || 0), subtotal),
      );
      const totalAmount = subtotal - invoiceDiscount;
      if (totalAmount < 0)
        throw new BadRequestException("Total amount cannot be negative");

      const paidAmount =
        !dto.isCredit && dto.paymentMethod ? totalAmount : 0;
      const dueAmount = totalAmount - paidAmount;
      const status =
        dueAmount <= 0 ? "PAID" : dto.isCredit ? "PENDING" : "PARTIAL";

      const invoice = await this.createPharmacyInvoice(tx, tenantId, {
        tenantId,
        patientId: patient ? dto.patientId : undefined,
        customerName: !patient ? (dto.customerName || undefined) : undefined,
        customerPhone: !patient ? (dto.customerPhone || undefined) : undefined,
        type: "PHARMACY",
        status: status as any,
        subtotal,
        discountAmount: invoiceDiscount,
        discountReason: dto.discountReason || undefined,
        taxAmount: invoiceItems.reduce((s, i) => s + i.taxAmount, 0),
        taxPercent: dto.taxPercent || undefined,
        totalAmount,
        paidAmount,
        dueAmount,
        isCredit: dto.isCredit || false,
        notes: dto.notes || "Pharmacy sale",
        createdBy: userId,
        items: { create: invoiceItems },
      });

      let paymentId: string | undefined;
      if (!dto.isCredit && dto.paymentMethod) {
        const paymentNumber = await this.nextNumber(
          tx,
          tenantId,
          "PAY",
          "payment",
          "paymentNumber",
        );
        const payment = await tx.payment.create({
          data: {
            tenantId,
            patientId: patient ? dto.patientId : undefined,
            invoiceId: invoice.id,
            paymentNumber,
            amount: totalAmount,
            method: dto.paymentMethod as any,
            status: "COMPLETED",
            referenceNumber: dto.referenceNumber,
            receivedBy: userId,
            paymentType: "INVOICE",
            notes: dto.notes || "Pharmacy sale payment",
          },
        });
        paymentId = payment.id;

        await tx.financialTransaction.create({
          data: {
            tenantId,
            txnNumber: await this.nextNumber(
              tx,
              tenantId,
              "FT",
              "financialTransaction",
              "txnNumber",
            ),
            type: "PAYMENT",
            direction: "CREDIT",
            amount: totalAmount,
            patientId: patient ? dto.patientId : undefined,
            invoiceId: invoice.id,
            referenceType: "payment",
            referenceId: payment.id,
            method: dto.paymentMethod as any,
            notes: `Payment ${paymentNumber} received`,
            createdBy: userId,
          },
        });
      }

      await tx.financialTransaction.create({
        data: {
          tenantId,
          txnNumber: await this.nextNumber(
            tx,
            tenantId,
            "FT",
            "financialTransaction",
            "txnNumber",
          ),
          type: "INVOICE",
          direction: "CREDIT",
          amount: totalAmount,
          patientId: patient ? dto.patientId : undefined,
          invoiceId: invoice.id,
          referenceType: "invoice",
          referenceId: invoice.id,
          notes: `Invoice ${invoice.invoiceNumber} issued`,
          createdBy: userId,
        },
      });

      if (dto.prescriptionId) {
        await tx.prescription.updateMany({
          where: { id: dto.prescriptionId, tenantId },
          data: { status: "DISPENSED" },
        });
      }

      if (userId) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            entity: "Invoice",
            entityId: invoice.id,
            action: "CREATE",
            metadata: { source: "PHARMACY_SALE", type: "PHARMACY" },
          },
        });
      }

      return {
        success: true,
        invoice,
        paymentId,
        payment: paymentId
          ? await tx.payment.findUnique({ where: { id: paymentId } })
          : undefined,
        patientName: customerLabel,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        storeName: store.name,
        totalAmount,
        paidAmount,
        dueAmount,
        status,
        isCredit: dto.isCredit || false,
      };
    });
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    prefix: string,
    model: "invoice" | "payment" | "financialTransaction",
    field: string,
  ): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest: any = await (tx as any)[model].findFirst({
      where: { tenantId, [field]: { startsWith: `${prefix}-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { [field]: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest[field].split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}-${ymd}-${String(seq).padStart(5, "0")}`;
  }

  // ---------- Stock Alerts ----------

  async getStockAlerts(tenantId: string) {
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    const [stockedItems, nearExpiryItems, outOfStockItems] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: {
          tenantId,
          isActive: true,
          currentStock: { gt: 0 },
          OR: [{ reorderLevel: { not: null } }, { minStock: { not: null } }],
        },
        include: { store: true, medicine: true },
        orderBy: { currentStock: "asc" },
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          tenantId,
          isActive: true,
          expiryDate: { not: null, lte: sixtyDaysFromNow },
          currentStock: { gt: 0 },
        },
        include: { store: true, medicine: true },
        orderBy: { expiryDate: "asc" },
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          tenantId,
          isActive: true,
          currentStock: { lte: 0 },
        },
        include: { store: true, medicine: true },
      }),
    ]);

    const lowStockItems = stockedItems.filter((item) => {
      const threshold = Number(item.reorderLevel ?? item.minStock);
      return Number(item.currentStock) <= threshold;
    });

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

  async listSales(
    tenantId: string,
    params: { patientId?: string; status?: string; page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { tenantId, type: "PHARMACY" };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
              mobile: true,
            },
          },
          payments: {
            select: {
              id: true,
              paymentNumber: true,
              amount: true,
              method: true,
              status: true,
              paidAt: true,
            },
          },
          items: {
            select: {
              id: true,
              serviceName: true,
              quantity: true,
              rate: true,
              lineTotal: true,
            },
          },
        },
        orderBy: { issuedDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPharmacySummary(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalMedicines,
      pendingPrescriptions,
      dispensedToday,
      lowStockCount,
      totalStockValue,
      billedToday,
      revenueToday,
    ] = await Promise.all([
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
      this.prisma.invoice.aggregate({
        where: { tenantId, type: "PHARMACY", issuedDate: { gte: todayStart } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          tenantId,
          status: "COMPLETED",
          paidAt: { gte: todayStart },
          invoice: { type: "PHARMACY" },
        },
        _sum: { amount: true },
      }),
    ]);

    const num = (v: any) => Number(v) || 0;

    // 30-day pharmacy revenue/collection trend — DB groups by timestamp, JS buckets into days
    const last30Start = new Date(now);
    last30Start.setDate(last30Start.getDate() - 29);
    last30Start.setHours(0, 0, 0, 0);
    const [trendInvoices, trendPayments] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ["issuedDate"],
        _sum: { totalAmount: true },
        where: {
          tenantId,
          type: "PHARMACY",
          issuedDate: { gte: last30Start },
          status: { not: "CANCELLED" },
        },
      }),
      this.prisma.payment.groupBy({
        by: ["paidAt"],
        _sum: { amount: true },
        where: { tenantId, paidAt: { gte: last30Start }, invoice: { type: "PHARMACY" } },
      }),
    ]);
    const trendMap: Record<string, { revenue: number; collection: number }> = {};
    for (let d = 0; d < 30; d++) {
      const day = new Date(last30Start);
      day.setDate(day.getDate() + d);
      trendMap[day.toISOString().slice(0, 10)] = { revenue: 0, collection: 0 };
    }
    for (const g of trendInvoices) {
      const key = g.issuedDate.toISOString().slice(0, 10);
      if (trendMap[key]) trendMap[key].revenue += num(g._sum.totalAmount);
    }
    for (const g of trendPayments) {
      const key = g.paidAt.toISOString().slice(0, 10);
      if (trendMap[key]) trendMap[key].collection += num(g._sum.amount);
    }
    const trend = Object.entries(trendMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, revenue: v.revenue, collection: v.collection }));

    // Top medicines billed today
    const todayInvoices = await this.prisma.invoice.findMany({
      where: { tenantId, type: "PHARMACY", issuedDate: { gte: todayStart }, status: { not: "CANCELLED" } },
      select: {
        patientId: true,
        items: { select: { serviceName: true, quantity: true, lineTotal: true } },
      },
    });
    let walkInBills = 0;
    let prescriptionBills = 0;
    for (const inv of todayInvoices) {
      if (inv.patientId) prescriptionBills += 1;
      else walkInBills += 1;
    }
    const medMap: Record<string, { revenue: number; quantity: number }> = {};
    for (const inv of todayInvoices) {
      for (const item of inv.items) {
        const name = item.serviceName || "Item";
        const m = (medMap[name] = medMap[name] || { revenue: 0, quantity: 0 });
        m.revenue += num(item.lineTotal);
        m.quantity += num(item.quantity);
      }
    }
    const topMedicines = Object.entries(medMap)
      .map(([name, v]) => ({ name, revenue: v.revenue, quantity: v.quantity }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Collection by payment method (pharmacy invoices only)
    const methodGroups = await this.prisma.payment.groupBy({
      by: ["method"],
      _sum: { amount: true },
      where: { tenantId, paidAt: { gte: last30Start }, invoice: { type: "PHARMACY" } },
    });
    const collectionByMethod: Record<string, number> = {};
    for (const g of methodGroups) collectionByMethod[g.method] = num(g._sum.amount);

    return {
      totalMedicines,
      pendingPrescriptions,
      dispensedToday,
      lowStockCount,
      totalStockValue,
      billedToday: billedToday._sum.totalAmount || 0,
      billsToday: billedToday._count || 0,
      revenueToday: revenueToday._sum.amount || 0,
      trend,
      topMedicines,
      collectionByMethod,
      walkInBillsToday: walkInBills,
      prescriptionBillsToday: prescriptionBills,
    };
  }
}
