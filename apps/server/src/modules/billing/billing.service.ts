import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { buildInvoicePdf, buildReceiptPdf } from "./invoice-pdf";

const MAX_LIMIT = 100;

export interface InvoiceItemDto {
  serviceName: string;
  serviceCode?: string;
  serviceId?: string;
  description?: string;
  quantity?: number;
  rate?: number;
  discountPercent?: number;
  taxPercent?: number;
  doctorId?: string;
  departmentId?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface CreateInvoiceDto {
  patientId: string;
  admissionId?: string;
  encounterId?: string;
  type?: string;
  schemeId?: string;
  taxPercent?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountReason?: string;
  isCredit?: boolean;
  dueDate?: Date | string;
  notes?: string;
  items: InvoiceItemDto[];
}

export interface CreatePaymentDto {
  patientId?: string;
  invoiceId: string;
  amount: number;
  method?: string;
  referenceNumber?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface CreateRefundDto {
  patientId?: string;
  invoiceId?: string;
  paymentId?: string;
  amount: number;
  reason: string;
  refundMethod?: string;
}

export interface CreateDepositDto {
  patientId: string;
  admissionId?: string;
  type?: string;
  amount: number;
  method?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface CreateBillingServiceDto {
  code: string;
  name: string;
  shortName?: string;
  categoryId?: string;
  category?: string;
  departmentId?: string;
  description?: string;
  serviceType?: string;
  unit?: string;
  price: number;
  taxPercent?: number;
  insuranceRate?: number;
  patientRate?: number;
  corporateRate?: number;
  emergencyRate?: number;
  nightRate?: number;
  weekendRate?: number;
  isActive?: boolean;
  taxable?: boolean;
  requiresDoctor?: boolean;
  requiresDepartment?: boolean;
  requiresQuantity?: boolean;
  requiresApproval?: boolean;
  isPackageService?: boolean;
  isRoomCharge?: boolean;
  isPharmacyItem?: boolean;
  isConsumable?: boolean;
  isInventoryItem?: boolean;
  displayOrder?: number;
}

export interface UpdateBillingServiceDto {
  name?: string;
  shortName?: string;
  categoryId?: string;
  category?: string;
  departmentId?: string;
  description?: string;
  serviceType?: string;
  unit?: string;
  price?: number;
  taxPercent?: number;
  insuranceRate?: number;
  patientRate?: number;
  corporateRate?: number;
  emergencyRate?: number;
  nightRate?: number;
  weekendRate?: number;
  isActive?: boolean;
  taxable?: boolean;
  requiresDoctor?: boolean;
  requiresDepartment?: boolean;
  requiresQuantity?: boolean;
  requiresApproval?: boolean;
  isPackageService?: boolean;
  isRoomCharge?: boolean;
  isPharmacyItem?: boolean;
  isConsumable?: boolean;
  isInventoryItem?: boolean;
  displayOrder?: number;
}

export interface BillingServiceSearchParams {
  category?: string;
  categoryId?: string;
  search?: string;
  isActive?: string;
  page?: number;
  limit?: number;
}

export interface CreateServiceCategoryDto {
  name: string;
  code: string;
  description?: string;
  displayOrder?: number;
}

export interface UpdateServiceCategoryDto {
  name?: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface ServiceCategorySearchParams {
  search?: string;
  isActive?: string;
  page?: number;
  limit?: number;
}

export interface CloseDayDto {
  closeDate?: string;
  actualCash?: number;
  notes?: string;
  reconcile?: boolean;
}

export interface BillingSummaryParams {
  from?: string;
  to?: string;
}

export interface InvoiceSearchParams {
  patientId?: string;
  status?: string;
  type?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaymentSearchParams {
  patientId?: string;
  invoiceId?: string;
  status?: string;
  method?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Invoices ----------

  private validateMoney(
    value: any,
    options: { min?: number; max?: number; required?: boolean; label: string },
  ) {
    const n = Number(value);
    if (!Number.isFinite(n))
      throw new BadRequestException(`${options.label} must be a valid number`);
    if (
      options.required !== false &&
      (value === undefined || value === null || value === "")
    ) {
      throw new BadRequestException(`${options.label} is required`);
    }
    if (options.min !== undefined && n < options.min)
      throw new BadRequestException(
        `${options.label} must be >= ${options.min}`,
      );
    if (options.max !== undefined && n > options.max)
      throw new BadRequestException(
        `${options.label} must be <= ${options.max}`,
      );
    return n;
  }

  async createInvoice(
    tenantId: string,
    dto: CreateInvoiceDto,
    userId?: string,
  ) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException("At least one invoice item required");

    const [catalog, settings] = await Promise.all([
      this.prisma.billingService.findMany({
        where: { tenantId, isActive: true },
      }),
      this.getBillingSettings(tenantId),
    ]);
    const taxConfig = settings.taxConfig as any;
    const defaultTax = Number(taxConfig?.defaultTaxPercent || 0);
    const rounding = settings.rounding as any;
    const roundEnabled = !!rounding?.enabled;

    let scheme: any = null;
    if (dto.schemeId) {
      scheme = await this.prisma.billingScheme.findFirst({
        where: { id: dto.schemeId, tenantId, isActive: true },
      });
      if (!scheme)
        throw new NotFoundException("Billing scheme not found or inactive");
    }

    const catalogMap = new Map(catalog.map((s) => [s.id, s] as const));
    for (const s of catalog) catalogMap.set(s.code, s);

    const items = dto.items.map((item) => {
      const quantity = this.validateMoney(item.quantity ?? 1, {
        min: 0.01,
        label: "Item quantity",
      });
      let rate = this.validateMoney(item.rate ?? 0, {
        min: 0,
        label: `Item rate (${item.serviceName || item.serviceCode || "service"})`,
      });
      let serviceName = item.serviceName;
      let taxPercent = Number(item.taxPercent ?? dto.taxPercent ?? defaultTax);

      const catalogItem = item.serviceId
        ? catalogMap.get(item.serviceId)
        : item.serviceCode
          ? catalogMap.get(item.serviceCode)
          : undefined;

      if (catalogItem) {
        rate = rate || Number(catalogItem.price);
        if (!serviceName) serviceName = catalogItem.name;
        if (item.taxPercent === undefined || item.taxPercent === null) {
          taxPercent = Number(catalogItem.taxPercent) || defaultTax;
        }
      }
      if (!serviceName)
        throw new BadRequestException(
          `Item ${item.serviceCode || ""} requires a service name`,
        );

      taxPercent = this.validateMoney(taxPercent, {
        min: 0,
        max: 100,
        label: "Tax percent",
      });
      const discountPercent = this.validateMoney(item.discountPercent ?? 0, {
        min: 0,
        max: 100,
        label: "Item discount percent",
      });
      const gross = quantity * rate;
      const discountAmount = (gross * discountPercent) / 100;
      const taxable = gross - discountAmount;
      const taxAmount = (taxable * taxPercent) / 100;
      let lineTotal = taxable + taxAmount;
      if (roundEnabled) lineTotal = Math.round(lineTotal);

      return {
        tenantId,
        serviceName,
        serviceCode: catalogItem?.code || item.serviceCode,
        serviceId: catalogItem?.id || item.serviceId,
        description: item.description,
        quantity,
        rate,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        lineTotal,
        doctorId: item.doctorId,
        departmentId: catalogItem?.departmentId || item.departmentId,
        referenceType: item.referenceType,
        referenceId: item.referenceId,
      };
    });

    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    let invoiceDiscount = this.validateMoney(dto.discountAmount ?? 0, {
      min: 0,
      max: subtotal,
      label: "Invoice discount",
    });
    let discountReason = dto.discountReason;
    if (scheme && Number(scheme.discountPercent) > 0 && !dto.discountAmount) {
      invoiceDiscount = Math.round((subtotal * Number(scheme.discountPercent)) / 100);
      discountReason =
        discountReason || `Scheme: ${scheme.name} (${scheme.discountPercent}%)`;
    }
    const taxAmount = items.reduce((sum, i) => sum + i.taxAmount, 0);
    const totalAmount = subtotal - invoiceDiscount;
    if (totalAmount < 0)
      throw new BadRequestException("Total amount cannot be negative");

    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId,
          invoiceNumber,
          patientId: dto.patientId,
          admissionId: dto.admissionId,
          encounterId: dto.encounterId,
          type: (dto.type || "OPD") as any,
          subtotal,
          discountAmount: invoiceDiscount,
          discountPercent: dto.discountPercent ?? (scheme ? Number(scheme.discountPercent) : undefined),
          discountReason,
          discountApprovedBy: invoiceDiscount ? userId : undefined,
          discountStatus: invoiceDiscount ? "APPROVED" : undefined,
          schemeId: scheme?.id,
          taxAmount,
          taxPercent: dto.taxPercent,
          totalAmount,
          paidAmount: 0,
          dueAmount: totalAmount,
          isCredit: dto.isCredit || false,
          dueDate: dto.dueDate ? this.normalizeDate(dto.dueDate) : undefined,
          notes: dto.notes,
          createdBy: userId,
          items: { create: items },
        },
        include: { items: true },
      });

