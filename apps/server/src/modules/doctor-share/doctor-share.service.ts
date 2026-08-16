import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateShareRuleDto {
  doctorId?: string;
  departmentId?: string;
  serviceId?: string;
  schemeName?: string;
  shareType?: string;
  shareValue: number;
}

@Injectable()
export class DoctorShareService {
  constructor(private readonly prisma: PrismaService) {}

  async findRules(tenantId: string, doctorId?: string) {
    return this.prisma.doctorShareRule.findMany({
      where: { tenantId, ...(doctorId ? { doctorId } : {}) },
      include: {
        doctor: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private validateShare(
    shareType: string | undefined,
    shareValue: number,
  ): number {
    const value = Number(shareValue);
    if (!Number.isFinite(value))
      throw new BadRequestException("Share value must be a valid number");
    if (shareType === "FIXED" && value < 0)
      throw new BadRequestException("Fixed share value cannot be negative");
    if (shareType !== "FIXED" && (value < 0 || value > 100))
      throw new BadRequestException("Percentage share must be between 0 and 100");
    return value;
  }

  async createRule(tenantId: string, dto: CreateShareRuleDto) {
    const shareValue = this.validateShare(dto.shareType, dto.shareValue);
    return this.prisma.doctorShareRule.create({
      data: {
        tenantId,
        doctorId: dto.doctorId,
        departmentId: dto.departmentId,
        serviceId: dto.serviceId,
        schemeName: dto.schemeName,
        shareType: dto.shareType || "PERCENTAGE",
        shareValue,
      },
    });
  }

  async updateRule(
    tenantId: string,
    id: string,
    dto: Partial<CreateShareRuleDto>,
  ) {
    const rule = await this.prisma.doctorShareRule.findFirst({
      where: { id, tenantId },
    });
    if (!rule) throw new NotFoundException("Rule not found");
    const data: any = { ...dto };
    delete data.tenantId;
    delete data.id;
    if (dto.shareValue !== undefined) {
      data.shareValue = this.validateShare(
        dto.shareType || rule.shareType,
        dto.shareValue,
      );
    }
    return this.prisma.doctorShareRule.update({ where: { id }, data });
  }

  async findTransactions(tenantId: string, doctorId?: string, status?: string) {
    return this.prisma.doctorShareTransaction.findMany({
      where: {
        tenantId,
        ...(doctorId ? { doctorId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: {
        rule: true,
      },
      orderBy: { calculatedAt: "desc" },
    });
  }

  async calculateForInvoice(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const rules = await this.prisma.doctorShareRule.findMany({
      where: { tenantId, isActive: true },
    });

    // Aggregate shares per doctor across all invoice items.
    const perDoctor = new Map<
      string,
      { gross: number; discount: number; net: number; doctorShare: number }
    >();
    for (const item of invoice.items) {
      if (!item.doctorId) continue;
      const applicable = rules.find(
        (r) =>
          (!r.doctorId || r.doctorId === item.doctorId) &&
          (!r.serviceId || r.serviceId === item.serviceId) &&
          (!r.departmentId || r.departmentId === item.departmentId),
      );
      const gross = Number(item.lineTotal);
      const discount = Number(item.discountAmount) || 0;
      const net = gross - discount;
      if (net <= 0) continue;

      let doctorShare = 0;
      if (applicable) {
        doctorShare =
          applicable.shareType === "PERCENTAGE"
            ? (net * Number(applicable.shareValue)) / 100
            : Number(applicable.shareValue);
        if (doctorShare > net) doctorShare = net;
      }

      const agg = perDoctor.get(item.doctorId) || {
        gross: 0,
        discount: 0,
        net: 0,
        doctorShare: 0,
      };
      agg.gross += gross;
      agg.discount += discount;
      agg.net += net;
      agg.doctorShare += doctorShare;
      perDoctor.set(item.doctorId, agg);
    }

    // Existing transactions for this invoice, keyed by doctor.
    const existingTxns = await this.prisma.doctorShareTransaction.findMany({
      where: { tenantId, invoiceId },
    });
    const existingByDoctor = new Map(
      existingTxns
        .filter((t) => t.doctorId)
        .map((t) => [t.doctorId, t] as const),
    );

    const transactions = [];
    for (const [doctorId, agg] of perDoctor.entries()) {
      const hospitalShare = agg.net - agg.doctorShare;
      const existing = existingByDoctor.get(doctorId);

      if (existing) {
        const updatable =
          existing.status === "PENDING" || existing.status === "CALCULATED";
        transactions.push(
          await this.prisma.doctorShareTransaction.update({
            where: { id: existing.id },
            data: updatable
              ? {
                  grossAmount: agg.gross,
                  discountAmount: agg.discount,
                  hospitalShare,
                  doctorShare: agg.doctorShare,
                  netAmount: agg.net,
                }
              : {},
          }),
        );
      } else {
        transactions.push(
          await this.prisma.doctorShareTransaction.create({
            data: {
              tenantId,
              invoiceId,
              doctorId,
              grossAmount: agg.gross,
              discountAmount: agg.discount,
              hospitalShare,
              doctorShare: agg.doctorShare,
              netAmount: agg.net,
            },
          }),
        );
      }
    }

    return transactions;
  }

  async updateTransactionStatus(
    tenantId: string,
    id: string,
    body: { status: string; paymentMethod?: string; paymentReference?: string; notes?: string },
    userId?: string,
  ) {
    const txn = await this.prisma.doctorShareTransaction.findFirst({
      where: { id, tenantId },
    });
    if (!txn) throw new NotFoundException("Transaction not found");

    const from = txn.status;
    const to = body.status as string;

    const VALID_TRANSITIONS: Record<string, string[]> = {
      PENDING: ["CALCULATED", "APPROVED"],
      CALCULATED: ["APPROVED"],
      APPROVED: ["PAID"],
      PAID: [],
    };
    const allowed = VALID_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new ConflictException(
        `Invalid status transition from ${from} to ${to}`,
      );
    }

    const data: any = {
      status: to,
      notes: body.notes,
    };
    if (to === "APPROVED") {
      data.approvedBy = userId;
      data.approvedAt = new Date();
    }
    if (to === "PAID") {
      if (!userId) throw new BadRequestException("Settlement requires a user");
      data.paidAt = new Date();
      data.paidBy = userId;
      data.paymentMethod = body.paymentMethod || "CASH";
      data.paymentReference = body.paymentReference;
    }

    const updated = await this.prisma.doctorShareTransaction.update({
      where: { id },
      data,
    });

    if (to === "PAID") {
      await this.logAudit(tenantId, userId, "SETTLE", "DoctorShareTransaction", id, {
        amount: Number(txn.doctorShare),
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference,
      });
    } else {
      await this.logAudit(tenantId, userId, "UPDATE", "DoctorShareTransaction", id, {
        from,
        to,
      });
    }

    return updated;
  }

  private async logAudit(
    tenantId: string,
    userId: string | undefined,
    action: string,
    entity: string,
    entityId: string,
    metadata?: any,
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
    } catch {}
  }

  async getDoctorSummary(tenantId: string, doctorId: string) {
    const [pending, paid, total] = await Promise.all([
      this.prisma.doctorShareTransaction.aggregate({
        where: {
          tenantId,
          doctorId,
          status: { in: ["PENDING", "CALCULATED", "APPROVED"] },
        },
        _sum: { doctorShare: true },
      }),
      this.prisma.doctorShareTransaction.aggregate({
        where: { tenantId, doctorId, status: "PAID" },
        _sum: { doctorShare: true },
      }),
      this.prisma.doctorShareTransaction.aggregate({
        where: { tenantId, doctorId },
        _count: true,
        _sum: { doctorShare: true },
      }),
    ]);

    return {
      doctorId,
      pendingAmount: Number(pending._sum.doctorShare || 0),
      paidAmount: Number(paid._sum.doctorShare || 0),
      totalAmount: Number(total._sum.doctorShare || 0),
      totalTransactions: total._count,
    };
  }
}
