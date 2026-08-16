import type { ExecContext, PrismaLike, ResolvedFilters } from "./report.types";

export const money = (v: any): number =>
  v === null || v === undefined || v === "" ? 0 : Number(v);

export const r2 = (v: number): number => Math.round(v * 100) / 100;

export const pct1 = (n: number, d: number): string =>
  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0%";

export function fullName(p: any): string {
  if (!p) return "-";
  const parts = [p.firstName, p.middleName, p.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : p.name || p.id || "-";
}

export function userName(u: any): string {
  if (!u) return "-";
  const parts = [u.firstName, u.middleName, u.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : u.name || u.email || u.id || "-";
}

export function doctorName(d: any): string {
  if (!d) return "-";
  return userName(d.user || d);
}

export function uhid(p: any): string {
  return p?.mrn || p?.uid || "-";
}

export function dateKey(d: Date | undefined): string {
  if (!d) return "-";
  return d.toISOString().slice(0, 10);
}

export function monthKey(d: Date | undefined): string {
  if (!d) return "-";
  return d.toISOString().slice(0, 7);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTHS[m - 1] || m} ${y}`;
}

export function applyRange(field: string, filters: ResolvedFilters): any | undefined {
  const w: any = {};
  if (filters.from) w.gte = filters.from;
  if (filters.to) w.lte = filters.to;
  return Object.keys(w).length ? w : undefined;
}

export function patientSearch(search?: string): any | undefined {
  if (!search) return undefined;
  const contains = { contains: search, mode: "insensitive" as const };
  return {
    OR: [
      { firstName: contains },
      { middleName: contains },
      { lastName: contains },
      { mrn: contains },
      { uid: contains },
    ],
  };
}

export interface ItemFin {
  gross: number;
  discount: number;
  tax: number;
  net: number;
  paid: number;
  outstanding: number;
}

export function itemFinance(inv: any, item: any): ItemFin {
  const gross = money(item.lineTotal);
  const sub = money(inv.subtotal);
  const items: any[] = inv.items || [];
  const share = sub > 0 ? gross / sub : items.length ? 1 / items.length : 0;
  const discount = money(inv.discountAmount) * share;
  const tax = money(inv.taxAmount) * share;
  const net = gross - discount + tax;
  const total = money(inv.totalAmount);
  const paidShare = total > 0 ? money(inv.paidAmount) / total : 0;
  const paid = net * paidShare;
  const outstanding = net - paid;
  return { gross, discount, tax, net, paid, outstanding };
}

export function itemFreeAmount(item: any): number {
  return money(item.rate) <= 0 ? money(item.lineTotal) : 0;
}

export const PATIENT_SELECT = {
  select: {
    id: true,
    mrn: true,
    uid: true,
    firstName: true,
    middleName: true,
    lastName: true,
    gender: true,
    dateOfBirth: true,
    age: true,
    city: true,
    district: true,
    province: true,
    country: true,
  },
};

export function invoiceWhere(ctx: ExecContext, extra: any = {}): any {
  const where: any = { tenantId: ctx.tenantId, status: { not: "CANCELLED" } };
  const r = applyRange("issuedDate", ctx.filters);
  if (r) where.issuedDate = r;
  const ps = patientSearch(ctx.filters.search);
  if (ps) where.patient = ps;
  Object.assign(where, extra);
  return where;
}

export async function fetchInvoices(ctx: ExecContext, extra: any = {}): Promise<any[]> {
  return ctx.prisma.invoice.findMany({
    where: invoiceWhere(ctx, extra),
    include: { items: true, patient: PATIENT_SELECT },
    orderBy: { issuedDate: "desc" },
  });
}

export async function refundByInvoice(
  prisma: PrismaLike,
  tenantId: string,
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!invoiceIds.length) return m;
  const refunds = await prisma.refund.findMany({
    where: { tenantId, invoiceId: { in: invoiceIds }, status: "COMPLETED" },
    select: { invoiceId: true, amount: true },
  });
  for (const r of refunds) {
    m.set(r.invoiceId, (m.get(r.invoiceId) || 0) + money(r.amount));
  }
  return m;
}

export async function deptNames(
  prisma: PrismaLike,
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return m;
  const depts = await prisma.department.findMany({
    where: { tenantId, id: { in: uniq } },
    select: { id: true, name: true },
  });
  for (const d of depts) m.set(d.id, d.name);
  return m;
}

export async function doctorNames(
  prisma: PrismaLike,
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return m;
  const docs = await prisma.doctorProfile.findMany({
    where: { tenantId, id: { in: uniq } },
    select: {
      id: true,
      user: { select: { firstName: true, middleName: true, lastName: true } },
    },
  });
  for (const d of docs) m.set(d.id, userName(d.user));
  return m;
}

export async function userNames(prisma: any, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return m;
  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: uniq } },
    select: { id: true, firstName: true, middleName: true, lastName: true },
  });
  for (const u of users) m.set(u.id, userName(u));
  return m;
}

export async function wardByAdmission(
  prisma: PrismaLike,
  tenantId: string,
  admissionIds: string[],
): Promise<Map<string, { ward: string; bed: string }>> {
  const m = new Map<string, { ward: string; bed: string }>();
  const uniq = [...new Set(admissionIds.filter(Boolean))];
  if (!uniq.length) return m;
  const allocs = await prisma.bedAllocation.findMany({
    where: { tenantId, admissionId: { in: uniq }, status: { in: ["OCCUPIED", "AVAILABLE", "RESERVED"] } },
    include: { bed: { select: { bedNumber: true, ward: { select: { name: true } } } } },
    orderBy: { allocatedAt: "desc" },
  });
  for (const a of allocs) {
    if (!m.has(a.admissionId)) {
      m.set(a.admissionId, {
        ward: a.bed?.ward?.name || "-",
        bed: a.bed?.bedNumber || "-",
      });
    }
  }
  return m;
}

export function sumBy<K>(rows: Record<string, any>[], key: (r: Record<string, any>) => K): Map<K, Record<string, any>> {
  const m = new Map<K, Record<string, any>>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k) || {};
    for (const [col, v] of Object.entries(r)) {
      if (typeof v === "number" && col !== "count") {
        cur[col] = money(cur[col]) + v;
      }
    }
    m.set(k, cur);
  }
  return m;
}

export function sortRows<T extends Record<string, any>>(rows: T[], by: string, desc = true): T[] {
  return [...rows].sort((a, b) => {
    const av = a[by];
    const bv = b[by];
    if (typeof av === "number" && typeof bv === "number") {
      return desc ? bv - av : av - bv;
    }
    return desc
      ? String(bv || "").localeCompare(String(av || ""))
      : String(av || "").localeCompare(String(bv || ""));
  });
}

export function sumOf(rows: any[], key: string): number {
  return rows.reduce((s, r) => s + (Number(r?.[key]) || 0), 0);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (24 * 3600 * 1000)));
}
