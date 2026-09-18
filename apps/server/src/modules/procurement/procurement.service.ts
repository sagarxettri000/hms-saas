import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { buildPurchaseOrderPdf } from "./purchase-order-pdf";

export interface CreateSupplierDto {
  name: string;
  code?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  billingAddress?: string;
  shippingAddress?: string;
  panNumber?: string;
  vatNumber?: string;
  registrationNumber?: string;
  category?: string;
  paymentTerms?: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
}

export interface PurchaseOrderItemInput {
  itemName: string;
  itemCode?: string;
  medicineId?: string;
  category?: string;
  brand?: string;
  model?: string;
  specification?: string;
  hsCode?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  otherCharges?: number;
  expectedDelivery?: Date | string;
  criticality?: string;
  batchRequired?: boolean;
  expiryRequired?: boolean;
  sterilityRequired?: boolean;
  coldChainRequired?: boolean;
  temperatureRequirement?: string;
  warrantyRequired?: boolean;
  calibrationRequired?: boolean;
  installationRequired?: boolean;
  trainingRequired?: boolean;
}

export interface CreatePurchaseOrderDto {
  supplierId?: string;
  storeId?: string;
  purchaseRequestId?: string;
  poType?: "STANDARD" | "EMERGENCY" | "CONTRACT" | "BLANKET" | "SERVICE";
  expectedDate?: Date | string;
  deliveryAddress?: string;
  currency?: string;
  validityDays?: number;
  paymentTerms?: string;
  paymentMethod?: string;
  discountPercent?: number;
  taxPercent?: number;
  tdsPercent?: number;
  freight?: number;
  insurance?: number;
  otherCharges?: number;
  roundingAdjustment?: number;
  terms?: string;
  notes?: string;
  items: PurchaseOrderItemInput[];
}

export interface UpdatePurchaseOrderDto {
  supplierId?: string;
  expectedDate?: Date | string;
  deliveryAddress?: string;
  currency?: string;
  paymentTerms?: string;
  paymentMethod?: string;
  discountPercent?: number;
  taxPercent?: number;
  tdsPercent?: number;
  freight?: number;
  insurance?: number;
  otherCharges?: number;
  terms?: string;
  notes?: string;
  items?: PurchaseOrderItemInput[];
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
        { code: { contains: params.query, mode: "insensitive" } },
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

    const created = await this.prisma.purchaseRequest.create({
      data: {
        tenantId,
        requestNumber,
        departmentId: dto.departmentId,
        priority: dto.priority || "NORMAL",
        neededBy: dto.neededBy ? this.normalizeDate(dto.neededBy) : undefined,
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

    await this.audit
      .log(tenantId, userId, "PurchaseRequest", created.id, "CREATE", {
        requestNumber,
      })
      .catch((err) => this.logger.warn("audit log failed", err));

    return created;
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
      new Set(
        rows
          .map((r) => [r.requestedBy, r.approvedBy])
          .flat()
          .filter(Boolean),
      ),
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
      throw new BadRequestException(
        "Purchase request is already approved/converted",
      );
    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedBy: userId,
        approvedAt: new Date(),
        rejectedBy: null,
        rejectedAt: null,
      },
    });
    await this.audit.log(tenantId, userId, "PurchaseRequest", id, "APPROVE", {
      requestNumber: pr.requestNumber,
    });
    return updated;
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
      throw new BadRequestException(
        "Approved/converted requests cannot be rejected",
      );
    const updated = await this.prisma.purchaseRequest.update({
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
    await this.audit.log(tenantId, userId, "PurchaseRequest", id, "REJECT", {
      requestNumber: pr.requestNumber,
      reason,
    });
    return updated;
  }

  async convertPurchaseRequestToPO(
    tenantId: string,
    id: string,
    dto: {
      supplierId?: string;
      storeId?: string;
      expectedDate?: Date | string;
      deliveryAddress?: string;
      paymentTerms?: string;
      paymentMethod?: string;
      validityDays?: number;
      discountPercent?: number;
      taxPercent?: number;
      tdsPercent?: number;
      freight?: number;
      insurance?: number;
      otherCharges?: number;
      terms?: string;
      notes?: string;
    },
    userId?: string,
  ) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!pr) throw new NotFoundException("Purchase request not found");
    if (pr.status !== "APPROVED")
      throw new BadRequestException(
        "Only approved purchase requests can be converted to a purchase order",
      );
    if (!pr.items || pr.items.length === 0)
      throw new BadRequestException("Purchase request has no items");

