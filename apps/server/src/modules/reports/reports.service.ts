import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  CATEGORIES,
  getReportDefinition,
  getReportDefinitions,
  AGE_GROUPS,
} from "./analysis/report-registry";
import { getExecutor } from "./analysis";
import type {
  FilterOption,
  GeneratedReport,
  ReportDefinition,
  ReportMeta,
  PrismaLike,
  ResolvedFilters,
} from "./analysis/report.types";

const MIN_REPORT_YEAR = 1900;
const MAX_REPORT_YEAR = 2100;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit?: AuditService,
  ) {}

  private assertDateInRange(d: Date, label: string) {
    const y = d.getFullYear();
    if (y < MIN_REPORT_YEAR || y > MAX_REPORT_YEAR) {
      throw new BadRequestException(
        `${label} is out of range (${MIN_REPORT_YEAR}-${MAX_REPORT_YEAR})`,
      );
    }
  }

  private parseRange(from?: string, to?: string) {
    const range: { from?: Date; to?: Date } = {};
    if (from) {
      const d = new Date(from);
      if (isNaN(d.getTime()))
        throw new BadRequestException("Invalid from date");
      this.assertDateInRange(d, "From date");
      range.from = d;
    }
    if (to) {
      const d = new Date(to);
      if (isNaN(d.getTime())) throw new BadRequestException("Invalid to date");
      this.assertDateInRange(d, "To date");
      d.setHours(23, 59, 59, 999);
      range.to = d;
    }
    if (range.from && range.to && range.from > range.to) {
      throw new BadRequestException("To date must be on or after from date");
    }
    return range;
  }

  private dateWhere(
    tenantId: string,
    field: string,
    range: { from?: Date; to?: Date },
  ) {
    const where: any = { tenantId };
    if (range.from || range.to) {
      where[field] = {};
      if (range.from) where[field].gte = range.from;
      if (range.to) where[field].lte = range.to;
    }
    return where;
  }

  private static readonly OPEN_INVOICE_STATUSES = [
    "PENDING",
    "PARTIAL",
    "OVERDUE",
  ];

  private static readonly REVENUE_TYPE_LABELS: Record<string, string> = {
    OPD: "Outpatient",
    SPECIAL_OPD: "Special OPD",
    IPD: "Inpatient",
    DISCHARGE: "Admission / Discharge",
    EMERGENCY: "Emergency",
    LAB: "Laboratory",
    LABORATORY: "Laboratory",
    RADIOLOGY: "Radiology",
    PHARMACY: "Pharmacy",
    OT: "Operation Theatre",
    PROCEDURE: "Procedures",
    SERVICE: "Services",
    AMBULANCE: "Ambulance",
  };

  private static readonly METHOD_LABELS: Record<string, string> = {
    CASH: "Cash",
    CARD: "Card",
    BANK: "Bank",
    ONLINE: "Online",
    WALLET: "Wallet",
    INSURANCE: "Insurance",
  };

  /**
   * Executive analytics overview built entirely from live aggregate queries.
   * Powers the dedicated /analytics view: revenue vs collections trend, KPI
   * deltas vs the previous comparable period, receivables aging, revenue by
   * type/department, top patients and insurance payer mix.
   */
  async getAnalyticsOverview(
    tenantId: string,
    params: { days?: string | number; from?: string; to?: string } = {},
  ) {
    const n = (v: unknown): number => Number(v ?? 0);
    const pctChange = (current: number, previous: number): number => {
      if (previous === 0) return current === 0 ? 0 : 100;
      return ((current - previous) / previous) * 100;
    };
    const dateKey = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const monthKey = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const now = new Date();
    let from: Date;
    let to: Date;
    if (params.from || params.to) {
      const range = this.parseRange(params.from, params.to);
      to =
        range.to ??
        new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      from =
        range.from ??
        new Date(to.getFullYear(), to.getMonth(), to.getDate() - 29);
    } else {
      const days = Math.min(365, Math.max(1, Number(params.days) || 30));
      to = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
    }
    from.setHours(0, 0, 0, 0);
    const dayCount = Math.max(
      1,
      Math.round((to.getTime() - from.getTime()) / 86_400_000),
    );
    // Previous window of equal length for period-over-period deltas.
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(from.getTime() - dayCount * 86_400_000);
    const sixMonthsStart = new Date(
      now.getFullYear(),
      now.getMonth() - 5,
      1,
    );

    const invWhere = {
      tenantId,
      issuedDate: { gte: from, lte: to },
      status: { not: "CANCELLED" as any },
    };

    const [
      invAgg,
      invTypeGroup,
      invStatusGroup,
      prevInvAgg,
      payAgg,
      payMethodGroup,
      prevPayAgg,
      refundAgg,
      trendInvoices,
      trendPayments,
      topPatientGroup,
      deptGroup,
      agingRows,
      monthlyInvoices,
      monthlyPayments,
      insuranceStatusGroup,
      insuranceProviderGroup,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        _sum: { totalAmount: true, paidAmount: true, dueAmount: true },
        _count: true,
        where: invWhere,
      }),
      this.prisma.invoice.groupBy({
        by: ["type"],
        _sum: { totalAmount: true, paidAmount: true, dueAmount: true },
        _count: true,
        where: invWhere,
      }),
      this.prisma.invoice.groupBy({
        by: ["status"],
        _count: true,
        where: invWhere,
      }),
      this.prisma.invoice.aggregate({
        _sum: { totalAmount: true, paidAmount: true },
        where: {
          tenantId,
          issuedDate: { gte: prevFrom, lte: prevTo },
          status: { not: "CANCELLED" as any },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { tenantId, paidAt: { gte: from, lte: to } },
      }),
      this.prisma.payment.groupBy({
        by: ["method"],
        _sum: { amount: true },
        _count: true,
        where: { tenantId, paidAt: { gte: from, lte: to } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { tenantId, paidAt: { gte: prevFrom, lte: prevTo } },
      }),
      this.prisma.refund.aggregate({
        _sum: { amount: true },
        _count: true,
        where: {
          tenantId,
          refundedAt: { gte: from, lte: to },
          status: "COMPLETED",
        },
      }),
      this.prisma.invoice.findMany({
        select: { issuedDate: true, totalAmount: true },
        where: invWhere,
      }),
      this.prisma.payment.findMany({
        select: { paidAt: true, amount: true },
        where: { tenantId, paidAt: { gte: from, lte: to } },
      }),
      this.prisma.invoice.groupBy({
        by: ["patientId"],
        _sum: { totalAmount: true, paidAmount: true, dueAmount: true },
        _count: true,
        where: { ...invWhere, patientId: { not: null } },
        orderBy: { _sum: { totalAmount: "desc" } },
        take: 8,
      } as any),
      this.prisma.invoiceItem.groupBy({
        by: ["departmentId"],
        _sum: { lineTotal: true },
        where: {
          tenantId,
          departmentId: { not: null },
          invoice: { is: invWhere },
        },
        orderBy: { _sum: { lineTotal: "desc" } },
        take: 10,
      } as any),
      this.prisma.invoice.findMany({
        select: { dueAmount: true, dueDate: true, issuedDate: true },
        where: {
          tenantId,
          status: { in: ReportsService.OPEN_INVOICE_STATUSES as any },
          dueAmount: { gt: 0 },
        },
      }),
      this.prisma.invoice.findMany({
        select: { issuedDate: true, totalAmount: true },
        where: {
          tenantId,
          issuedDate: { gte: sixMonthsStart },
          status: { not: "CANCELLED" as any },
        },
      }),
      this.prisma.payment.findMany({
        select: { paidAt: true, amount: true },
        where: { tenantId, paidAt: { gte: sixMonthsStart } },
      }),
      this.prisma.insuranceClaim.groupBy({
        by: ["status"],
        _sum: {
          claimAmount: true,
          approvedAmount: true,
          receivedAmount: true,
        },
        _count: true,
        where: { tenantId },
      }),
      this.prisma.insuranceClaim.groupBy({
        by: ["providerId"],
        _sum: {
          claimAmount: true,
          approvedAmount: true,
          receivedAmount: true,
        },
        _count: true,
        where: { tenantId, providerId: { not: null } },
        orderBy: { _sum: { claimAmount: "desc" } },
        take: 8,
      } as any),
    ]);

    const patientIds = topPatientGroup
      .map((g) => g.patientId)
      .filter((id): id is string => !!id);
    const deptIds = deptGroup
      .map((g) => g.departmentId)
      .filter((id): id is string => !!id);
    const providerIds = insuranceProviderGroup
      .map((g) => g.providerId)
      .filter((id): id is string => !!id);

    const [patients, departments, providers] = await Promise.all([
      patientIds.length
        ? this.prisma.patient.findMany({
            where: { id: { in: patientIds } },
            select: {
              id: true,
              mrn: true,
              firstName: true,
              middleName: true,
              lastName: true,
            },
          })
        : Promise.resolve([] as any[]),
      deptIds.length
        ? this.prisma.department.findMany({
            where: { id: { in: deptIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as any[]),
      providerIds.length
        ? this.prisma.insuranceProvider.findMany({
            where: { id: { in: providerIds } },
            select: { id: true, name: true, type: true },
          })
        : Promise.resolve([] as any[]),
    ]);
    const patientMap = new Map(patients.map((p: any) => [p.id, p]));
    const deptMap = new Map(departments.map((d: any) => [d.id, d]));
    const providerMap = new Map(providers.map((p: any) => [p.id, p]));

    // Daily trend (zero-filled across the full window).
    const trendMap: Record<string, { revenue: number; collection: number }> = {};
    const cursor = new Date(from);
    for (let d = 0; d < dayCount; d++) {
      trendMap[dateKey(cursor)] = { revenue: 0, collection: 0 };
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const inv of trendInvoices) {
      const key = dateKey(inv.issuedDate);
      if (trendMap[key]) trendMap[key].revenue += n(inv.totalAmount);
    }
    for (const pay of trendPayments) {
      const key = dateKey(pay.paidAt);
      if (trendMap[key]) trendMap[key].collection += n(pay.amount);
    }
    let cumRevenue = 0;
    let cumCollection = 0;
    const trend = Object.entries(trendMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => {
        cumRevenue += v.revenue;
        cumCollection += v.collection;
        return {
          date,
          revenue: Math.round(v.revenue * 100) / 100,
          collection: Math.round(v.collection * 100) / 100,
          cumulativeRevenue: Math.round(cumRevenue * 100) / 100,
          cumulativeCollection: Math.round(cumCollection * 100) / 100,
        };
      });

    // Revenue by type.
    const revenueByType = invTypeGroup
      .map((g) => ({
        type: g.type,
        label:
          ReportsService.REVENUE_TYPE_LABELS[g.type] ||
          String(g.type).replace(/_/g, " "),
        amount: n(g._sum.totalAmount),
        collected: n(g._sum.paidAmount),
        outstanding: n(g._sum.dueAmount),
        count: n(g._count),
      }))
      .filter((r) => r.amount !== 0 || r.count > 0)
      .sort((a, b) => b.amount - a.amount);

    // Collections by method.
    const collectionsTotal = n(payAgg._sum.amount);
    const collectionByMethod = payMethodGroup
      .map((g) => ({
        method: g.method,
        label:
          ReportsService.METHOD_LABELS[g.method] ||
          String(g.method).replace(/_/g, " "),
        amount: n(g._sum.amount),
        count: n(g._count),
        share: collectionsTotal > 0 ? (n(g._sum.amount) / collectionsTotal) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Receivables aging (snapshot of open invoices, aged from dueDate).
    const agingDefs = [
      { key: "current", label: "0–30 days", max: 30, color: "#16a34a" },
      { key: "d31_60", label: "31–60 days", max: 60, color: "#2563eb" },
      { key: "d61_90", label: "61–90 days", max: 90, color: "#d97706" },
      { key: "d90", label: "90+ days", max: Infinity, color: "#dc2626" },
    ];
    const outstandingAging = agingDefs.map((b) => ({
      key: b.key,
      label: b.label,
      color: b.color,
      amount: 0,
      count: 0,
    }));
    for (const inv of agingRows) {
      const basis = inv.dueDate || inv.issuedDate;
      const age = basis
        ? Math.max(0, Math.floor((Date.now() - basis.getTime()) / 86_400_000))
        : 0;
      const idx = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
      outstandingAging[idx].amount += n(inv.dueAmount);
      outstandingAging[idx].count += 1;
    }

    // Top patients by billed amount.
    const topPayers = topPatientGroup.map((g) => {
      const p = patientMap.get(g.patientId as string);
      const name = p
        ? [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")
        : "Unknown patient";
      return {
        patientId: g.patientId,
        name,
        mrn: p?.mrn || null,
        billed: n(g._sum?.totalAmount),
        collected: n(g._sum?.paidAmount),
        outstanding: n(g._sum?.dueAmount),
        invoices: n(g._count),
      };
    });

    // Revenue by department (from invoice line items).
    const revenueByDepartment = deptGroup.map((g) => ({
      departmentId: g.departmentId,
      name: deptMap.get(g.departmentId as string)?.name || "Unassigned",
      amount: n(g._sum?.lineTotal),
    }));

    // Monthly revenue vs collections (last 6 months).
    const monthlyMap: Record<string, { revenue: number; collection: number }> = {};
    for (let i = 5; i >= 0; i--) {
      monthlyMap[monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1))] = {
        revenue: 0,
        collection: 0,
      };
    }
    for (const inv of monthlyInvoices) {
      const key = monthKey(inv.issuedDate);
      if (monthlyMap[key]) monthlyMap[key].revenue += n(inv.totalAmount);
    }
    for (const pay of monthlyPayments) {
      const key = monthKey(pay.paidAt);
      if (monthlyMap[key]) monthlyMap[key].collection += n(pay.amount);
    }
    const monthly = Object.entries(monthlyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => {
        const [y, m] = key.split("-").map(Number);
        return {
          key,
          label: new Date(y, m - 1, 1).toLocaleString(undefined, {
            month: "short",
            year: "2-digit",
          }),
          revenue: Math.round(v.revenue * 100) / 100,
          collection: Math.round(v.collection * 100) / 100,
        };
      });

    // Insurance payer mix.
    const insuranceByStatus = insuranceStatusGroup.map((g) => ({
      status: g.status,
      count: n(g._count),
      claimed: n(g._sum?.claimAmount),
      approved: n(g._sum?.approvedAmount),
      received: n(g._sum?.receivedAmount),
    }));
    let claimed = 0;
    let approved = 0;
    let received = 0;
    let claimCount = 0;
    for (const s of insuranceByStatus) {
      claimed += s.claimed;
      approved += s.approved;
      received += s.received;
      claimCount += s.count;
    }
    const topProviders = insuranceProviderGroup.map((g) => {
      const p = providerMap.get(g.providerId as string);
      return {
        providerId: g.providerId,
        name: p?.name || "Unknown provider",
        type: p?.type || null,
        claims: n(g._count),
        claimed: n(g._sum?.claimAmount),
        approved: n(g._sum?.approvedAmount),
        received: n(g._sum?.receivedAmount),
      };
    });

    const revenue = n(invAgg._sum.totalAmount);
    const collections = collectionsTotal;
    const refunds = n(refundAgg._sum.amount);
    const outstanding = n(invAgg._sum.dueAmount);
    const invoices = n(invAgg._count);
    const statusCounts: Record<string, number> = {};
    for (const g of invStatusGroup) statusCounts[g.status] = n(g._count);
    const prevRevenue = n(prevInvAgg._sum.totalAmount);
    const prevCollections = n(prevPayAgg._sum.amount);
    const prevPaid = n(prevInvAgg._sum.paidAmount);

    return {
      range: {
        from: dateKey(from),
        to: dateKey(to),
        days: dayCount,
        previousFrom: dateKey(prevFrom),
        previousTo: dateKey(prevTo),
      },
      kpis: {
        revenue,
        collections,
        refunds,
        netCollections: collections - refunds,
        outstanding,
        collectionRate: revenue > 0 ? (collections / revenue) * 100 : 0,
        netCollectionRate:
          revenue > 0 ? ((collections - refunds) / revenue) * 100 : 0,
        invoices,
        paidInvoices: statusCounts.PAID ?? 0,
        partialInvoices: statusCounts.PARTIAL ?? 0,
        pendingInvoices: statusCounts.PENDING ?? 0,
        overdueInvoices: statusCounts.OVERDUE ?? 0,
        cancelledInvoices: statusCounts.CANCELLED ?? 0,
        avgInvoice: invoices > 0 ? revenue / invoices : 0,
        avgDailyRevenue: dayCount > 0 ? revenue / dayCount : 0,
        avgDailyCollection: dayCount > 0 ? collections / dayCount : 0,
        prevRevenue,
        prevCollections,
        prevPaid,
        revenueDelta: pctChange(revenue, prevRevenue),
        collectionDelta: pctChange(collections, prevCollections),
      },
      trend,
      revenueByType,
      collectionByMethod,
      outstandingAging,
      topPayers,
      revenueByDepartment,
      monthly,
      insurance: {
        claimCount,
        claimed,
        approved,
        received,
        outstanding: Math.max(0, approved - received),
        settlementRate: approved > 0 ? (received / approved) * 100 : 0,
        byStatus: insuranceByStatus.sort((a, b) => b.claimed - a.claimed),
        topProviders,
      },
    };
  }

  async getSummary(
    tenantId: string,
    params: { from?: string; to?: string } = {},
  ) {
    const range = this.parseRange(params.from, params.to);

    const invWhere = this.dateWhere(tenantId, "issuedDate", range);
    invWhere.status = { not: "CANCELLED" };
    invWhere.type = { notIn: ["PHARMACY", "EMERGENCY"] as any };

    const [
      invoices,
      appointments,
      patients,
      admissions,
      beds,
      doctors,
      labOrders,
      radiologyOrders,
      activeAdmits,
      overdueCount,
    ] = await Promise.all([
      this.prisma.invoice.findMany({
        where: invWhere,
        select: { totalAmount: true, paidAmount: true, status: true },
      }),
      this.prisma.appointment.count({
        where: this.dateWhere(tenantId, "appointmentDate", range),
      }),
      this.prisma.patient.count({
        where:
          range.from || range.to
            ? {
                tenantId,
                deletedAt: null,
                createdAt: {
                  gte: range.from ?? undefined,
                  lte: range.to ?? undefined,
                },
              }
            : { tenantId, deletedAt: null },
      }),
      this.prisma.admission.count({
        where: this.dateWhere(tenantId, "admissionDate", range),
      }),
      this.prisma.bed.count({ where: { tenantId } }),
      this.prisma.doctorProfile.count({ where: { tenantId } }),
      this.prisma.labOrder.count({
        where: this.dateWhere(tenantId, "orderedAt", range),
      }),
      this.prisma.radiologyOrder.count({
        where: this.dateWhere(tenantId, "orderedAt", range),
      }),
      this.prisma.admission.count({
        where: { tenantId, status: { in: ["ADMITTED", "PENDING"] } },
      }),
      this.prisma.invoice.count({
        where: { tenantId, status: "OVERDUE", type: { notIn: ["PHARMACY", "EMERGENCY"] as any } },
      }),
    ]);

    const occupiedBeds = await this.prisma.bed.count({
      where: { tenantId, status: "OCCUPIED" },
    });

    const totalRevenue = invoices.reduce(
      (s, i) => s + Number(i.totalAmount),
      0,
    );
    const collected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);

    return {
      totalRevenue,
      collected,
      outstanding: Math.max(0, totalRevenue - collected),
      overdueInvoices: overdueCount,
      patients,
      appointments,
      admissions,
      activeAdmissions: activeAdmits,
      bedOccupancy: { occupied: occupiedBeds, total: beds },
      doctors,
      labOrders,
      radiologyOrders,
    };
  }

  async revenueByStatus(
    tenantId: string,
    params: { from?: string; to?: string } = {},
  ) {
    const range = this.parseRange(params.from, params.to);
    const where = this.dateWhere(tenantId, "issuedDate", range);
    where.status = { not: "CANCELLED" };
    where.type = { notIn: ["PHARMACY", "EMERGENCY"] as any };
    const rows = await this.prisma.invoice.findMany({
      where,
      select: {
        status: true,
        totalAmount: true,
        paidAmount: true,
        dueAmount: true,
      },
    });
    const byStatus: Record<
      string,
      { count: number; amount: number; collected: number }
    > = {};
    for (const r of rows) {
      const key = r.status;
      if (!byStatus[key]) byStatus[key] = { count: 0, amount: 0, collected: 0 };
      byStatus[key].count += 1;
      byStatus[key].amount += Number(r.totalAmount);
      byStatus[key].collected += Number(r.paidAmount);
    }
    return Object.entries(byStatus)
      .map(([status, v]) => ({ status, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }

  async appointmentsByStatus(
    tenantId: string,
    params: { from?: string; to?: string } = {},
  ) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.appointment.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "startTime", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async admissionsByStatus(
    tenantId: string,
    params: { from?: string; to?: string } = {},
  ) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.admission.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "admissionDate", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async labByStatus(
    tenantId: string,
    params: { from?: string; to?: string } = {},
  ) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.labOrder.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "orderedAt", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async doctorWorkload(
    tenantId: string,
    params: { from?: string; to?: string } = {},
  ) {
    const range = this.parseRange(params.from, params.to);
    const where = this.dateWhere(tenantId, "startTime", range);
    const grouped = await this.prisma.appointment.groupBy({
      by: ["doctorId"],
      where,
      _count: true,
    });
    const ids = grouped.map((g) => g.doctorId).filter(Boolean);
    const profiles = ids.length
      ? await this.prisma.doctorProfile.findMany({
          where: { id: { in: ids as string[] } },
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const nameById = new Map(
      profiles.map((p) => [
        p.id,
        `${p.user.firstName} ${p.user.lastName}`.trim(),
      ]),
    );
    return grouped
      .filter((g) => g.doctorId)
      .map((g) => ({
        doctorId: g.doctorId,
        name: nameById.get(g.doctorId as string) || g.doctorId,
        count: g._count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  async departmentStats(tenantId: string) {
    const grouped = await this.prisma.encounter.groupBy({
      by: ["departmentId"],
      where: { tenantId },
      _count: true,
    });
    const ids = grouped.map((g) => g.departmentId).filter(Boolean);
    const depts = ids.length
      ? await this.prisma.department.findMany({
          where: { id: { in: ids as string[] } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(depts.map((d) => [d.id, d.name]));
    return grouped
      .filter((g) => g.departmentId)
      .map((g) => ({
        departmentId: g.departmentId,
        name: nameById.get(g.departmentId as string) || g.departmentId,
        count: g._count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  getAnalysisTree() {
    return CATEGORIES.map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      reports: c.reports.map((r) => ({
        id: r.id,
        number: r.number,
        name: r.name,
        description: r.description,
        audience: r.audience,
        filters: r.filters,
      })),
    }));
  }

  getAnalysisDefinitions(): ReportDefinition[] {
    return getReportDefinitions();
  }

  getAnalysisDefinition(reportId: string): ReportDefinition {
    const def = getReportDefinition(reportId);
    if (!def) throw new NotFoundException("Report not found");
    return def;
  }

  async getAnalysisOptions(
    tenantId: string,
    name: string,
    search?: string,
  ): Promise<FilterOption[]> {
    const s = search?.trim();
    const contains = s
      ? { contains: s, mode: "insensitive" as const }
      : undefined;
    switch (name) {
      case "department": {
        const depts = await this.prisma.department.findMany({
          where: {
            tenantId,
            isActive: true,
            ...(contains ? { name: contains } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });
        return depts.map((d) => ({ value: d.id, label: d.name }));
      }
      case "doctor": {
        const docs = await this.prisma.doctorProfile.findMany({
          where: { tenantId, isActive: true },
          select: {
            id: true,
            user: {
              select: { firstName: true, middleName: true, lastName: true },
            },
          },
          take: 500,
        });
        return docs
          .map((d) => ({
            value: d.id,
            label: [d.user.firstName, d.user.middleName, d.user.lastName]
              .filter(Boolean)
              .join(" "),
          }))
          .filter((d) => !s || d.label.toLowerCase().includes(s.toLowerCase()));
      }
      case "ward": {
        const wards = await this.prisma.ward.findMany({
          where: {
            tenantId,
            isActive: true,
            ...(contains ? { name: contains } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });
        return wards.map((w) => ({ value: w.id, label: w.name }));
      }
      case "patient": {
        const where: any = { tenantId, deletedAt: null };
        if (contains) {
          where.OR = [
            { firstName: contains },
            { middleName: contains },
            { lastName: contains },
            { mrn: contains },
            { uid: contains },
          ];
        }
        const patients = await this.prisma.patient.findMany({
          where,
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
          },
          orderBy: { createdAt: "desc" },
          take: s ? 50 : 200,
        });
        return patients.map((p) => ({
          value: p.id,
          label: `${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")} (${p.mrn})`,
        }));
      }
      case "userId":
      case "cashier": {
        const users = await this.prisma.user.findMany({
          where: { tenantId, isActive: true, deletedAt: null },
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            role: true,
          },
          orderBy: { firstName: "asc" },
          take: 500,
        });
        return users
          .map((u) => ({
            value: u.id,
            label: [u.firstName, u.middleName, u.lastName]
              .filter(Boolean)
              .join(" "),
          }))
          .filter((u) => !s || u.label.toLowerCase().includes(s.toLowerCase()));
      }
      case "branch": {
        const branches = await this.prisma.branch.findMany({
          where: {
            tenantId,
            isActive: true,
            ...(contains ? { name: contains } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        return branches.map((b) => ({ value: b.id, label: b.name }));
      }
      case "service": {
        const services = await this.prisma.billingService.findMany({
          where: {
            tenantId,
            isActive: true,
            ...(contains ? { name: contains } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });
        return services.map((sv) => ({ value: sv.id, label: sv.name }));
      }
      case "test": {
        const tests = await this.prisma.labTest.findMany({
          where: {
            tenantId,
            isActive: true,
            ...(contains ? { name: contains } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });
        return tests.map((t) => ({ value: t.id, label: t.name }));
      }
      case "account": {
        const accounts = await this.prisma.account.findMany({
          where: {
            tenantId,
            isActive: true,
            ...(contains ? { name: contains } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });
        return accounts.map((a) => ({ value: a.id, label: a.name }));
      }
      case "bed": {
        const beds = await this.prisma.bed.findMany({
          where: { tenantId, isActive: true },
          select: {
            id: true,
            bedNumber: true,
            ward: { select: { name: true } },
          },
          orderBy: { bedNumber: "asc" },
          take: 500,
        });
        return beds.map((b) => ({
          value: b.id,
          label: `${b.bedNumber}${b.ward ? ` (${b.ward.name})` : ""}`,
        }));
      }
      case "paymentMode":
        return [
          "CASH",
          "CARD",
          "BANK",
          "ONLINE",
          "WALLET",
          "INSURANCE",
          "CREDIT",
          "OTHER",
        ].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
      case "gender":
        return ["MALE", "FEMALE", "OTHER"].map((v) => ({ value: v, label: v }));
      case "ageGroup":
        return [...AGE_GROUPS, "Unknown"].map((v) => ({ value: v, label: v }));
      case "type":
        return [
          "OPD",
          "IPD",
          "EMERGENCY",
          "SPECIAL_OPD",
          "PROCEDURE",
          "SERVICE",
          "DISCHARGE",
          "LAB",
          "RADIOLOGY",
          "PHARMACY",
          "OT",
          "AMBULANCE",
          "FOLLOWUP",
        ].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
      case "status":
        return [
          "DRAFT",
          "PENDING",
          "PARTIAL",
          "PAID",
          "OVERDUE",
          "CANCELLED",
          "REFUNDED",
          "ADMITTED",
          "DISCHARGED",
          "DECEASED",
          "TRANSFERRED",
          "ORDERED",
          "RESULT_READY",
          "VERIFIED",
          "APPROVED",
          "REPORTED",
          "REQUESTED",
          "SCHEDULED",
          "COMPLETED",
          "IN_PROGRESS",
        ].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
      case "month":
        return Array.from({ length: 12 }, (_, i) => ({
          value: String(i + 1),
          label: new Date(2026, i, 1).toLocaleString("en-US", {
            month: "long",
          }),
        }));
      case "year": {
        const current = new Date().getFullYear();
        const years: FilterOption[] = [];
        for (let y = current; y >= current - 10; y--)
          years.push({ value: String(y), label: String(y) });
        return years;
      }
      default:
        return [];
    }
  }

  private resolveFilters(
    def: ReportDefinition,
    raw: Record<string, any>,
  ): ResolvedFilters {
    const filters: ResolvedFilters = { all: raw };
    const hasRange =
      def.filters.includes("fromDate") || def.filters.includes("toDate");
    if (hasRange) {
      if (raw.from !== undefined && raw.from !== null && raw.from !== "") {
        const from = new Date(raw.from);
        if (isNaN(from.getTime()))
          throw new BadRequestException("Invalid from date");
        this.assertDateInRange(from, "From date");
        filters.from = from;
      }
      if (raw.to !== undefined && raw.to !== null && raw.to !== "") {
        const to = new Date(raw.to);
        if (isNaN(to.getTime()))
          throw new BadRequestException("Invalid to date");
        this.assertDateInRange(to, "To date");
        to.setHours(23, 59, 59, 999);
        filters.to = to;
      }
      if (filters.from && filters.to && filters.from > filters.to) {
        throw new BadRequestException("To date must be on or after from date");
      }
    }
    const month = raw.month !== undefined ? Number(raw.month) : undefined;
    const year = raw.year !== undefined ? Number(raw.year) : undefined;
    if (
      month !== undefined &&
      (Number.isNaN(month) || month < 1 || month > 12)
    ) {
      throw new BadRequestException("Invalid month");
    }
    if (
      year !== undefined &&
      (Number.isNaN(year) || year < MIN_REPORT_YEAR || year > MAX_REPORT_YEAR)
    ) {
      throw new BadRequestException(
        `Invalid year (${MIN_REPORT_YEAR}-${MAX_REPORT_YEAR})`,
      );
    }
    if (
      def.filters.includes("month") &&
      def.filters.includes("year") &&
      month &&
      year &&
      !filters.from &&
      !filters.to
    ) {
      filters.from = new Date(Date.UTC(year, month - 1, 1));
      filters.to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    }
    const map: [string, keyof ResolvedFilters][] = [
      ["department", "departmentId"],
      ["doctor", "doctorId"],
      ["ward", "wardId"],
      ["patient", "patientId"],
      ["userId", "userId"],
      ["cashier", "userId"],
      ["branch", "branchId"],
      ["service", "serviceId"],
      ["test", "test"],
      ["account", "accountId"],
      ["paymentMode", "paymentMode"],
      ["gender", "gender"],
      ["ageGroup", "ageGroup"],
      ["type", "type"],
      ["status", "status"],
      ["bed", "bedId"],
      ["admissionType", "admissionType"],
      ["search", "search"],
    ];
    for (const [rawKey, target] of map) {
      if (
        raw[rawKey] !== undefined &&
        raw[rawKey] !== null &&
        raw[rawKey] !== ""
      ) {
        (filters as any)[target] = String(raw[rawKey]);
      }
    }
    return filters;
  }

  async generateAnalysis(
    tenantId: string,
    userId: string | undefined,
    reportId: string,
    raw: Record<string, any> = {},
  ): Promise<GeneratedReport> {
    const def = this.getAnalysisDefinition(reportId);
    const executor = getExecutor(def.source);
    if (!executor)
      throw new BadRequestException("Report source not configured");
    const filters = this.resolveFilters(def, raw);
    const result = await executor({
      prisma: this.prisma as unknown as PrismaLike,
      tenantId,
      filters,
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        district: true,
        province: true,
        country: true,
      },
    });
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, middleName: true, lastName: true },
        })
      : null;

    const meta: ReportMeta = {
      generatedAt: new Date().toISOString(),
      filters: this.filterSummary(filters, raw),
      hospital: {
        name: tenant?.name || "Hospital",
        address:
          [tenant?.addressLine1, tenant?.addressLine2, tenant?.district]
            .filter(Boolean)
            .join(", ") || "",
        city: tenant?.city || tenant?.province || "",
      },
      user: user
        ? [user.firstName, user.middleName, user.lastName]
            .filter(Boolean)
            .join(" ")
        : "System",
    };

    const columns = result.columns ?? def.columns;
    const chart = result.chart
      ? {
          ...result.chart,
          labels: result.rows.map((r) =>
            String(r[result.chart!.labelsKey] ?? ""),
          ),
          seriesData: Object.fromEntries(
            result.chart.series.map((s) => [
              s.key,
              result.rows.map((r) => Number(r[s.key]) || 0),
            ]),
          ),
        }
      : null;
    const generated: GeneratedReport = {
      report: {
        id: def.id,
        number: def.number,
        name: def.name,
        category: def.category,
        description: def.description,
      },
      meta,
      columns,
      rows: result.rows,
      totals: result.totals ?? {},
      cards: result.cards ?? [],
      chart,
      count: result.rows.length,
      views: result.views,
    };

    await this.audit?.log?.(tenantId, userId, "REPORT", reportId, "GENERATE", {
      filters: raw,
    });
    return generated;
  }

  private filterSummary(
    filters: ResolvedFilters,
    raw: Record<string, any>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    const date = (d?: Date) => (d ? d.toISOString().slice(0, 10) : "");
    if (filters.from || filters.to) {
      out["Period"] =
        `${date(filters.from) || "start"} to ${date(filters.to) || "today"}`;
    }
    const labels: [string, string][] = [
      ["department", "Department"],
      ["doctor", "Doctor"],
      ["ward", "Ward"],
      ["patient", "Patient"],
      ["userId", "User"],
      ["branch", "Branch"],
      ["service", "Service"],
      ["account", "Account"],
      ["paymentMode", "Payment Mode"],
      ["gender", "Gender"],
      ["ageGroup", "Age Group"],
      ["type", "Type"],
      ["status", "Status"],
      ["search", "Search"],
    ];
    for (const [key, label] of labels) {
      if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
        out[label] = String(raw[key]);
      }
    }
    return out;
  }

  async exportAnalysis(
    tenantId: string,
    userId: string | undefined,
    reportId: string,
    raw: Record<string, any> = {},
    format: string,
  ): Promise<{ data: Buffer; contentType: string; filename: string }> {
    const def = this.getAnalysisDefinition(reportId);
    const generated = await this.generateAnalysis(
      tenantId,
      userId,
      reportId,
      raw,
    );
    const columns = generated.columns;
    const title = `${def.number} ${def.name}`;
    const period = generated.meta.filters["Period"] || "";
    const subtitle = `${generated.meta.hospital.name}${generated.meta.hospital.city ? ", " + generated.meta.hospital.city : ""} | ${period}`;
    const displayRows = generated.rows.map((r) =>
      columns.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined) return "";
        if (c.type === "money") return Number(v).toFixed(2);
        if (c.type === "number") return String(v);
        if (c.type === "date")
          return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
        return String(v);
      }),
    );
    const headerRow = columns.map((c) => c.label);
    const totalsRow = columns.map((c) =>
      c.total && generated.totals[c.key] !== undefined
        ? Number(generated.totals[c.key]).toFixed(2)
        : "",
    );

    const baseName = def.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    if (format === "csv") {
      const { toCsv } = await import("../exports/pdf.util");
      const csv = toCsv([
        headerRow,
        ...displayRows,
        ...(totalsRow.some(Boolean) ? [totalsRow] : []),
      ]);
      return {
        data: Buffer.from(`\uFEFF${csv}`, "utf8"),
        contentType: "text/csv; charset=utf-8",
        filename: `${baseName}.csv`,
      };
    }
    if (format === "pdf") {
      const { buildReportPdf } = await import("./analysis/report-exports");
      const pdf = buildReportPdf({
        title,
        subtitle,
        meta: {
          generatedAt: new Date(generated.meta.generatedAt).toLocaleString(),
          user: generated.meta.user,
          count: generated.count,
          hospital: generated.meta.hospital.name,
        },
        columns: columns.map((c) => ({
          title: c.label,
          width: Math.max(1, Math.round(c.label.length * 0.8) + 4),
          align: c.align,
        })),
        rows: displayRows,
        totalsRow: totalsRow.some(Boolean) ? totalsRow : undefined,
      });
      return {
        data: pdf,
        contentType: "application/pdf",
        filename: `${baseName}.pdf`,
      };
    }
    if (format === "xls") {
      const { buildReportXls } = await import("./analysis/report-exports");
      const xls = buildReportXls({
        title,
        subtitle,
        columns: columns.map((c) => ({
          key: c.key,
          title: c.label,
          type: c.type,
        })),
        rows: generated.rows,
        totalsRow: totalsRow.some(Boolean) ? totalsRow : undefined,
      });
      return {
        data: xls,
        contentType: "application/vnd.ms-excel",
        filename: `${baseName}.xls`,
      };
    }
    throw new BadRequestException(`Unsupported export format: ${format}`);
  }
}
