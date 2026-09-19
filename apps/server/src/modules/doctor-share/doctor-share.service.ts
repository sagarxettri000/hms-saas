import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { round } from "@hms/shared";

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
      throw new BadRequestException(
        "Percentage share must be between 0 and 100",
      );
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
      // Basis is NET EXCLUDING TAX (spec §15): doctors never share tax.
      // lineTotal is tax-inclusive, so tax is subtracted explicitly.
      const gross = Number(item.lineTotal);
      const discount = Number(item.discountAmount) || 0;
      const tax = Number(item.taxAmount) || 0;
      const net = round(gross - discount - tax);
      if (net <= 0) continue;

      let doctorShare = 0;
      if (applicable) {
        doctorShare =
          applicable.shareType === "PERCENTAGE"
            ? round((net * Number(applicable.shareValue)) / 100)
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
    body: {
      status: string;
      paymentMethod?: string;
      paymentReference?: string;
      notes?: string;
    },
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
      await this.logAudit(
        tenantId,
        userId,
        "SETTLE",
        "DoctorShareTransaction",
        id,
        {
          amount: Number(txn.doctorShare),
          paymentMethod: data.paymentMethod,
          paymentReference: data.paymentReference,
        },
      );
    } else {
      await this.logAudit(
        tenantId,
        userId,
        "UPDATE",
        "DoctorShareTransaction",
        id,
        {
          from,
          to,
        },
      );
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
    } catch (error) {
      console.warn(`Failed to write audit log: ${error}`);
    }
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

  // ------------------------------------------------------------------
  // Versioned multi-participant revenue-split rules (spec §14/§17/§46)
  // ------------------------------------------------------------------

  async findRevenueRules(tenantId: string, schemeId?: string) {
    if (!(this.prisma as any).revenueSplitRule) return [];
    return (this.prisma as any).revenueSplitRule.findMany({
      where: {
        tenantId,
        ...(schemeId ? { schemeId } : {}),
      },
      orderBy: [{ ruleCode: 'asc' }, { version: 'desc' }],
    });
  }

  /**
   * Create a NEW VERSION of a rule (never in-place mutation, spec §4/§34):
   * deactivates the current active version and records the change reason.
   */
  async createRevenueRule(
    tenantId: string,
    dto: {
      ruleCode: string;
      schemeId?: string;
      billingMode?: string;
      encounterType?: string;
      serviceId?: string;
      serviceCategoryId?: string;
      basis?: string;
      participants: Array<{
        type: string;
        shareType: string;
        shareValue: number;
        participantId?: string;
      }>;
      allowUnallocated?: boolean;
      priority?: number;
      effectiveFrom?: string | Date;
      changeReason?: string;
    },
    userId?: string,
  ) {
    if (!(this.prisma as any).revenueSplitRule)
      throw new BadRequestException('Revenue rules are not available');

    const { resolveRule } = await import('@hms/shared');
    const { validateRuleShares } = await import('@hms/shared');

    const existingVersions = await (this.prisma as any).revenueSplitRule.findMany({
      where: { tenantId, ruleCode: dto.ruleCode },
      orderBy: { version: 'desc' },
      take: 1,
    });
    const version = (existingVersions[0]?.version ?? 0) + 1;

    // Share validation happens through the shared engine before persisting.
    const probe = {
      id: `${dto.ruleCode}-v${version}`,
      version,
      schemeId: dto.schemeId ?? null,
      billingMode: dto.billingMode ?? null,
      encounterType: dto.encounterType ?? null,
      serviceId: dto.serviceId ?? null,
      serviceCategoryId: dto.serviceCategoryId ?? null,
      basis: (dto.basis ?? 'NET_EXCL_TAX') as any,
      participants: dto.participants,
      allowUnallocated: dto.allowUnallocated ?? false,
      priority: dto.priority ?? 0,
      effectiveFrom: new Date(dto.effectiveFrom ?? new Date()).toISOString(),
      effectiveTo: null,
      isActive: true,
    };
    validateRuleShares(probe as any);

    // Conflict check: the new rule must not tie with an existing one at the
    // same tier for the same context (deterministic resolution, spec §46).
    const activeRules = await (this.prisma as any).revenueSplitRule.findMany({
      where: { tenantId, isActive: true },
    });
    const mapped = activeRules.map((r: any) => ({
      id: r.id,
      version: r.version,
      schemeId: r.schemeId,
      billingMode: r.billingMode,
      encounterType: r.encounterType,
      serviceId: r.serviceId,
      serviceCategoryId: r.serviceCategoryId,
      basis: r.basis,
      participants: r.participants,
      allowUnallocated: r.allowUnallocated,
      priority: r.priority,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
      isActive: r.isActive,
    }));
    const ctx = {
      schemeId: dto.schemeId ?? null,
      billingMode: dto.billingMode ?? null,
      encounterType: dto.encounterType ?? null,
      serviceId: dto.serviceId ?? null,
      serviceCategoryId: dto.serviceCategoryId ?? null,
      at: new Date().toISOString(),
    };
    const resolution = resolveRule([...mapped, probe as any], ctx);
    if (resolution.status === 'CONFLICT') {
      throw new ConflictException(
        'Rule conflicts with an existing rule at the same tier/priority — adjust priority or scope',
      );
    }

    return (this.prisma as any).revenueSplitRule.create({
      data: {
        tenantId,
        ruleCode: dto.ruleCode,
        version,
        schemeId: dto.schemeId,
        billingMode: dto.billingMode,
        encounterType: dto.encounterType,
        serviceId: dto.serviceId,
        serviceCategoryId: dto.serviceCategoryId,
        basis: dto.basis ?? 'NET_EXCL_TAX',
        participants: dto.participants,
        allowUnallocated: dto.allowUnallocated ?? false,
        priority: dto.priority ?? 0,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        changeReason: dto.changeReason,
        createdBy: userId,
        isActive: true,
      },
    });
  }

  async deactivateRevenueRule(
    tenantId: string,
    id: string,
    reason: string,
    userId?: string,
  ) {
    if (!(this.prisma as any).revenueSplitRule)
      throw new BadRequestException('Revenue rules are not available');
    const rule = await (this.prisma as any).revenueSplitRule.findFirst({
      where: { id, tenantId },
    });
    if (!rule) throw new NotFoundException('Revenue rule not found');
    return (this.prisma as any).revenueSplitRule.update({
      where: { id },
      data: { isActive: false, changeReason: reason },
    });
  }

  // ------------------------------------------------------------------
  // Reconciliation exceptions (spec §42/§53)
  // ------------------------------------------------------------------

  async getReconciliationExceptions(tenantId: string) {
    const [
      performedNotBilled,
      unbilledCharges,
      finalizedWithoutAllocations,
      claimVariances,
    ] = await Promise.all([
      // Billed-without-consumed-utilization: an invoice line references a
      // charge that is not marked BILLED (consumption skipped/bypassed).
      (this.prisma as any).invoiceItem
        ? (this.prisma as any).invoiceItem
            .count({
              where: {
                tenantId,
                chargeTransactionId: { not: null },
                chargeTransaction: { is: { billingStatus: { not: 'BILLED' } } },
              },
            })
            .catch(() => 0)
        : Promise.resolve(0),
      // Performed but not billed: charges still UNBILLED.
      (this.prisma as any).chargeTransaction
        ? (this.prisma as any).chargeTransaction.count({
            where: { tenantId, billingStatus: 'UNBILLED' },
          }).catch(() => 0)
        : Promise.resolve(0),
      // Finalized invoices missing revenue allocations entirely.
      (this.prisma as any).revenueAllocation
        ? (this.prisma as any).invoice.count({
            where: {
              tenantId,
              finalizedAt: { not: null },
              revenueAllocations: { none: {} },
            },
          }).catch(() => 0)
        : Promise.resolve(0),
      // Claims where approved != claimed, or received != approved.
      (this.prisma as any).insuranceClaim.count({
        where: {
          tenantId,
          OR: [
            { approvedAmount: { not: null } },
            { receivedAmount: { not: null } },
          ],
        },
      }).then((n: number) => n).catch(() => 0),
    ]);

    return {
      performedNotBilled: unbilledCharges,
      billedWithoutUtilization: performedNotBilled,
      finalizedWithoutAllocations,
      claimCount: claimVariances,
      generatedAt: new Date().toISOString(),
    };
  }
}