    const poNumber = await this.generateNumber(
      tenantId,
      "PO",
      "purchaseOrder",
      "poNumber",
    );

    const itemInputs: PurchaseOrderItemInput[] = pr.items.map((item: any) => ({
      itemName: item.itemName,
      medicineId: item.medicineId,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: Number(item.estimatedPrice) || 0,
    }));

    const header = this.computePurchaseOrderTotals({
      ...dto,
      items: itemInputs,
    });

    const po = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
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
          paymentTerms: dto.paymentTerms,
          paymentMethod: dto.paymentMethod as any,
          validityDays: dto.validityDays,
          discountPercent:
            dto.discountPercent != null ? dto.discountPercent : undefined,
          taxPercent: dto.taxPercent != null ? dto.taxPercent : undefined,
          tdsPercent: dto.tdsPercent != null ? dto.tdsPercent : undefined,
          subtotal: header.subtotal,
          discountAmount: header.discountAmount,
          taxableAmount: header.taxableAmount,
          taxAmount: header.taxAmount,
          tdsAmount: header.tdsAmount,
          freightAmount: header.freightAmount,
          insuranceAmount: header.insuranceAmount,
          otherCharges: header.otherCharges,
          grandTotal: header.grandTotal,
          totalAmount: header.grandTotal,
          terms: dto.terms,
          notes: dto.notes,
          createdBy: userId,
          items: {
            create: itemInputs.map((item) => {
              const line = this.computeLineTotals(item, dto);
              return {
                itemName: item.itemName,
                medicineId: item.medicineId,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                discountAmount: line.discountAmount,
                taxableAmount: line.taxableAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                totalPrice: line.lineTotal,
              };
            }),
          },
        },
        include: {
          items: true,
          supplier: true,
          store: true,
          purchaseRequest: true,
        },
      });

      await tx.purchaseRequest.update({
        where: { id },
        data: { status: "CONVERTED" },
      });

      return created;
    });

    await this.audit.log(tenantId, userId, "PurchaseOrder", po.id, "CONVERT", {
      poNumber,
      sourceRequest: pr.requestNumber,
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

    const header = this.computePurchaseOrderTotals(dto);
    const poNumber = await this.generateNumber(
      tenantId,
      "PO",
      "purchaseOrder",
      "poNumber",
    );

    const po = await this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        poNumber,
        supplierId: dto.supplierId,
        purchaseRequestId: dto.purchaseRequestId,
        storeId: dto.storeId,
        poType: dto.poType || "STANDARD",
        expectedDate: dto.expectedDate
          ? this.normalizeDate(dto.expectedDate)
          : undefined,
        deliveryAddress: dto.deliveryAddress,
        currency: dto.currency || "NPR",
        validityDays: dto.validityDays,
        paymentTerms: dto.paymentTerms,
        paymentMethod: dto.paymentMethod as any,
        discountPercent:
          dto.discountPercent != null ? dto.discountPercent : undefined,
        taxPercent: dto.taxPercent != null ? dto.taxPercent : undefined,
        tdsPercent: dto.tdsPercent != null ? dto.tdsPercent : undefined,
        subtotal: header.subtotal,
        discountAmount: header.discountAmount,
        taxableAmount: header.taxableAmount,
        taxAmount: header.taxAmount,
        tdsAmount: header.tdsAmount,
        freightAmount: header.freightAmount,
        insuranceAmount: header.insuranceAmount,
        otherCharges: header.otherCharges,
        roundingAdjustment: dto.roundingAdjustment,
        grandTotal: header.grandTotal,
        totalAmount: header.grandTotal,
        terms: dto.terms,
        notes: dto.notes,
        createdBy: userId,
        items: {
          create: dto.items.map((item) => {
            const line = this.computeLineTotals(item, dto);
            return {
              itemName: item.itemName,
              itemCode: item.itemCode,
              medicineId: item.medicineId,
              category: item.category,
              brand: item.brand,
              model: item.model,
              specification: item.specification,
              hsCode: item.hsCode,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              discountPercent:
                line.discountPercent != null ? line.discountPercent : undefined,
              discountAmount: line.discountAmount,
              taxableAmount: line.taxableAmount,
              taxPercent: line.taxPercent != null ? line.taxPercent : undefined,
              taxAmount: line.taxAmount,
              otherCharges: line.otherCharges,
              lineTotal: line.lineTotal,
              totalPrice: line.lineTotal,
              expectedDelivery: item.expectedDelivery
                ? this.normalizeDate(item.expectedDelivery)
                : undefined,
              criticality: item.criticality,
              batchRequired: item.batchRequired,
              expiryRequired: item.expiryRequired,
              sterilityRequired: item.sterilityRequired,
              coldChainRequired: item.coldChainRequired,
              temperatureRequirement: item.temperatureRequirement,
              warrantyRequired: item.warrantyRequired,
              calibrationRequired: item.calibrationRequired,
              installationRequired: item.installationRequired,
              trainingRequired: item.trainingRequired,
            };
          }),
        },
      },
      include: { items: true, supplier: true, store: true },
    });

    await this.audit.log(tenantId, userId, "PurchaseOrder", po.id, "CREATE", {
      poNumber,
      grandTotal: header.grandTotal,
    });

    return po;
  }

  async updatePurchaseOrder(
    tenantId: string,
    id: string,
    dto: {
      supplierId?: string;
      expectedDate?: Date | string;
      deliveryAddress?: string;
      currency?: string;
      paymentTerms?: string;
      paymentMethod?: string;
      discountPercent?: number;
      taxPercent?: number;
      tdsPercent?: number;
      freight?: number;
      insurance?: number;
      otherCharges?: number;
      terms?: string;
      notes?: string;
      items?: PurchaseOrderItemInput[];
    },
    userId: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException("Purchase order not found");

    if (["CANCELLED", "RECEIVED"].includes(po.status))
      throw new BadRequestException(
        `A ${po.status.toLowerCase()} purchase order cannot be edited`,
      );

    const items = Array.isArray(dto.items) ? dto.items : po.items;
    const nextTotals = this.computePurchaseOrderTotals({
      ...(dto as any),
      items: items.map((raw: any) => {
        const item = raw as any;
        return {
          ...item,
          expectedDelivery: item.expectedDelivery
            ? this.normalizeDate(item.expectedDelivery)
            : undefined,
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          discountPercent:
            item.discountPercent != null ? Number(item.discountPercent) : 0,
          taxPercent: item.taxPercent != null ? Number(item.taxPercent) : 0,
        };
      }),
    });

    // revision bump for edit/audit trail
    const revision = (po.revision ?? 1) + 1;
    const header: any = { updatedBy: userId, revision };
    if (dto.supplierId !== undefined) header.supplierId = dto.supplierId;
    if (dto.expectedDate !== undefined)
      header.expectedDate = this.normalizeDate(dto.expectedDate);
    if (dto.deliveryAddress !== undefined)
      header.deliveryAddress = dto.deliveryAddress;
    if (dto.currency !== undefined) header.currency = dto.currency;
    if (dto.paymentTerms !== undefined) header.paymentTerms = dto.paymentTerms;
    if (dto.paymentMethod !== undefined)
      header.paymentMethod = dto.paymentMethod;
    if (dto.discountPercent !== undefined)
      header.discountPercent = dto.discountPercent;
    if (dto.taxPercent !== undefined) header.taxPercent = dto.taxPercent;
    if (dto.tdsPercent !== undefined) header.tdsPercent = dto.tdsPercent;
    if (dto.freight !== undefined) header.freight = dto.freight;
    if (dto.insurance !== undefined) header.insurance = dto.insurance;
    if (dto.otherCharges !== undefined) header.otherCharges = dto.otherCharges;
    if (dto.terms !== undefined) header.terms = dto.terms;
    if (dto.notes !== undefined) header.notes = dto.notes;

    header.purchaseOrderItems = {
      deleteMany: {},
      create: items.map((raw: any, idx: number) => {
        const item = raw as any;
        return {
          sn: idx + 1,
          itemName: item.itemName,
          itemCode: item.itemCode,
          medicineId: item.medicineId,
          category: item.category,
          brand: item.brand,
          model: item.model,
          specification: item.specification,
          hsCode: item.hsCode,
          quantity: Number(item.quantity) || 0,
          unit: item.unit,
          unitPrice: Number(item.unitPrice) || 0,
          discountPercent:
            item.discountPercent != null ? Number(item.discountPercent) : 0,
          discountAmount: 0,
          taxPercent: item.taxPercent != null ? Number(item.taxPercent) : 0,
          taxAmount: 0,
          otherCharges: Number(item.otherCharges) || 0,
          lineTotal: this.round2(
            Math.max(
              0,
              (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
            ),
          ),
          expectedDelivery: item.expectedDelivery
            ? this.normalizeDate(item.expectedDelivery)
            : undefined,
          criticality: item.criticality,
          batchRequired: item.batchRequired,
          expiryRequired: item.expiryRequired,
          sterilityRequired: item.sterilityRequired,
          coldChainRequired: item.coldChainRequired,
          temperatureRequirement: item.temperatureRequirement,
          warrantyRequired: item.warrantyRequired,
          calibrationRequired: item.calibrationRequired,
          installationRequired: item.installationRequired,
          trainingRequired: item.trainingRequired,
        };
      }),
    };
    header.poItems = header.purchaseOrderItems;
    delete header.poItems;

    const updated = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.purchaseOrder.update({
        where: { id },
        data: header,
        include: { items: true, supplier: true, store: true },
      });
      return fresh;
    });

    await this.audit.log(tenantId, userId, "PurchaseOrder", id, "UPDATE", {
      revision,
      poNumber: po.poNumber,
      itemCount: items.length,
    });

    return this.findPurchaseOrderById(tenantId, id);
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
        purchaseRequest: {
          select: {
            id: true,
            requestNumber: true,
            justification: true,
            priority: true,
            neededBy: true,
            departmentId: true,
            requestedBy: true,
            approvedBy: true,
            approvedAt: true,
          },
        },
      },
    });
    if (!po) throw new NotFoundException("Purchase order not found");

    const userIds = Array.from(
      new Set(
        [po.createdBy, po.updatedBy, po.approvedBy, po.vendorAcceptedBy]
          .concat(
            po.purchaseRequest
              ? [po.purchaseRequest.requestedBy, po.purchaseRequest.approvedBy]
              : [],
          )
          .filter(Boolean),
      ),
    ) as string[];

    const deptIds = po.purchaseRequest?.departmentId
      ? [po.purchaseRequest.departmentId]
      : [];

    const [users, departments] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              role: true,
            },
          })
        : Promise.resolve([]),
      deptIds.length
        ? this.prisma.department.findMany({
            where: { tenantId, id: { in: deptIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u as any]));
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    const purchaseRequest = po.purchaseRequest
      ? {
          ...po.purchaseRequest,
          department:
            deptMap.get(po.purchaseRequest.departmentId as string) || null,
          requestedBy: po.purchaseRequest.requestedBy
            ? userMap.get(po.purchaseRequest.requestedBy) || null
            : null,
          approvedBy: po.purchaseRequest.approvedBy
            ? userMap.get(po.purchaseRequest.approvedBy) || null
            : null,
        }
      : null;

    return {
      ...po,
      purchaseRequest,
      createdBy: po.createdBy ? userMap.get(po.createdBy) || null : null,
      updatedBy: po.updatedBy ? userMap.get(po.updatedBy) || null : null,
      approvedBy: po.approvedBy ? userMap.get(po.approvedBy) || null : null,
      vendorAcceptedBy: po.vendorAcceptedBy
        ? userMap.get(po.vendorAcceptedBy) || null
        : null,
    };
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

    const allowed = new Set([
      "DRAFT",
      "SENT",
      "CONFIRMED",
      "PARTIAL_RECEIVED",
      "RECEIVED",
      "INVOICED",
      "CANCELLED",
    ]);
    if (!allowed.has(status))
      throw new BadRequestException(`Invalid PO status: ${status}`);

    if (
      status === "CANCELLED" &&
      ["RECEIVED", "PARTIAL_RECEIVED"].includes(po.status)
    )
      throw new BadRequestException(
        "An order that has been (partially) received cannot be cancelled",
      );

    const data: any = { status: status as any, updatedBy: userId };
    if (status === "CONFIRMED") {
      data.approvedAt = new Date();
      data.approvedBy = userId;
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data,
    });

    await this.audit.log(tenantId, userId, "PurchaseOrder", po.id, "STATUS", {
      from: po.status,
      to: status,
    });

    return updated;
  }

  async acceptVendorOrder(tenantId: string, id: string, userId?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    if (po.vendorAcceptedAt)
      throw new BadRequestException("Vendor acceptance already recorded");
    if (po.status === "CANCELLED")
      throw new BadRequestException("A cancelled order cannot be accepted");

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        vendorAcceptedBy: userId,
        vendorAcceptedAt: new Date(),
        status: po.status === "DRAFT" ? "SENT" : po.status,
        updatedBy: userId,
      },
    });

    await this.audit.log(tenantId, userId, "PurchaseOrder", po.id, "APPROVE", {
      event: "vendor-acceptance",
    });

    return updated;
  }

  // ---------- Purchase Order PDF ----------

  async generatePurchaseOrderPdf(
    tenantId: string,
    id: string,
    userId?: string,
  ) {
    const order = await this.findPurchaseOrderById(tenantId, id);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, middleName: true, lastName: true },
        })
      : null;
    const generatedBy = user
      ? [user.firstName, user.middleName, user.lastName]
          .filter(Boolean)
          .join(" ")
      : undefined;

    await this.audit.log(tenantId, userId, "PurchaseOrder", order.id, "PRINT", {
      action: "PDF",
      format: "purchase-order",
    });

    const buffer = buildPurchaseOrderPdf(
      order as any,
      (tenant as any)
        ? { ...(tenant as any), logoUrl: (tenant as any).logoUrl || undefined }
        : null,
      generatedBy,
    );
    return { buffer, filename: `${order.poNumber}.pdf` };
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

    return this.prisma
      .$transaction(async (tx) => {
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
      })
      .then((receipt: any) => {
        this.audit
          .log(tenantId, userId, "GoodsReceipt", receipt.id, "CREATE", {
            grnNumber: receipt.grnNumber,
            purchaseOrderId: dto.purchaseOrderId || undefined,
          })
          .catch((err) => this.logger.warn("audit log failed", err));
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
      store: r.storeId
        ? { id: r.storeId, name: storeMap.get(r.storeId) }
        : null,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private computeLineTotals(
    item: PurchaseOrderItemInput,
    header: { discountPercent?: number; taxPercent?: number },
  ) {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const discountPercent =
      item.discountPercent != null
        ? Number(item.discountPercent)
        : header.discountPercent != null
          ? Number(header.discountPercent)
          : 0;
    const taxPercent =
      item.taxPercent != null
        ? Number(item.taxPercent)
        : header.taxPercent != null
          ? Number(header.taxPercent)
          : 0;

    const gross = this.round2(quantity * unitPrice);
    const discountAmount = this.round2((gross * discountPercent) / 100);
    const taxableAmount = this.round2(gross - discountAmount);
    const taxAmount = this.round2((taxableAmount * taxPercent) / 100);
    const otherCharges = item.otherCharges
      ? this.round2(Number(item.otherCharges))
      : 0;
    const lineTotal = this.round2(taxableAmount + taxAmount + otherCharges);

    return {
      gross,
      discountPercent,
      discountAmount,
      taxableAmount,
      taxPercent,
      taxAmount,
      otherCharges,
      lineTotal,
    };
  }

  private computePurchaseOrderTotals(dto: CreatePurchaseOrderDto) {
    let subtotal = 0;
    let discountAmount = 0;
    let taxableAmount = 0;
    let taxAmount = 0;

    for (const item of dto.items) {
      const line = this.computeLineTotals(item, dto);
      subtotal = this.round2(subtotal + line.gross);
      discountAmount = this.round2(discountAmount + line.discountAmount);
      taxableAmount = this.round2(taxableAmount + line.taxableAmount);
      taxAmount = this.round2(taxAmount + line.taxAmount);
    }

    const tdsAmount = this.round2(
      (taxableAmount * (dto.tdsPercent ? Number(dto.tdsPercent) : 0)) / 100,
    );
    const freightAmount = dto.freight ? this.round2(Number(dto.freight)) : 0;
    const insuranceAmount = dto.insurance
      ? this.round2(Number(dto.insurance))
      : 0;
    const otherCharges = dto.otherCharges
      ? this.round2(Number(dto.otherCharges))
      : 0;

    const grandTotal = this.round2(
      taxableAmount +
        taxAmount -
        tdsAmount +
        freightAmount +
        insuranceAmount +
        otherCharges,
    );

    return {
      subtotal,
      discountAmount,
      taxableAmount,
      taxAmount,
      tdsAmount,
      freightAmount,
      insuranceAmount,
      otherCharges,
      grandTotal,
    };
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