      if (dto.isCredit) {
        await this.addCreditBalance(tx, tenantId, dto.patientId, totalAmount);
      }

      await this.recordFinancialTransaction(tx, tenantId, {
        type: "INVOICE",
        direction: "CREDIT",
        amount: totalAmount,
        patientId: dto.patientId,
        invoiceId: created.id,
        referenceType: "invoice",
        referenceId: created.id,
        notes: `Invoice ${invoiceNumber} issued`,
        createdBy: userId,
      });

      return created;
    });

    await this.logAudit(tenantId, userId, "CREATE", "Invoice", invoice.id);

    this.prisma.user.findMany({
      where: { tenantId, role: { in: ["RECEPTIONIST", "FINANCE_MANAGER"] as any } },
      select: { id: true },
    }).then((staff) => {
      for (const s of staff) {
        this.notifications.create(tenantId, {
          userId: s.id,
          title: "New Invoice Issued",
          body: `Invoice ${invoice.invoiceNumber} for Rs. ${invoice.totalAmount} has been issued`,
          type: "INVOICE_CREATED",
          referenceType: "Invoice",
          referenceId: invoice.id,
        }).catch(() => {});
      }
    }).catch(() => {});

    return invoice;
  }

  async findInvoices(tenantId: string, params: InvoiceSearchParams) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    await this.refreshOverdueStatus(tenantId);

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.search) {
      where.OR = [
        { invoiceNumber: { contains: params.search, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { firstName: { contains: params.search, mode: "insensitive" } },
              { lastName: { contains: params.search, mode: "insensitive" } },
              { mrn: { contains: params.search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }
    if (params.from || params.to) {
      where.issuedDate = {};
      if (params.from) where.issuedDate.gte = this.normalizeDate(params.from);
      if (params.to) {
        const to = this.normalizeDate(params.to);
        to.setHours(23, 59, 59, 999);
        where.issuedDate.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          items: true,
        },
        orderBy: { issuedDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findPayments(tenantId: string, params: PaymentSearchParams) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.invoiceId) where.invoiceId = params.invoiceId;
    if (params.status) where.status = params.status;
    if (params.method) where.method = params.method;
    if (params.search) {
      where.OR = [
        { paymentNumber: { contains: params.search, mode: "insensitive" } },
        { referenceNumber: { contains: params.search, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { firstName: { contains: params.search, mode: "insensitive" } },
              { lastName: { contains: params.search, mode: "insensitive" } },
              { mrn: { contains: params.search, mode: "insensitive" } },
            ],
          },
        },
        {
          invoice: {
            invoiceNumber: { contains: params.search, mode: "insensitive" },
          },
        },
      ];
    }
    if (params.from || params.to) {
      where.paidAt = {};
      if (params.from) where.paidAt.gte = this.normalizeDate(params.from);
      if (params.to) {
        const to = this.normalizeDate(params.to);
        to.setHours(23, 59, 59, 999);
        where.paidAt.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          invoice: {
            select: { id: true, invoiceNumber: true, totalAmount: true },
          },
        },
        orderBy: { paidAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findInvoiceById(tenantId: string, id: string) {
    await this.refreshOverdueStatus(tenantId, id);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
            phone: true,
            email: true,
            gender: true,
            dateOfBirth: true,
          },
        },
        admission: true,
        items: true,
        payments: { orderBy: { paidAt: "desc" } },
        refunds: { orderBy: { createdAt: "desc" } },
        deposits: true,
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  async refreshOverdueStatus(tenantId: string, invoiceId?: string) {
    if (!tenantId) return { updated: 0 };
    const where: any = {
      tenantId,
      status: { in: ["PENDING", "PARTIAL"] },
      dueDate: { lt: new Date() },
    };
    if (invoiceId) where.id = invoiceId;
    const overdue = await this.prisma.invoice.updateMany({
      where,
      data: { status: "OVERDUE" },
    });
    return { updated: overdue.count };
  }

  async applyDiscount(
    tenantId: string,
    id: string,
    dto: { amount: number; reason?: string },
    userId?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (Number(invoice.paidAmount) > 0)
      throw new ConflictException("Cannot discount an invoice with payments");

    const discountAmount = this.validateMoney(dto.amount, {
      min: 0,
      max: Number(invoice.totalAmount),
      label: "Discount amount",
    });
    if (discountAmount <= 0)
      throw new BadRequestException("Discount amount must be greater than zero");

    const settings = await this.getBillingSettings(tenantId);
    const approval = (settings.discountApproval as any) || {
      requireApprovalAbove: 0,
    };
    const threshold = Number(approval.requireApprovalAbove) || 0;
    const requiresApproval = discountAmount > threshold;

    if (requiresApproval) {
      const updated = await this.prisma.invoice.update({
        where: { id },
        data: {
          discountAmount,
          discountReason: dto.reason,
          discountApprovedBy: undefined,
          discountStatus: "PENDING_APPROVAL",
          discountRequestedBy: userId,
          discountRequestedAt: new Date(),
        },
      });
      await this.logAudit(tenantId, userId, "UPDATE", "Invoice", id, {
        action: "DISCOUNT_REQUESTED",
        amount: discountAmount,
        requiresApproval: true,
      });
      return {
        ...updated,
        message: `Discount of ${discountAmount} requires approval. Pending approval.`,
      };
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        discountAmount,
        discountReason: dto.reason,
        discountApprovedBy: userId,
        discountApprovedAt: new Date(),
        discountStatus: "APPROVED",
        totalAmount: Number(invoice.subtotal) - discountAmount,
        dueAmount: Number(invoice.subtotal) - discountAmount,
      },
    });

    await this.logAudit(tenantId, userId, "UPDATE", "Invoice", id, {
      action: "DISCOUNT_APPLIED",
      amount: discountAmount,
      requiresApproval: false,
    });
    return updated;
  }

  async approveDiscount(
    tenantId: string,
    id: string,
    dto: { approve: boolean; reason?: string },
    userId?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.discountStatus !== "PENDING_APPROVAL")
      throw new ConflictException("Invoice has no pending discount approval");
    if (Number(invoice.paidAmount) > 0)
      throw new ConflictException("Cannot discount an invoice with payments");

    if (dto.approve) {
      const updated = await this.prisma.invoice.update({
        where: { id },
        data: {
          discountStatus: "APPROVED",
          discountApprovedBy: userId,
          discountApprovedAt: new Date(),
          totalAmount: Number(invoice.subtotal) - Number(invoice.discountAmount),
          dueAmount: Number(invoice.subtotal) - Number(invoice.discountAmount),
        },
      });
      await this.logAudit(tenantId, userId, "APPROVE", "Invoice", id, {
        action: "DISCOUNT_APPROVED",
        amount: Number(invoice.discountAmount),
      });
      return updated;
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        discountStatus: "REJECTED",
        discountRejectedBy: userId,
        discountRejectedAt: new Date(),
        discountRejectReason: dto.reason,
      },
    });
    await this.logAudit(tenantId, userId, "REJECT", "Invoice", id, {
      action: "DISCOUNT_REJECTED",
      amount: Number(invoice.discountAmount),
      reason: dto.reason,
    });
    return updated;
  }

  async cancelInvoice(
    tenantId: string,
    id: string,
    reason: string,
    userId?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (Number(invoice.paidAmount) > 0)
      throw new ConflictException("Cannot cancel an invoice with payments");
    const depositApplied = await this.prisma.deposit.findFirst({
      where: { tenantId, invoiceId: id },
    });
    if (depositApplied)
      throw new ConflictException(
        "Cannot cancel an invoice with applied deposits",
      );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (invoice.isCredit) {
        await this.addCreditBalance(
          tx,
          tenantId,
          invoice.patientId,
          -invoice.totalAmount,
        );
      }
      await this.recordFinancialTransaction(tx, tenantId, {
        type: "INVOICE",
        direction: "DEBIT",
        amount: Number(invoice.totalAmount),
        patientId: invoice.patientId,
        invoiceId: id,
        referenceType: "invoice",
        referenceId: id,
        notes: `Invoice ${invoice.invoiceNumber} cancelled`,
        createdBy: userId,
      });
      return tx.invoice.update({
        where: { id },
        data: { status: "CANCELLED", notes: reason },
      });
    });
    await this.logAudit(tenantId, userId, "UPDATE", "Invoice", id, {
      action: "CANCELLED",
      reason,
    });
    return updated;
  }

  // ---------- Payments ----------

  async createPayment(
    tenantId: string,
    dto: CreatePaymentDto,
    userId?: string,
  ) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    const amount = this.validateMoney(dto.amount, {
      min: 0.01,
      label: "Payment amount",
    });

    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (existing) return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: dto.invoiceId, tenantId },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.status === "CANCELLED")
        throw new ConflictException("Invoice is cancelled");

      const remaining = Number(invoice.dueAmount);
      if (amount > remaining) {
        throw new BadRequestException(
          `Payment exceeds due amount (${remaining})`,
        );
      }

      try {
        const paymentNumber = await this.generateNumber(
          tenantId,
          "PAY",
          "payment",
          "paymentNumber",
        );

        const payment = await tx.payment.create({
          data: {
            tenantId,
            patientId: invoice.patientId,
            invoiceId: invoice.id,
            paymentNumber,
            amount,
            method: (dto.method || "CASH") as any,
            status: "COMPLETED",
            referenceNumber: dto.referenceNumber,
            receivedBy: userId,
            notes: dto.notes,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        const paidAmount = Number(invoice.paidAmount) + amount;
        const dueAmount = Number(invoice.totalAmount) - paidAmount;
        const status = dueAmount <= 0 ? "PAID" : "PARTIAL";

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount,
            dueAmount,
            status: status as any,
            settledBy: dueAmount <= 0 ? userId : undefined,
            settledAt: dueAmount <= 0 ? new Date() : undefined,
          },
        });

        if (invoice.isCredit) {
          await this.addCreditBalance(tx, tenantId, invoice.patientId, -amount);
        }

        await this.recordFinancialTransaction(tx, tenantId, {
          type: "PAYMENT",
          direction: "CREDIT",
          amount,
          patientId: invoice.patientId,
          invoiceId: invoice.id,
          referenceType: "payment",
          referenceId: payment.id,
          method: (dto.method || "CASH") as any,
          notes: `Payment ${paymentNumber} received`,
          createdBy: userId,
        });

        this.prisma.user.findMany({
          where: { tenantId, role: { in: ["RECEPTIONIST", "FINANCE_MANAGER"] as any } },
          select: { id: true },
        }).then((staff) => {
          for (const s of staff) {
            this.notifications.create(tenantId, {
              userId: s.id,
              title: "Payment Received",
              body: `Payment of Rs. ${amount} received for invoice ${invoice.invoiceNumber}`,
              type: "PAYMENT_RECEIVED",
              referenceType: "Payment",
              referenceId: payment.id,
            }).catch(() => {});
          }
        }).catch(() => {});

        return payment;
      } catch (err: any) {
        if (
          err?.code === "P2002" &&
          dto.idempotencyKey &&
          String(err?.meta?.target ?? "").includes("idempotencyKey")
        ) {
          const existing = await tx.payment.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId,
                idempotencyKey: dto.idempotencyKey,
              },
            },
          });
          if (existing) return existing;
        }
        throw err;
      }
    });
  }

  // ---------- Refunds ----------

  async createRefund(tenantId: string, dto: CreateRefundDto, userId?: string) {
    const amount = this.validateMoney(dto.amount, {
      min: 0.01,
      label: "Refund amount",
    });
    if (!dto.patientId && !dto.paymentId && !dto.invoiceId)
      throw new BadRequestException(
        "Refund requires a patient, payment, or invoice",
      );

    const payment = dto.paymentId
      ? await this.prisma.payment.findFirst({
          where: { id: dto.paymentId, tenantId },
        })
      : undefined;
    if (dto.paymentId && !payment)
      throw new NotFoundException("Payment not found");

    const invoice = dto.invoiceId
      ? await this.prisma.invoice.findFirst({
          where: { id: dto.invoiceId, tenantId },
        })
      : undefined;
    if (dto.invoiceId && !invoice)
      throw new NotFoundException("Invoice not found");

    const patientId =
      payment?.patientId || invoice?.patientId || dto.patientId!;
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    const resolvedPatientId = patient.id;

    if (payment || invoice) {
      const refundable = await this.getRefundableAmount(
        tenantId,
        payment?.id,
        invoice?.id,
      );
      if (amount > refundable)
        throw new BadRequestException(
          `Refund amount exceeds refundable amount (${refundable})`,
        );
    }

    const refundNumber = await this.generateNumber(
      tenantId,
      "REF",
      "refund",
      "refundNumber",
    );

    const refund = await this.prisma.refund.create({
      data: {
        tenantId,
        patientId: resolvedPatientId,
        invoiceId: invoice?.id || dto.invoiceId,
        paymentId: payment?.id || dto.paymentId,
        refundNumber,
        amount,
        reason: dto.reason,
        refundMethod: (dto.refundMethod || "CASH") as any,
        requestedBy: userId,
      },
    });

    await this.logAudit(tenantId, userId, "CREATE", "Refund", refund.id);
    return refund;
  }

  async approveRefund(tenantId: string, id: string, userId?: string) {
    const refund = await this.prisma.refund.findFirst({
      where: { id, tenantId },
    });
    if (!refund) throw new NotFoundException("Refund not found");
    if (refund.status !== "REQUESTED")
      throw new ConflictException("Refund is not in requested state");

    const refundable = await this.getRefundableAmount(
      tenantId,
      refund.paymentId,
      refund.invoiceId,
    );
    if (Number(refund.amount) > refundable) {
      throw new BadRequestException(
        `Refund exceeds refundable amount (${refundable})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.refund.update({
        where: { id },
        data: {
          status: "COMPLETED",
          approvedBy: userId,
          approvedAt: new Date(),
          processedBy: userId,
          refundedAt: new Date(),
        },
      });

      if (refund.invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: refund.invoiceId },
        });
        if (invoice && Number(invoice.paidAmount) >= Number(refund.amount)) {
          const paidAmount = Number(invoice.paidAmount) - Number(refund.amount);
          const dueAmount = Number(invoice.totalAmount) - paidAmount;
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              paidAmount,
              dueAmount,
              status:
                dueAmount <= 0
                  ? paidAmount > 0
                    ? "PARTIAL"
                    : "PENDING"
                  : "PARTIAL",
            },
          });
        }
      }

      if (refund.paymentId) {
        const payment = await tx.payment.findUnique({
          where: { id: refund.paymentId },
        });
        if (payment) {
          const refundedTotal = (
            await tx.refund.findMany({
              where: { paymentId: refund.paymentId, status: "COMPLETED" },
              select: { amount: true },
            })
          ).reduce((sum, r) => sum + Number(r.amount), 0);
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status:
                refundedTotal >= Number(payment.amount)
                  ? "REFUNDED"
                  : "PARTIAL",
            },
          });
        }
      }

      await this.recordFinancialTransaction(tx, tenantId, {
        type: "REFUND",
        direction: "DEBIT",
        amount: Number(refund.amount),
        patientId: refund.patientId,
        invoiceId: refund.invoiceId || undefined,
        referenceType: "refund",
        referenceId: refund.id,
        method: refund.refundMethod as any,
        notes: `Refund ${refund.refundNumber} completed`,
        createdBy: userId,
      });

      return updated;
    });
  }

  private async getRefundableAmount(
    tenantId: string,
    paymentId?: string | null,
    invoiceId?: string | null,
  ): Promise<number> {
    if (paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: { id: paymentId, tenantId },
        include: { refunds: true },
      });
      if (!payment) return 0;
      const refunded = payment.refunds
        .filter((r) => r.status === "COMPLETED")
        .reduce((sum, r) => sum + Number(r.amount), 0);
      return Math.max(0, Number(payment.amount) - refunded);
    }
    if (invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { refunds: true },
      });
      if (!invoice) return 0;
      const refunded = invoice.refunds
        .filter((r) => r.status === "COMPLETED")
        .reduce((sum, r) => sum + Number(r.amount), 0);
      return Math.max(0, Number(invoice.paidAmount) - refunded);
    }
    return 0;
  }

  // ---------- Deposits ----------

  async createDeposit(
    tenantId: string,
    dto: CreateDepositDto,
    userId?: string,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    const amount = this.validateMoney(dto.amount, {
      min: 0.01,
      label: "Deposit amount",
    });

    const depositNumber = await this.generateNumber(
      tenantId,
      "DPT",
      "deposit",
      "depositNumber",
    );

    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          admissionId: dto.admissionId,
          depositNumber,
          type: (dto.type || "GENERAL") as any,
          amount,
          balance: amount,
          method: (dto.method || "CASH") as any,
          referenceNumber: dto.referenceNumber,
          receivedBy: userId,
          notes: dto.notes,
        },
      });

      await tx.depositTransaction.create({
        data: {
          tenantId,
          depositId: deposit.id,
          type: "RECEIVED",
          amount,
          balanceAfter: amount,
          createdBy: userId,
          notes: `Deposit ${depositNumber} received`,
        },
      });

      await this.recordFinancialTransaction(tx, tenantId, {
        type: "DEPOSIT",
        direction: "CREDIT",
        amount,
        patientId: dto.patientId,
        referenceType: "deposit",
        referenceId: deposit.id,
        method: (dto.method || "CASH") as any,
        notes: `Deposit ${depositNumber} received`,
        createdBy: userId,
      });

      return deposit;
    });
  }

  async applyDepositToInvoice(
    tenantId: string,
    depositId: string,
    invoiceId: string,
    amount: number,
    userId?: string,
  ) {
    const deposit = await this.prisma.deposit.findFirst({
      where: { id: depositId, tenantId },
    });
    if (!deposit) throw new NotFoundException("Deposit not found");
    const applyAmount = this.validateMoney(amount, {
      min: 0.01,
      label: "Applied amount",
    });
    if (Number(deposit.balance) < applyAmount)
      throw new ConflictException("Insufficient deposit balance");

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.patientId !== deposit.patientId)
      throw new BadRequestException("Deposit belongs to a different patient");
    if (invoice.status === "CANCELLED")
      throw new ConflictException("Invoice is cancelled");
    const remainingDue = Number(invoice.dueAmount);
    if (applyAmount > remainingDue)
      throw new BadRequestException(
        `Application exceeds invoice due amount (${remainingDue})`,
      );

    return this.prisma.$transaction(async (tx) => {
      const newBalance = Number(deposit.balance) - applyAmount;
      const depositUpdate = await tx.deposit.updateMany({
        where: { id: depositId, balance: { gte: applyAmount } },
        data: {
          balance: newBalance,
          invoiceId,
          status: newBalance <= 0 ? "USED" : "PARTIAL",
        },
      });
      if (depositUpdate.count === 0) {
        throw new ConflictException(
          "Insufficient deposit balance (concurrent application)",
        );
      }

      await tx.depositTransaction.create({
        data: {
          tenantId,
          depositId,
          type: "APPLIED",
          amount: applyAmount,
          balanceAfter: newBalance,
          invoiceId,
          createdBy: userId,
          notes: `Applied to invoice ${invoice.invoiceNumber}`,
        },
      });

      const paymentNumber = await this.generateNumber(
        tenantId,
        "PAY",
        "payment",
        "paymentNumber",
      );
      const payment = await tx.payment.create({
        data: {
          tenantId,
          patientId: deposit.patientId,
          invoiceId,
          paymentNumber,
          amount: applyAmount,
          method: deposit.method,
          status: "COMPLETED",
          receivedBy: userId,
          paymentType: "DEPOSIT",
        },
      });

      const paidAmount = Number(invoice.paidAmount) + applyAmount;
      const dueAmount = Number(invoice.totalAmount) - paidAmount;
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount,
          dueAmount,
          status: (dueAmount <= 0 ? "PAID" : "PARTIAL") as any,
          settledBy: dueAmount <= 0 ? userId : undefined,
          settledAt: dueAmount <= 0 ? new Date() : undefined,
        },
      });

      if (invoice.isCredit) {
        await this.addCreditBalance(
          tx,
          tenantId,
          deposit.patientId,
          -applyAmount,
        );
      }

      await this.recordFinancialTransaction(tx, tenantId, {
        type: "PAYMENT",
        direction: "CREDIT",
        amount: applyAmount,
        patientId: deposit.patientId,
        invoiceId,
        referenceType: "payment",
        referenceId: payment.id,
        method: deposit.method,
        notes: `Deposit applied to invoice ${invoice.invoiceNumber}`,
        createdBy: userId,
      });

      return payment;
    });
  }

  async getPatientDeposits(tenantId: string, patientId: string) {
    return this.prisma.deposit.findMany({
      where: { tenantId, patientId },
      orderBy: { receivedAt: "desc" },
    });
  }

  async getDepositTransactions(tenantId: string, depositId: string) {
    const deposit = await this.prisma.deposit.findFirst({
      where: { id: depositId, tenantId },
    });
    if (!deposit) throw new NotFoundException("Deposit not found");
    return this.prisma.depositTransaction.findMany({
      where: { tenantId, depositId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findDeposits(tenantId: string, params: any) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);
    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { depositNumber: { contains: params.search, mode: "insensitive" } },
        { referenceNumber: { contains: params.search, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { firstName: { contains: params.search, mode: "insensitive" } },
              { lastName: { contains: params.search, mode: "insensitive" } },
              { mrn: { contains: params.search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.deposit.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
        },
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deposit.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findRefunds(tenantId: string, params: any) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);
    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { refundNumber: { contains: params.search, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { firstName: { contains: params.search, mode: "insensitive" } },
              { lastName: { contains: params.search, mode: "insensitive" } },
              { mrn: { contains: params.search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          invoice: { select: { id: true, invoiceNumber: true } },
          payment: { select: { id: true, paymentNumber: true, amount: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.refund.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ---------- Credit ----------

  async getCreditAccounts(tenantId: string) {
    return this.prisma.creditAccount.findMany({
      where: { tenantId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
      },
      orderBy: { outstanding: "desc" },
    });
  }

  async getPatientCredit(tenantId: string, patientId: string) {
    return this.prisma.creditAccount.findFirst({
      where: { tenantId, patientId },
      include: { patient: true },
    });
  }

  async settleCredit(tenantId: string, id: string, userId?: string) {
    const account = await this.prisma.creditAccount.findFirst({
      where: { id, tenantId },
    });
    if (!account) throw new NotFoundException("Credit account not found");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.creditAccount.update({
        where: { id },
        data: { outstanding: 0, status: "SETTLED" },
      });

      const patientId = account.patientId;
      const amount = Number(account.outstanding);
      if (amount > 0) {
        const paymentNumber = await this.generateNumber(
          tenantId,
          "PAY",
          "payment",
          "paymentNumber",
        );
        const payment = await tx.payment.create({
          data: {
            tenantId,
            patientId,
            paymentNumber,
            amount,
            method: "OTHER" as any,
            status: "COMPLETED",
            paymentType: "ADJUSTMENT",
            receivedBy: userId,
            notes: "Credit settlement",
          },
        });
        await this.recordFinancialTransaction(tx, tenantId, {
          type: "PAYMENT",
          direction: "CREDIT",
          amount,
          patientId,
          referenceType: "payment",
          referenceId: payment.id,
          method: "OTHER",
          notes: "Credit settlement",
          createdBy: userId,
        });
      }

      return updated;
    });
  }

  private async addCreditBalance(
    tx: any,
    tenantId: string,
    patientId: string,
    delta: number,
  ) {
    const existing = await tx.creditAccount.findFirst({
      where: { tenantId, patientId },
    });
    if (!existing) {
      if (delta > 0) {
        await tx.creditAccount.create({
          data: { tenantId, patientId, outstanding: delta },
        });
      }
      return;
    }
    const outstanding = Number(existing.outstanding) + delta;
    await tx.creditAccount.update({
      where: { id: existing.id },
      data: {
        outstanding,
        status: outstanding <= 0 ? "SETTLED" : "OPEN",
      },
    });
  }

  // ---------- Billing Services (Catalog) ----------

  async createBillingService(
    tenantId: string,
    dto: CreateBillingServiceDto,
    userId?: string,
  ) {
    const existing = await this.prisma.billingService.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) throw new ConflictException("Service code already exists");

    const price = this.validateMoney(dto.price, {
      min: 0,
      label: "Service price",
    });
    const taxPercent = this.validateMoney(dto.taxPercent ?? 0, {
      min: 0,
      max: 100,
      label: "Service tax percent",
    });

    const data: any = {
      tenantId,
      code: dto.code,
      name: dto.name,
      shortName: dto.shortName,
      categoryId: dto.categoryId,
      departmentId: dto.departmentId,
      description: dto.description,
      serviceType: (dto.serviceType || "PER_UNIT") as any,
      unit: dto.unit,
      price,
      taxPercent,
      isActive: dto.isActive ?? true,
      taxable: dto.taxable ?? true,
      requiresDoctor: dto.requiresDoctor ?? false,
      requiresDepartment: dto.requiresDepartment ?? false,
      requiresQuantity: dto.requiresQuantity ?? true,
      requiresApproval: dto.requiresApproval ?? false,
      isPackageService: dto.isPackageService ?? false,
      isRoomCharge: dto.isRoomCharge ?? false,
      isPharmacyItem: dto.isPharmacyItem ?? false,
      isConsumable: dto.isConsumable ?? false,
      isInventoryItem: dto.isInventoryItem ?? false,
      displayOrder: dto.displayOrder ?? 0,
      createdBy: userId,
    };

    if (dto.insuranceRate !== undefined)
      data.insuranceRate = dto.insuranceRate;
    if (dto.patientRate !== undefined)
      data.patientRate = dto.patientRate;
    if (dto.corporateRate !== undefined)
      data.corporateRate = dto.corporateRate;
    if (dto.emergencyRate !== undefined)
      data.emergencyRate = dto.emergencyRate;
    if (dto.nightRate !== undefined)
      data.nightRate = dto.nightRate;
    if (dto.weekendRate !== undefined)
      data.weekendRate = dto.weekendRate;

    return this.prisma.billingService.create({ data });
  }

  async updateBillingService(
    tenantId: string,
    id: string,
    dto: UpdateBillingServiceDto,
    userId?: string,
  ) {
    const existing = await this.prisma.billingService.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Billing service not found");

    const allowedFields = [
      "name",
      "shortName",
      "categoryId",
      "category",
      "departmentId",
      "description",
      "serviceType",
      "unit",
      "insuranceRate",
      "patientRate",
      "corporateRate",
      "emergencyRate",
      "nightRate",
      "weekendRate",
      "isActive",
      "taxable",
      "requiresDoctor",
      "requiresDepartment",
      "requiresQuantity",
      "requiresApproval",
      "isPackageService",
      "isRoomCharge",
      "isPharmacyItem",
      "isConsumable",
      "isInventoryItem",
      "displayOrder",
    ];
    const data: any = { updatedAt: new Date() };
    for (const field of allowedFields) {
      if (dto[field as keyof UpdateBillingServiceDto] !== undefined) {
        data[field] = dto[field as keyof UpdateBillingServiceDto];
      }
    }
    if (dto.price !== undefined) {
      data.price = this.validateMoney(dto.price, {
        min: 0,
        label: "Service price",
      });
    }
    if (dto.taxPercent !== undefined) {
      data.taxPercent = this.validateMoney(dto.taxPercent, {
        min: 0,
        max: 100,
        label: "Service tax percent",
      });
    }

    const updated = await this.prisma.billingService.update({
      where: { id },
      data,
    });
    await this.logAudit(tenantId, userId, "UPDATE", "BillingService", id);
    return updated;
  }

  async findBillingServices(
    tenantId: string,
    params: BillingServiceSearchParams,
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { tenantId };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.category) where.categoryId = params.category;
    if (params.isActive !== undefined) {
      where.isActive = params.isActive === "true";
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { code: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.billingService.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ categoryId: "asc" }, { displayOrder: "asc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.billingService.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findBillingServiceById(tenantId: string, id: string) {
    const service = await this.prisma.billingService.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException("Billing service not found");
    return service;
  }

  // ---------- Service Categories ----------

  async findServiceCategories(
    tenantId: string,
    params: ServiceCategorySearchParams,
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { tenantId };
    if (params.isActive !== undefined) {
      where.isActive = params.isActive === "true";
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { code: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.serviceCategory.findMany({
        where,
        include: { _count: { select: { services: true } } },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.serviceCategory.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createServiceCategory(
    tenantId: string,
    dto: CreateServiceCategoryDto,
    userId?: string,
  ) {
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Category name is required");
    if (!dto.code || !String(dto.code).trim())
      throw new BadRequestException("Category code is required");

    const existing = await this.prisma.serviceCategory.findFirst({
      where: { tenantId, code: dto.code.trim() },
    });
    if (existing)
      throw new ConflictException("Service category code already exists");

    const category = await this.prisma.serviceCategory.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        code: dto.code.trim(),
        description: dto.description,
        displayOrder: dto.displayOrder ?? 0,
      },
    });

    await this.logAudit(
      tenantId,
      userId,
      "CREATE",
      "ServiceCategory",
      category.id,
    );
    return category;
  }

  async updateServiceCategory(
    tenantId: string,
    id: string,
    dto: UpdateServiceCategoryDto,
    userId?: string,
  ) {
    const existing = await this.prisma.serviceCategory.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      throw new NotFoundException("Service category not found");

    if (dto.name !== undefined && (!dto.name || !String(dto.name).trim()))
      throw new BadRequestException("Category name cannot be empty");

    const data: any = {
      name: dto.name,
      description: dto.description,
      displayOrder: dto.displayOrder,
      isActive: dto.isActive,
      updatedAt: new Date(),
    };

    const updated = await this.prisma.serviceCategory.update({
      where: { id },
      data,
    });
    await this.logAudit(
      tenantId,
      userId,
      "UPDATE",
      "ServiceCategory",
      id,
    );
    return updated;
  }

  async findServiceCategoryById(tenantId: string, id: string) {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id, tenantId },
      include: { services: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } },
    });
    if (!category)
      throw new NotFoundException("Service category not found");
    return category;
  }

  // ---------- Billing Settings ----------

  async getBillingSettings(tenantId: string) {
    const rows = await this.prisma.billingSetting.findMany({
      where: { tenantId },
    });
    const defaults: Record<string, any> = {
      taxConfig: { defaultTaxPercent: 0 },
      invoiceNumbering: { prefix: "INV", padding: 5 },
      receiptBranding: {
        showLogo: false,
        showTaxId: false,
        footer: "Thank you for choosing our hospital.",
      },
      rounding: { enabled: false },
      payments: { allowPartial: true, allowOverpayment: false },
      discountApproval: { requireApprovalAbove: 0 },
    };
    for (const row of rows) {
      defaults[row.key] = row.value;
    }
    return defaults;
  }

  async updateBillingSetting(
    tenantId: string,
    key: string,
    value: any,
    userId?: string,
  ) {
    if (!key) throw new BadRequestException("Setting key is required");
    const allowed = [
      "taxConfig",
      "invoiceNumbering",
      "receiptBranding",
      "rounding",
      "payments",
      "discountApproval",
    ];
    if (!allowed.includes(key))
      throw new BadRequestException(`Unknown billing setting: ${key}`);

    const setting = await this.prisma.billingSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { value, updatedBy: userId },
      create: { tenantId, key, value, updatedBy: userId },
    });
    await this.logAudit(tenantId, userId, "UPDATE", "BillingSetting", key);
    return setting;
  }

  // ---------- Billing Schemes ----------

  async createBillingScheme(
    tenantId: string,
    dto: { name: string; code?: string; description?: string; discountPercent?: number; rules?: any; isActive?: boolean },
    userId?: string,
  ) {
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Scheme name is required");
    const existing = await this.prisma.billingScheme.findFirst({
      where: { tenantId, name: dto.name },
    });
    if (existing)
      throw new ConflictException("Scheme name already exists");

    const discountPercent = this.validateMoney(dto.discountPercent ?? 0, {
      min: 0,
      max: 100,
      label: "Scheme discount percent",
    });

    const scheme = await this.prisma.billingScheme.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        code: dto.code || undefined,
        description: dto.description,
        discountPercent,
        rules: dto.rules,
        isActive: dto.isActive ?? true,
        createdBy: userId,
      },
    });
    await this.logAudit(tenantId, userId, "CREATE", "BillingScheme", scheme.id);
    return scheme;
  }

  async updateBillingScheme(
    tenantId: string,
    id: string,
    dto: { name?: string; code?: string; description?: string; discountPercent?: number; rules?: any; isActive?: boolean },
    userId?: string,
  ) {
    const existing = await this.prisma.billingScheme.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Billing scheme not found");

    // Whitelist updatable fields to prevent mass-assignment of protected
    // attributes (e.g. tenantId) from a caller-controlled body.
    const data: any = {
      name: dto.name,
      code: dto.code,
      description: dto.description,
      rules: dto.rules,
      isActive: dto.isActive,
      updatedAt: new Date(),
    };
    if (dto.discountPercent !== undefined) {
      data.discountPercent = this.validateMoney(dto.discountPercent, {
        min: 0,
        max: 100,
        label: "Scheme discount percent",
      });
    }

    const updated = await this.prisma.billingScheme.update({
      where: { id },
      data,
    });
    await this.logAudit(tenantId, userId, "UPDATE", "BillingScheme", id);
    return updated;
  }

  async findBillingSchemes(tenantId: string, params: { search?: string; isActive?: string; page?: number; limit?: number }) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);
    const where: any = { tenantId };
    if (params.isActive !== undefined) where.isActive = params.isActive === "true";
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { code: { contains: params.search, mode: "insensitive" } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.billingScheme.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.billingScheme.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findBillingSchemeById(tenantId: string, id: string) {
    const scheme = await this.prisma.billingScheme.findFirst({
      where: { id, tenantId },
    });
    if (!scheme) throw new NotFoundException("Billing scheme not found");
    return scheme;
  }

  async removeBillingScheme(tenantId: string, id: string, userId?: string) {
    const scheme = await this.prisma.billingScheme.findFirst({
      where: { id, tenantId },
    });
    if (!scheme) throw new NotFoundException("Billing scheme not found");
    await this.prisma.billingScheme.delete({ where: { id } });
    await this.logAudit(tenantId, userId, "DELETE", "BillingScheme", id);
    return { success: true };
  }

  // ---------- Deposit Refund ----------

  async refundDeposit(
    tenantId: string,
    depositId: string,
    dto: { amount: number; reason: string; refundMethod?: string; referenceNumber?: string; notes?: string },
    userId?: string,
  ) {
    const deposit = await this.prisma.deposit.findFirst({
      where: { id: depositId, tenantId },
    });
    if (!deposit) throw new NotFoundException("Deposit not found");

    const refundAmount = this.validateMoney(dto.amount, {
      min: 0.01,
      label: "Refund amount",
    });
    if (refundAmount > Number(deposit.balance))
      throw new BadRequestException(
        `Refund exceeds refundable deposit balance (${Number(deposit.balance)})`,
      );
    if (!dto.reason || !String(dto.reason).trim())
      throw new BadRequestException("Refund reason is required");

    return this.prisma.$transaction(async (tx) => {
      const newBalance = Number(deposit.balance) - refundAmount;
      await tx.deposit.update({
        where: { id: depositId },
        data: {
          balance: newBalance,
          status: (newBalance <= 0 ? "REFUNDED" : "PARTIAL") as any,
        },
      });

      await tx.depositTransaction.create({
        data: {
          tenantId,
          depositId,
          type: "REFUNDED",
          amount: refundAmount,
          balanceAfter: newBalance,
          notes: dto.reason,
          createdBy: userId,
        },
      });

      const refundNumber = await this.generateNumber(
        tenantId,
        "REF",
        "refund",
        "refundNumber",
      );
      const refund = await tx.refund.create({
        data: {
          tenantId,
          patientId: deposit.patientId,
          refundNumber,
          amount: refundAmount,
          reason: dto.reason,
          status: "COMPLETED",
          requestedBy: userId,
          approvedBy: userId,
          approvedAt: new Date(),
          refundMethod: (dto.refundMethod || "CASH") as any,
          refundedAt: new Date(),
          processedBy: userId,
          notes: dto.notes,
        },
      });

      await this.recordFinancialTransaction(tx, tenantId, {
        type: "REFUND",
        direction: "DEBIT",
        amount: refundAmount,
        patientId: deposit.patientId,
        referenceType: "deposit",
        referenceId: depositId,
        method: (dto.refundMethod || "CASH") as any,
        notes: `Deposit ${deposit.depositNumber} refunded: ${dto.reason}`,
        createdBy: userId,
      });

      return { refund, depositBalance: newBalance };
    });
  }

  // ---------- Receipt Reprint ----------

  async reprintInvoice(tenantId: string, id: string, userId?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { printCount: { increment: 1 } },
    });
    await this.logAudit(tenantId, userId, "PRINT", "Invoice", id, {
      action: "REPRINT",
      printCount: updated.printCount,
    });
    return {
      invoiceNumber: invoice.invoiceNumber,
      printCount: updated.printCount,
    };
  }

  async generateInvoicePdf(tenantId: string, id: string, userId?: string) {
    const invoice = await this.findInvoiceById(tenantId, id);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true, addressLine1: true, addressLine2: true,
        city: true, district: true, province: true, country: true,
        phone: true, email: true,
      },
    });
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, middleName: true, lastName: true },
        })
      : null;
    const generatedBy = user
      ? [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
      : undefined;

    await this.prisma.invoice.update({
      where: { id },
      data: { printCount: { increment: 1 } },
    });
    await this.logAudit(tenantId, userId, "PRINT", "Invoice", id, {
      action: "PDF",
      format: "invoice",
    });

    const buffer = buildInvoicePdf(invoice as any, tenant as any, generatedBy);
    const filename = `${invoice.invoiceNumber}.pdf`;
    return { buffer, filename };
  }

  async generateReceiptPdf(
    tenantId: string,
    invoiceId: string,
    paymentId?: string,
    userId?: string,
  ) {
    const invoice = await this.findInvoiceById(tenantId, invoiceId);
    const payment = paymentId
      ? invoice.payments.find((p: any) => p.id === paymentId)
      : invoice.payments[0];
    if (!payment) throw new NotFoundException("No payment found for this invoice");

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true, addressLine1: true, addressLine2: true,
        city: true, district: true, province: true, country: true,
        phone: true, email: true,
      },
    });
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, middleName: true, lastName: true },
        })
      : null;
    const generatedBy = user
      ? [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
      : undefined;

    await this.logAudit(tenantId, userId, "PRINT", "Payment", payment.id, {
      action: "RECEIPT",
      format: "receipt",
    });

    const buffer = buildReceiptPdf(invoice as any, payment as any, tenant as any, generatedBy);
    const filename = `${payment.paymentNumber}.pdf`;
    return { buffer, filename };
  }

  // ---------- Financial Transactions ----------

  async findFinancialTransactions(
    tenantId: string,
    params: {
      type?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { tenantId };
    if (params.type) where.type = params.type;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = this.normalizeDate(params.from);
      if (params.to) {
        const to = this.normalizeDate(params.to);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.financialTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ---------- Daily Closing ----------

  async closeDay(tenantId: string, dto: CloseDayDto, userId?: string) {
    const closeDate = dto.closeDate
      ? this.normalizeDate(dto.closeDate)
      : new Date();
    closeDate.setHours(0, 0, 0, 0);
    const actualCash =
      dto.actualCash === undefined || dto.actualCash === null
        ? undefined
        : this.validateMoney(dto.actualCash, {
            min: 0,
            label: "Actual cash",
          });

    const start = new Date(closeDate);
    const end = new Date(closeDate);
    end.setHours(23, 59, 59, 999);

    const [invoices, payments, refunds, deposits] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          issuedDate: { gte: start, lte: end },
          status: { not: "CANCELLED" },
        },
        select: { totalAmount: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: { tenantId, paidAt: { gte: start, lte: end } },
        select: { amount: true, method: true },
      }),
      this.prisma.refund.findMany({
        where: {
          tenantId,
          refundedAt: { gte: start, lte: end },
          status: "COMPLETED",
        },
        select: { amount: true, refundMethod: true },
      }),
      this.prisma.deposit.findMany({
        where: { tenantId, receivedAt: { gte: start, lte: end } },
        select: { amount: true, method: true },
      }),
    ]);

    const totalSales = invoices.reduce(
      (sum, i) => sum + Number(i.totalAmount),
      0,
    );
    const totalCollections = payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const cashCollected = payments
      .filter((p) => p.method === "CASH")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const cardCollected = payments
      .filter((p) => p.method === "CARD")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const bankCollected = payments
      .filter((p) => p.method === "BANK")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const onlineCollected = payments
      .filter((p) => p.method === "ONLINE" || p.method === "WALLET")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const refundsTotal = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const cashRefunds = refunds
      .filter((r) => r.refundMethod === "CASH")
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const depositsReceived = deposits.reduce(
      (sum, d) => sum + Number(d.amount),
      0,
    );
    const cashDeposits = deposits
      .filter((d) => d.method === "CASH")
      .reduce((sum, d) => sum + Number(d.amount), 0);

    const expectedCash = cashCollected + cashDeposits - cashRefunds;
    const difference =
      actualCash !== undefined ? actualCash - expectedCash : null;

    const existing = await this.prisma.dailyClosing.findUnique({
      where: { tenantId_closeDate: { tenantId, closeDate } },
      select: { id: true, status: true },
    });
    if (existing) {
      if (dto.reconcile !== true) {
        throw new ConflictException(
          "This day is already closed. Pass reconcile: true to re-close with new figures.",
        );
      }
      if (actualCash === undefined) {
        throw new BadRequestException(
          "Reconciliation requires the actual cash count.",
        );
      }
    }

    const closing = await this.prisma.dailyClosing.upsert({
      where: { tenantId_closeDate: { tenantId, closeDate } },
      update: {
        totalSales,
        totalCollections,
        cashCollected,
        cardCollected,
        bankCollected,
        onlineCollected,
        refunds: refundsTotal,
        cashRefunds,
        depositsReceived,
        cashDeposits,
        expectedCash,
        actualCash,
        difference,
        status: "CLOSED",
        notes: dto.notes,
        closedBy: userId,
        closedAt: new Date(),
        isReconciliation: existing ? true : false,
      },
      create: {
        tenantId,
        closeDate,
        totalSales,
        totalCollections,
        cashCollected,
        cardCollected,
        bankCollected,
        onlineCollected,
        refunds: refundsTotal,
        cashRefunds,
        depositsReceived,
        cashDeposits,
        expectedCash,
        actualCash,
        difference,
        status: "CLOSED",
        notes: dto.notes,
        closedBy: userId,
      },
    });

    await this.logAudit(tenantId, userId, "CREATE", "DailyClosing", closing.id);
    return closing;
  }

  async findDailyClosings(
    tenantId: string,
    params: { from?: string; to?: string },
  ) {
    const where: any = { tenantId };
    if (params.from || params.to) {
      where.closeDate = {};
      if (params.from) where.closeDate.gte = this.normalizeDate(params.from);
      if (params.to) {
        const to = this.normalizeDate(params.to);
        to.setHours(23, 59, 59, 999);
        where.closeDate.lte = to;
      }
    }
    return this.prisma.dailyClosing.findMany({
      where,
      orderBy: { closeDate: "desc" },
    });
  }

  // ---------- Summary ----------

  async getBillingSummary(tenantId: string, params: BillingSummaryParams) {
    const where: any = { tenantId };
    const payWhere: any = { tenantId };
    if (params.from || params.to) {
      where.issuedDate = {};
      payWhere.paidAt = {};
      if (params.from) {
        where.issuedDate.gte = this.normalizeDate(params.from);
        payWhere.paidAt.gte = this.normalizeDate(params.from);
      }
      if (params.to) {
        const to = this.normalizeDate(params.to);
        to.setHours(23, 59, 59, 999);
        where.issuedDate.lte = to;
        payWhere.paidAt.lte = to;
      }
    }

    const [invoices, payments, refunds, deposits, overdueCount] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: { ...where, status: { not: "CANCELLED" } },
          select: { totalAmount: true, status: true },
        }),
        this.prisma.payment.findMany({
          where: payWhere,
          select: { amount: true, method: true },
        }),
        this.prisma.refund.findMany({
          where: { ...payWhere, status: "COMPLETED" },
          select: { amount: true },
        }),
        this.prisma.deposit.count({ where: payWhere }),
        this.prisma.invoice.count({
          where: { tenantId, status: "OVERDUE" },
        }),
      ]);

    const billed = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const refundsTotal = refunds.reduce((s, r) => s + Number(r.amount), 0);
    const collected =
      payments.reduce((s, p) => s + Number(p.amount), 0) - refundsTotal;
    const pending = billed - collected;
    const outstandingByMethod = payments.reduce(
      (acc: Record<string, number>, p) => {
        acc[p.method] = (acc[p.method] || 0) + Number(p.amount);
        return acc;
      },
      {},
    );

    return {
      billed,
      collected,
      pending: Math.max(pending, 0),
      paidInvoices: invoices.filter((i) => i.status === "PAID").length,
      partialInvoices: invoices.filter((i) => i.status === "PARTIAL").length,
      pendingInvoices: invoices.filter((i) => i.status === "PENDING").length,
      overdueInvoices: overdueCount,
      refundCount: refunds.length,
      refundTotal: refundsTotal,
      depositCount: deposits,
      outstandingByMethod,
    };
  }

  async getBillingAnalytics(tenantId: string) {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30Start = new Date(dayStart);
    last30Start.setDate(last30Start.getDate() - 29);

    const n = (v: unknown): number => Number(v ?? 0);

    // Today's rollups + grouped breakdowns (all DB-side aggregation)
    const [todayInvSum, todayBills, todayPaid, todayCredit, todayOutstanding, typeGroup, methodGroup, todayPaySum, refundsSum, depositsSum] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          _sum: { totalAmount: true },
          where: { tenantId, issuedDate: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
        }),
        this.prisma.invoice.count({
          where: { tenantId, issuedDate: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
        }),
        this.prisma.invoice.count({
          where: { tenantId, issuedDate: { gte: dayStart, lt: dayEnd }, status: "PAID" },
        }),
        this.prisma.invoice.count({
          where: { tenantId, issuedDate: { gte: dayStart, lt: dayEnd }, OR: [{ isCredit: true }, { status: "PARTIAL" }] },
        }),
        this.prisma.invoice.aggregate({
          _sum: { dueAmount: true },
          where: { tenantId, issuedDate: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
        }),
        this.prisma.invoice.groupBy({
          by: ["type"],
          _sum: { totalAmount: true },
          where: { tenantId, issuedDate: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
        }),
        this.prisma.payment.groupBy({
          by: ["method"],
          _sum: { amount: true },
          where: { tenantId, paidAt: { gte: dayStart, lt: dayEnd } },
        }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { tenantId, paidAt: { gte: dayStart, lt: dayEnd } },
        }),
        this.prisma.refund.aggregate({
          _sum: { amount: true },
          where: { tenantId, refundedAt: { gte: dayStart, lt: dayEnd }, status: "COMPLETED" },
        }),
        this.prisma.deposit.aggregate({
          _sum: { amount: true },
          where: { tenantId, receivedAt: { gte: dayStart, lt: dayEnd } },
        }),
      ]);

    const byType: Record<string, number> = {};
    for (const g of typeGroup) byType[g.type] = n(g._sum.totalAmount);
    const byMethod: Record<string, number> = {};
    for (const g of methodGroup) byMethod[g.method] = n(g._sum.amount);

    const todayRefundsTotal = n(refundsSum._sum.amount);
    const todayRevenue = n(todayInvSum._sum.totalAmount);
    const todayCollection = n(todayPaySum._sum.amount) - todayRefundsTotal;
    const todayDepositsTotal = n(depositsSum._sum.amount);

    // Month rollups
    const [monthInvAgg, monthPayAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: { tenantId, issuedDate: { gte: monthStart }, status: { not: "CANCELLED" } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { tenantId, paidAt: { gte: monthStart } },
      }),
    ]);

    // 30-day trend — DB groups by timestamp, JS buckets into days (small, bounded)
    const [trendInvoices, trendPayments] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ["issuedDate"],
        _sum: { totalAmount: true },
        where: { tenantId, issuedDate: { gte: last30Start }, status: { not: "CANCELLED" } },
      }),
      this.prisma.payment.groupBy({
        by: ["paidAt"],
        _sum: { amount: true },
        where: { tenantId, paidAt: { gte: last30Start } },
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
      if (trendMap[key]) trendMap[key].revenue += n(g._sum.totalAmount);
    }
    for (const g of trendPayments) {
      const key = g.paidAt.toISOString().slice(0, 10);
      if (trendMap[key]) trendMap[key].collection += n(g._sum.amount);
    }

    // Doctor-wise income — DB group by doctorId (all time, aggregated server-side)
    const doctorGroup = await this.prisma.invoiceItem.groupBy({
      by: ["doctorId"],
      _sum: { lineTotal: true },
      where: { tenantId, doctorId: { not: null } },
    });
    const doctorIncome: Record<string, number> = {};
    for (const g of doctorGroup) if (g.doctorId) doctorIncome[g.doctorId] = n(g._sum.lineTotal);

    // User-wise collection — DB group by receivedBy + method, composited in JS
    const userGroup = await this.prisma.payment.groupBy({
      by: ["receivedBy", "method"],
      _sum: { amount: true },
      where: { tenantId, receivedBy: { not: null } },
    });
    const METHOD_KEYS = ["CASH", "CARD", "BANK", "ONLINE"];
    const userCollection: Record<string, { total: number; CASH: number; CARD: number; BANK: number; ONLINE: number }> = {};
    for (const g of userGroup) {
      if (!g.receivedBy) continue;
      const u = (userCollection[g.receivedBy] = userCollection[g.receivedBy] || { total: 0, CASH: 0, CARD: 0, BANK: 0, ONLINE: 0 });
      const amt = n(g._sum.amount);
      u.total += amt;
      if (METHOD_KEYS.includes(g.method)) (u as any)[g.method] += amt;
    }

    return {
      today: {
        revenue: todayRevenue,
        collection: todayCollection,
        bills: todayBills,
        paidBills: todayPaid,
        creditBills: todayCredit,
        outstanding: n(todayOutstanding._sum.dueAmount),
        refunds: todayRefundsTotal,
        deposits: todayDepositsTotal,
        revenueByType: byType,
        collectionByMethod: byMethod,
      },
      month: {
        revenue: n(monthInvAgg._sum.totalAmount),
        collection: n(monthPayAgg._sum.amount),
      },
      trend: Object.entries(trendMap)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      doctorIncome,
      userCollection,
    };
  }

  private async recordFinancialTransaction(
    tx: any,
    tenantId: string,
    data: {
      type: string;
      direction: string;
      amount: number;
      patientId?: string;
      invoiceId?: string;
      referenceType?: string;
      referenceId?: string;
      method?: string;
      notes?: string;
      createdBy?: string;
    },
  ) {
    const txnNumber = await this.generateNumber(
      tenantId,
      "FT",
      "financialTransaction",
      "txnNumber",
    );
    await tx.financialTransaction.create({
      data: {
        tenantId,
        txnNumber,
        type: data.type,
        direction: data.direction,
        amount: data.amount,
        patientId: data.patientId,
        invoiceId: data.invoiceId,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        method: data.method as any,
        notes: data.notes,
        createdBy: data.createdBy,
      },
    });
  }

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.invoice.findFirst({
      where: { tenantId, invoiceNumber: { startsWith: `INV-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { invoiceNumber: true },
    });

    let seq = 1;
    if (latest) {
      const parts = latest.invoiceNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `INV-${ymd}-${String(seq).padStart(5, "0")}`;
  }

  private async generateNumber(
    tenantId: string,
    prefix: string,
    model: "payment" | "refund" | "deposit" | "financialTransaction",
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

  private async logAudit(
    tenantId: string,
    userId: string | undefined,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    if (!userId) return;
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          entity,
          entityId,
          action: action as any,
          metadata,
        },
      });
    } catch (error) {
      console.warn(`Failed to write audit log: ${error}`);
    }
  }
}
