import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CATEGORIES, getReportDefinition, getReportDefinitions, AGE_GROUPS } from "./analysis/report-registry";
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
      throw new BadRequestException(`${label} is out of range (${MIN_REPORT_YEAR}-${MAX_REPORT_YEAR})`);
    }
  }

  private parseRange(from?: string, to?: string) {
    const range: { from?: Date; to?: Date } = {};
    if (from) {
      const d = new Date(from);
      if (isNaN(d.getTime())) throw new BadRequestException("Invalid from date");
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

  private dateWhere(tenantId: string, field: string, range: { from?: Date; to?: Date }) {
    const where: any = { tenantId };
    if (range.from || range.to) {
      where[field] = {};
      if (range.from) where[field].gte = range.from;
      if (range.to) where[field].lte = range.to;
    }
    return where;
  }

  async getSummary(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);

    const invWhere = this.dateWhere(tenantId, "issuedDate", range);
    invWhere.status = { not: "CANCELLED" };
    invWhere.type = { not: "PHARMACY" };

    const [invoices, appointments, patients, admissions, beds, doctors, labOrders, radiologyOrders, activeAdmits, overdueCount] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: invWhere,
          select: { totalAmount: true, paidAmount: true, status: true },
        }),
        this.prisma.appointment.count({
          where: this.dateWhere(tenantId, "appointmentDate", range),
        }),
        this.prisma.patient.count({
          where: range.from || range.to
            ? {
                tenantId,
                deletedAt: null,
                createdAt: { gte: range.from ?? undefined, lte: range.to ?? undefined },
              }
            : { tenantId, deletedAt: null },
        }),
        this.prisma.admission.count({
          where: this.dateWhere(tenantId, "admissionDate", range),
        }),
        this.prisma.bed.count({ where: { tenantId } }),
        this.prisma.doctorProfile.count({ where: { tenantId } }),
        this.prisma.labOrder.count({ where: this.dateWhere(tenantId, "orderedAt", range) }),
        this.prisma.radiologyOrder.count({ where: this.dateWhere(tenantId, "orderedAt", range) }),
        this.prisma.admission.count({
          where: { tenantId, status: { in: ["ADMITTED", "PENDING"] } },
        }),
        this.prisma.invoice.count({ where: { tenantId, status: "OVERDUE", type: { not: "PHARMACY" } } }),
      ]);

    const occupiedBeds = await this.prisma.bed.count({
      where: { tenantId, status: "OCCUPIED" },
    });

    const totalRevenue = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
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

  async revenueByStatus(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const where = this.dateWhere(tenantId, "issuedDate", range);
    where.status = { not: "CANCELLED" };
    where.type = { not: "PHARMACY" };
    const rows = await this.prisma.invoice.findMany({
      where,
      select: { status: true, totalAmount: true, paidAmount: true, dueAmount: true },
    });
    const byStatus: Record<string, { count: number; amount: number; collected: number }> = {};
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

  async appointmentsByStatus(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.appointment.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "startTime", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async admissionsByStatus(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.admission.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "admissionDate", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async labByStatus(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.labOrder.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "orderedAt", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async doctorWorkload(tenantId: string, params: { from?: string; to?: string } = {}) {
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
    const nameById = new Map(profiles.map((p) => [p.id, `${p.user.firstName} ${p.user.lastName}`.trim()]));
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
    const contains = s ? { contains: s, mode: "insensitive" as const } : undefined;
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
          select: { id: true, user: { select: { firstName: true, middleName: true, lastName: true } } },
          take: 500,
        });
        return docs
          .map((d) => ({
            value: d.id,
            label: [d.user.firstName, d.user.middleName, d.user.lastName].filter(Boolean).join(" "),
          }))
          .filter((d) => !s || d.label.toLowerCase().includes(s.toLowerCase()));
      }
      case "ward": {
        const wards = await this.prisma.ward.findMany({
          where: { tenantId, isActive: true, ...(contains ? { name: contains } : {}) },
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
          select: { id: true, firstName: true, middleName: true, lastName: true, mrn: true },
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
          select: { id: true, firstName: true, middleName: true, lastName: true, role: true },
          orderBy: { firstName: "asc" },
          take: 500,
        });
        return users
          .map((u) => ({
            value: u.id,
            label: [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" "),
          }))
          .filter((u) => !s || u.label.toLowerCase().includes(s.toLowerCase()));
      }
      case "branch": {
        const branches = await this.prisma.branch.findMany({
          where: { tenantId, isActive: true, ...(contains ? { name: contains } : {}) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        return branches.map((b) => ({ value: b.id, label: b.name }));
      }
      case "service": {
        const services = await this.prisma.billingService.findMany({
          where: { tenantId, isActive: true, ...(contains ? { name: contains } : {}) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });
        return services.map((sv) => ({ value: sv.id, label: sv.name }));
      }
      case "test": {
        const tests = await this.prisma.labTest.findMany({
          where: { tenantId, isActive: true, ...(contains ? { name: contains } : {}) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });
        return tests.map((t) => ({ value: t.id, label: t.name }));
      }
      case "account": {
        const accounts = await this.prisma.account.findMany({
          where: { tenantId, isActive: true, ...(contains ? { name: contains } : {}) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });
        return accounts.map((a) => ({ value: a.id, label: a.name }));
      }
      case "bed": {
        const beds = await this.prisma.bed.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, bedNumber: true, ward: { select: { name: true } } },
          orderBy: { bedNumber: "asc" },
          take: 500,
        });
        return beds.map((b) => ({
          value: b.id,
          label: `${b.bedNumber}${b.ward ? ` (${b.ward.name})` : ""}`,
        }));
      }
      case "paymentMode":
        return ["CASH", "CARD", "BANK", "ONLINE", "WALLET", "INSURANCE", "CREDIT", "OTHER"].map(
          (v) => ({ value: v, label: v.replace(/_/g, " ") }),
        );
      case "gender":
        return ["MALE", "FEMALE", "OTHER"].map((v) => ({ value: v, label: v }));
      case "ageGroup":
        return [...AGE_GROUPS, "Unknown"].map((v) => ({ value: v, label: v }));
      case "type":
        return [
          "OPD", "IPD", "EMERGENCY", "SPECIAL_OPD", "PROCEDURE", "SERVICE", "DISCHARGE",
          "LAB", "RADIOLOGY", "PHARMACY", "OT", "AMBULANCE", "FOLLOWUP",
        ].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
      case "status":
        return [
          "DRAFT", "PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED", "REFUNDED",
          "ADMITTED", "DISCHARGED", "DECEASED", "TRANSFERRED", "ORDERED", "RESULT_READY",
          "VERIFIED", "APPROVED", "REPORTED", "REQUESTED", "SCHEDULED", "COMPLETED", "IN_PROGRESS",
        ].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
      case "month":
        return Array.from({ length: 12 }, (_, i) => ({
          value: String(i + 1),
          label: new Date(2026, i, 1).toLocaleString("en-US", { month: "long" }),
        }));
      case "year": {
        const current = new Date().getFullYear();
        const years: FilterOption[] = [];
        for (let y = current; y >= current - 10; y--) years.push({ value: String(y), label: String(y) });
        return years;
      }
      default:
        return [];
    }
  }

  private resolveFilters(def: ReportDefinition, raw: Record<string, any>): ResolvedFilters {
    const filters: ResolvedFilters = { all: raw };
    const hasRange = def.filters.includes("fromDate") || def.filters.includes("toDate");
    if (hasRange) {
      if (raw.from !== undefined && raw.from !== null && raw.from !== "") {
        const from = new Date(raw.from);
        if (isNaN(from.getTime())) throw new BadRequestException("Invalid from date");
        this.assertDateInRange(from, "From date");
        filters.from = from;
      }
      if (raw.to !== undefined && raw.to !== null && raw.to !== "") {
        const to = new Date(raw.to);
        if (isNaN(to.getTime())) throw new BadRequestException("Invalid to date");
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
    if (month !== undefined && (Number.isNaN(month) || month < 1 || month > 12)) {
      throw new BadRequestException("Invalid month");
    }
    if (year !== undefined && (Number.isNaN(year) || year < MIN_REPORT_YEAR || year > MAX_REPORT_YEAR)) {
      throw new BadRequestException(`Invalid year (${MIN_REPORT_YEAR}-${MAX_REPORT_YEAR})`);
    }
    if (def.filters.includes("month") && def.filters.includes("year") && month && year && !filters.from && !filters.to) {
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
      if (raw[rawKey] !== undefined && raw[rawKey] !== null && raw[rawKey] !== "") {
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
    if (!executor) throw new BadRequestException("Report source not configured");
    const filters = this.resolveFilters(def, raw);
    const result = await executor({ prisma: this.prisma as unknown as PrismaLike, tenantId, filters });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, addressLine1: true, addressLine2: true, city: true, district: true, province: true, country: true },
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
        address: [tenant?.addressLine1, tenant?.addressLine2, tenant?.district].filter(Boolean).join(", ") || "",
        city: tenant?.city || tenant?.province || "",
      },
      user: user ? [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ") : "System",
    };

    const columns = result.columns ?? def.columns;
    const chart = result.chart
      ? {
          ...result.chart,
          labels: result.rows.map((r) => String(r[result.chart!.labelsKey] ?? "")),
          seriesData: Object.fromEntries(
            result.chart.series.map((s) => [s.key, result.rows.map((r) => Number(r[s.key]) || 0)]),
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

    await this.audit?.log?.(tenantId, userId, "REPORT", reportId, "GENERATE", { filters: raw });
    return generated;
  }

  private filterSummary(filters: ResolvedFilters, raw: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    const date = (d?: Date) => (d ? d.toISOString().slice(0, 10) : "");
    if (filters.from || filters.to) {
      out["Period"] = `${date(filters.from) || "start"} to ${date(filters.to) || "today"}`;
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
    const generated = await this.generateAnalysis(tenantId, userId, reportId, raw);
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
        if (c.type === "date") return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
        return String(v);
      }),
    );
    const headerRow = columns.map((c) => c.label);
    const totalsRow = columns.map((c) =>
      c.total && generated.totals[c.key] !== undefined ? Number(generated.totals[c.key]).toFixed(2) : "",
    );

    const baseName = def.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    if (format === "csv") {
      const { toCsv } = await import("../exports/pdf.util");
      const csv = toCsv([headerRow, ...displayRows, ...(totalsRow.some(Boolean) ? [totalsRow] : [])]);
      return { data: Buffer.from(`\uFEFF${csv}`, "utf8"), contentType: "text/csv; charset=utf-8", filename: `${baseName}.csv` };
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
        columns: columns.map((c) => ({ title: c.label, width: Math.max(1, Math.round(c.label.length * 0.8) + 4), align: c.align })),
        rows: displayRows,
        totalsRow: totalsRow.some(Boolean) ? totalsRow : undefined,
      });
      return { data: pdf, contentType: "application/pdf", filename: `${baseName}.pdf` };
    }
    if (format === "xls") {
      const { buildReportXls } = await import("./analysis/report-exports");
      const xls = buildReportXls({
        title,
        subtitle,
        columns: columns.map((c) => ({ key: c.key, title: c.label, type: c.type })),
        rows: generated.rows,
        totalsRow: totalsRow.some(Boolean) ? totalsRow : undefined,
      });
      return { data: xls, contentType: "application/vnd.ms-excel", filename: `${baseName}.xls` };
    }
    throw new BadRequestException(`Unsupported export format: ${format}`);
  }
}
