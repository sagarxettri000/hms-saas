import type { ExecContext, ExecResult, PrismaLike } from "./report.types";
import { ageGroupOf } from "./report-registry";
import {
  money,
  r2,
  pct1,
  fullName,
  userName,
  doctorName,
  uhid,
  dateKey,
  monthKey,
  monthLabel,
  applyRange,
  PATIENT_SELECT,
  invoiceWhere,
  fetchInvoices,
  itemFinance,
  deptNames,
  doctorNames,
  wardByAdmission,
  sortRows,
  sumOf,
  daysBetween,
} from "./report-utils";

const ENC_SELECT = {
  patientId: true,
  doctorId: true,
  departmentId: true,
  type: true,
  createdAt: true,
  patient: PATIENT_SELECT,
  department: { select: { name: true } },
};

function encounterWhere(ctx: ExecContext): any {
  const where: any = { tenantId: ctx.tenantId };
  const r = applyRange("createdAt", ctx.filters);
  if (r) where.createdAt = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;
  if (ctx.filters.doctorId) where.doctorId = ctx.filters.doctorId;
  return where;
}

function fetchEncounters(ctx: ExecContext): Promise<any[]> {
  return ctx.prisma.encounter.findMany({ where: encounterWhere(ctx), select: ENC_SELECT });
}

async function returningIds(
  prisma: PrismaLike,
  tenantId: string,
  patientIds: string[],
  before: Date | undefined,
): Promise<Set<string>> {
  if (!before || !patientIds.length) return new Set<string>();
  const prior = await prisma.encounter.findMany({
    where: { tenantId, patientId: { in: patientIds }, createdAt: { lt: before } },
    select: { patientId: true },
    distinct: ["patientId"],
  });
  return new Set(prior.map((e) => e.patientId));
}

function countByGender(encs: any[]): { male: number; female: number; other: number } {
  let male = 0;
  let female = 0;
  let other = 0;
  for (const e of encs) {
    const g = e.patient?.gender;
    if (g === "MALE") male++;
    else if (g === "FEMALE") female++;
    else other++;
  }
  return { male, female, other };
}

async function bedsPerDept(prisma: PrismaLike, tenantId: string): Promise<Map<string | null, number>> {
  const wards = await prisma.ward.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, departmentId: true },
  });
  const wardToDept = new Map(wards.map((w) => [w.id, w.departmentId]));
  const beds = await prisma.bed.findMany({
    where: { tenantId, isActive: true },
    select: { wardId: true },
  });
  const m = new Map<string | null, number>();
  for (const b of beds) {
    const dept = wardToDept.get(b.wardId) ?? null;
    m.set(dept, (m.get(dept) || 0) + 1);
  }
  return m;
}

export async function deptWiseStats(ctx: ExecContext): Promise<ExecResult> {
  const encounters = await fetchEncounters(ctx);
  const patientIds = [...new Set(encounters.map((e) => e.patientId))];
  const returning = await returningIds(ctx.prisma, ctx.tenantId, patientIds, ctx.filters.from);

  const byDept = new Map<string, { id: string; total: number; newP: number; returningP: number; male: number; female: number; opd: number; ipd: number; services: number }>();
  const deptIds = new Set<string>();
  const seen = new Set<string>();
  for (const e of encounters) {
    const deptId = e.departmentId || "none";
    deptIds.add(deptId);
    const cur = byDept.get(deptId) || { id: deptId, total: 0, newP: 0, returningP: 0, male: 0, female: 0, opd: 0, ipd: 0, services: 0 };
    const g = e.patient?.gender;
    if (g === "MALE") cur.male++;
    else if (g === "FEMALE") cur.female++;
    if (e.type === "OPD") cur.opd++;
    else if (e.type === "IPD") cur.ipd++;
    if (!returning.has(e.patientId) && !seen.has(e.patientId)) cur.newP++;
    else cur.returningP++;
    seen.add(e.patientId);
    cur.total++;
    cur.services++;
    byDept.set(deptId, cur);
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byDept.values()].map((v) => ({
    department: v.id === "none" ? "-" : deptMap.get(v.id) || "-",
    totalPatients: v.total,
    newPatients: v.newP,
    followups: v.returningP,
    male: v.male,
    female: v.female,
    opd: v.opd,
    ipd: v.ipd,
    totalServices: v.services,
  }));

  const sorted = sortRows(rows, "totalPatients");
  return {
    rows: sorted,
    totals: {
      totalPatients: rows.reduce((s, r) => s + r.totalPatients, 0),
      newPatients: rows.reduce((s, r) => s + r.newPatients, 0),
      followups: rows.reduce((s, r) => s + r.followups, 0),
      male: rows.reduce((s, r) => s + r.male, 0),
      female: rows.reduce((s, r) => s + r.female, 0),
      opd: rows.reduce((s, r) => s + r.opd, 0),
      ipd: rows.reduce((s, r) => s + r.ipd, 0),
      totalServices: rows.reduce((s, r) => s + r.totalServices, 0),
    },
    cards: [
      { label: "Total Patients", value: rows.reduce((s, r) => s + r.totalPatients, 0) },
      { label: "New", value: rows.reduce((s, r) => s + r.newPatients, 0) },
      { label: "Follow-up", value: rows.reduce((s, r) => s + r.followups, 0) },
    ],
    chart: { type: "bar", labelsKey: "department", series: [{ key: "totalPatients", label: "Patients" }] },
  };
}

export async function dateDayWiseStats(ctx: ExecContext): Promise<ExecResult> {
  const encounters = await fetchEncounters(ctx);
  const patientIds = [...new Set(encounters.map((e) => e.patientId))];
  const returning = await returningIds(ctx.prisma, ctx.tenantId, patientIds, ctx.filters.from);

  const byDate = new Map<string, { date: string; newP: number; returningP: number; opd: number; ipd: number; emergency: number; total: number }>();
  const seen = new Set<string>();
  for (const e of encounters) {
    const day = dateKey(e.createdAt);
    const cur = byDate.get(day) || { date: day, newP: 0, returningP: 0, opd: 0, ipd: 0, emergency: 0, total: 0 };
    if (!returning.has(e.patientId) && !seen.has(e.patientId)) cur.newP++;
    else cur.returningP++;
    if (e.type === "OPD") cur.opd++;
    else if (e.type === "IPD") cur.ipd++;
    else if (e.type === "EMERGENCY") cur.emergency++;
    cur.total++;
    byDate.set(day, cur);
    seen.add(e.patientId);
  }

  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const t = (k: string) => sumOf(rows, k);
  return {
    rows,
    totals: { newPatients: t("newP"), returning: t("returningP"), opd: t("opd"), ipd: t("ipd"), emergency: t("emergency"), total: t("total") },
    cards: [
      { label: "Total Visits", value: t("total") },
      { label: "New", value: t("newP") },
      { label: "Returning", value: t("returningP") },
    ],
    chart: { type: "trend", labelsKey: "date", series: [{ key: "total", label: "Visits" }] },
  };
}

export async function monthWiseStats(ctx: ExecContext): Promise<ExecResult> {
  const encounters = await fetchEncounters(ctx);

  const admWhere: any = { tenantId: ctx.tenantId };
  const admR = applyRange("admissionDate", ctx.filters);
  if (admR) admWhere.admissionDate = admR;
  if (ctx.filters.departmentId) admWhere.departmentId = ctx.filters.departmentId;
  const admissions = await ctx.prisma.admission.findMany({
    where: admWhere,
    select: { admissionDate: true, status: true },
  });

  const invWhere = invoiceWhere(ctx, {});
  const invoices = await ctx.prisma.invoice.findMany({
    where: invWhere,
    select: { issuedDate: true, totalAmount: true },
  });

  const months = new Map<string, { month: string; patients: number; opd: number; ipd: number; emergency: number; admissions: number; discharges: number; revenue: number }>();
  const get = (key: string) => {
    let cur = months.get(key);
    if (!cur) {
      cur = { month: monthLabel(key), patients: 0, opd: 0, ipd: 0, emergency: 0, admissions: 0, discharges: 0, revenue: 0 };
      months.set(key, cur);
    }
    return cur;
  };

  const patientSeen = new Set<string>();
  for (const e of encounters) {
    const key = monthKey(e.createdAt);
    const cur = get(key);
    if (!patientSeen.has(e.patientId)) {
      cur.patients++;
      patientSeen.add(e.patientId);
    }
    if (e.type === "OPD") cur.opd++;
    else if (e.type === "IPD") cur.ipd++;
    else if (e.type === "EMERGENCY") cur.emergency++;
  }
  for (const a of admissions) {
    const cur = get(monthKey(a.admissionDate));
    cur.admissions++;
    if (a.status === "DISCHARGED") cur.discharges++;
  }
  for (const i of invoices) {
    const cur = get(monthKey(i.issuedDate));
    cur.revenue += money(i.totalAmount);
  }

  const rows = [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, v]) => ({ ...v, revenue: r2(v.revenue) }));

  const t = (k: string) => sumOf(rows, k);
  return {
    rows,
    totals: { patients: t("patients"), opd: t("opd"), ipd: t("ipd"), emergency: t("emergency"), admissions: t("admissions"), discharges: t("discharges"), revenue: r2(t("revenue")) },
    cards: [
      { label: "Patients", value: t("patients") },
      { label: "Admissions", value: t("admissions") },
      { label: "Revenue", value: r2(t("revenue")) },
    ],
    chart: { type: "trend", labelsKey: "month", series: [{ key: "patients", label: "Patients" }, { key: "admissions", label: "Admissions" }] },
  };
}

async function geographical(ctx: ExecContext, kind: "opd" | "ipd"): Promise<ExecResult> {
  let patients: any[];
  if (kind === "opd") {
    const encounters = await fetchEncounters(ctx);
    const ids = [...new Set(encounters.map((e) => e.patientId))];
    patients = ids.length
      ? await ctx.prisma.patient.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: PATIENT_SELECT.select })
      : [];
  } else {
    const where: any = { tenantId: ctx.tenantId };
    const r = applyRange("admissionDate", ctx.filters);
    if (r) where.admissionDate = r;
    const admissions = await ctx.prisma.admission.findMany({ where, select: { patientId: true } });
    const ids = [...new Set(admissions.map((a) => a.patientId))];
    patients = ids.length
      ? await ctx.prisma.patient.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: PATIENT_SELECT.select })
      : [];
  }

  const byGeo = new Map<string, Record<string, any>>();
  for (const p of patients) {
    const key = `${p.country || "Nepal"}|${p.province || "-"}|${p.district || "-"}|${p.city || "-"}`;
    const cur = byGeo.get(key) || {
      country: p.country || "Nepal",
      province: p.province || "-",
      district: p.district || "-",
      city: p.city || "-",
      count: 0,
      percent: "-",
    };
    cur.count += 1;
    byGeo.set(key, cur);
  }

  const rows = [...byGeo.values()].sort((a, b) => b.count - a.count);
  const total = rows.reduce((s, r) => s + r.count, 0);
  for (const r of rows) r.percent = pct1(r.count, total);

  return {
    rows,
    totals: { count: total },
    cards: [{ label: "Patients", value: total }, { label: "Locations", value: rows.length }],
  };
}

export function geographicalStats(ctx: ExecContext): Promise<ExecResult> {
  return geographical(ctx, "opd");
}

export function geographicalStatsIp(ctx: ExecContext): Promise<ExecResult> {
  return geographical(ctx, "ipd");
}

async function ageClassified(ctx: ExecContext, kind: "opd" | "ipd"): Promise<ExecResult> {
  const byKey = new Map<string, Record<string, any>>();
  const deptIds = new Set<string>();

  if (kind === "opd") {
    const encounters = await fetchEncounters(ctx);
    for (const e of encounters) {
      const deptId = e.departmentId || "none";
      deptIds.add(deptId);
      const group = ageGroupOf(e.patient?.dateOfBirth) || (e.patient?.age ? ageGroupOfAge(e.patient.age) : "Unknown");
      const key = `${deptId}|${group}`;
      const cur = byKey.get(key) || { departmentId: deptId, ageGroup: group, male: 0, female: 0, other: 0, total: 0 };
      const g = e.patient?.gender;
      if (g === "MALE") cur.male++;
      else if (g === "FEMALE") cur.female++;
      else cur.other++;
      cur.total++;
      byKey.set(key, cur);
    }
  } else {
    const where: any = { tenantId: ctx.tenantId };
    const r = applyRange("admissionDate", ctx.filters);
    if (r) where.admissionDate = r;
    if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;
    const admissions = await ctx.prisma.admission.findMany({
      where,
      include: { patient: { select: { gender: true, dateOfBirth: true, age: true } } },
    });
    for (const a of admissions) {
      const deptId = a.departmentId || "none";
      deptIds.add(deptId);
      const group = ageGroupOf(a.patient?.dateOfBirth) || (a.patient?.age ? ageGroupOfAge(a.patient.age) : "Unknown");
      const key = `${deptId}|${group}`;
      const cur = byKey.get(key) || { departmentId: deptId, ageGroup: group, male: 0, female: 0, other: 0, total: 0 };
      const g = a.patient?.gender;
      if (g === "MALE") cur.male++;
      else if (g === "FEMALE") cur.female++;
      else cur.other++;
      cur.total++;
      byKey.set(key, cur);
    }
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byKey.values()].map((v) => ({
    department: v.departmentId === "none" ? "-" : deptMap.get(v.departmentId) || "-",
    ageGroup: v.ageGroup,
    male: v.male,
    female: v.female,
    other: v.other,
    total: v.total,
  }));

  const sorted = sortRows(rows, "total");
  const t = (k: string) => sumOf(rows, k);
  return {
    rows: sorted,
    totals: { male: t("male"), female: t("female"), other: t("other"), total: t("total") },
    cards: [
      { label: "Patients", value: t("total") },
      { label: "Male", value: t("male") },
      { label: "Female", value: t("female") },
    ],
  };
}

function ageGroupOfAge(age: number): string {
  if (age <= 5) return "0-5";
  if (age <= 12) return "6-12";
  if (age <= 18) return "13-18";
  if (age <= 30) return "19-30";
  if (age <= 45) return "31-45";
  if (age <= 60) return "46-60";
  return "61+";
}

export function deptAgeClassified(ctx: ExecContext): Promise<ExecResult> {
  return ageClassified(ctx, "opd");
}

export function deptAgeClassifiedIp(ctx: ExecContext): Promise<ExecResult> {
  return ageClassified(ctx, "ipd");
}

async function inpatientStats(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  const r = applyRange("admissionDate", ctx.filters);
  if (r) where.admissionDate = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;
  const admissions = await ctx.prisma.admission.findMany({
    where,
    include: {
      patient: { select: { gender: true } },
      bedAllocations: { select: { id: true } },
    },
  });

  const deptIds = [...new Set(admissions.map((a) => a.departmentId).filter(Boolean))] as string[];
  const [deptMap, bedMap] = await Promise.all([
    deptNames(ctx.prisma, ctx.tenantId, deptIds),
    bedsPerDept(ctx.prisma, ctx.tenantId),
  ]);

  const from = ctx.filters.from;
  const to = ctx.filters.to;
  const periodDays = Math.max(1, from && to ? daysBetween(from, to) + 1 : 30);

  const byDept = new Map<string, Record<string, any>>();
  const patients = new Map<string, Set<string>>();
  for (const a of admissions) {
    const deptId = a.departmentId || "none";
    const cur = byDept.get(deptId) || {
      departmentId: deptId,
      admissions: 0,
      discharges: 0,
      deaths: 0,
      transfers: 0,
      patients: 0,
      bedDays: 0,
    };
    cur.admissions++;
    if (a.status === "DISCHARGED") cur.discharges++;
    if (a.status === "DECEASED") cur.deaths++;
    if (a.status === "TRANSFERRED") cur.transfers++;
    const end = a.dischargeDate && a.isDischarged ? a.dischargeDate : new Date();
    cur.bedDays += daysBetween(a.admissionDate, end);
    byDept.set(deptId, cur);
    if (!patients.has(deptId)) patients.set(deptId, new Set());
    patients.get(deptId)!.add(a.patientId);
  }

  const rows = [...byDept.values()].map((v) => {
    const patientsCount = patients.get(v.departmentId)?.size || 0;
    const beds = bedMap.get(v.departmentId === "none" ? null : v.departmentId) || 0;
    const avgStay = v.admissions ? v.bedDays / v.admissions : 0;
    const capacity = beds * periodDays;
    return {
      department: v.departmentId === "none" ? "-" : deptMap.get(v.departmentId) || "-",
      admissions: v.admissions,
      discharges: v.discharges,
      deaths: v.deaths,
      transfers: v.transfers,
      patients: patientsCount,
      avgStay: Math.round(avgStay * 10) / 10,
      bedUsage: v.bedDays,
      occupancy: pct1(v.bedDays, capacity),
    };
  });

  const sorted = sortRows(rows, "admissions");
  return {
    rows: sorted,
    totals: {
      admissions: rows.reduce((s, r) => s + r.admissions, 0),
      discharges: rows.reduce((s, r) => s + r.discharges, 0),
      deaths: rows.reduce((s, r) => s + r.deaths, 0),
      transfers: rows.reduce((s, r) => s + r.transfers, 0),
      patients: rows.reduce((s, r) => s + r.patients, 0),
      bedUsage: rows.reduce((s, r) => s + r.bedUsage, 0),
    },
    cards: [
      { label: "Admissions", value: rows.reduce((s, r) => s + r.admissions, 0) },
      { label: "Discharges", value: rows.reduce((s, r) => s + r.discharges, 0) },
      { label: "Patients", value: rows.reduce((s, r) => s + r.patients, 0) },
    ],
  };
}

export function deptWiseStatsIp(ctx: ExecContext): Promise<ExecResult> {
  return inpatientStats(ctx);
}

export function periodicalInpatientStats(ctx: ExecContext): Promise<ExecResult> {
  return inpatientStats(ctx);
}

export async function patientAnalysis(ctx: ExecContext): Promise<ExecResult> {
  const encounters = await fetchEncounters(ctx);
  const patientIds = [...new Set(encounters.map((e) => e.patientId))];
  const returning = await returningIds(ctx.prisma, ctx.tenantId, patientIds, ctx.filters.from);

  const byDept = new Map<string, Record<string, any>>();
  const deptIds = new Set<string>();
  const seen = new Set<string>();
  for (const e of encounters) {
    const deptId = e.departmentId || "none";
    deptIds.add(deptId);
    const cur = byDept.get(deptId) || {
      departmentId: deptId,
      total: 0,
      newP: 0,
      returningP: 0,
      male: 0,
      female: 0,
      opd: 0,
      ipd: 0,
      emergency: 0,
    };
    const g = e.patient?.gender;
    if (g === "MALE") cur.male++;
    else if (g === "FEMALE") cur.female++;
    if (e.type === "OPD") cur.opd++;
    else if (e.type === "IPD") cur.ipd++;
    else if (e.type === "EMERGENCY") cur.emergency++;
    if (!returning.has(e.patientId) && !seen.has(e.patientId)) cur.newP++;
    else cur.returningP++;
    seen.add(e.patientId);
    cur.total++;
    byDept.set(deptId, cur);
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byDept.values()].map((v) => ({
    department: v.departmentId === "none" ? "-" : deptMap.get(v.departmentId) || "-",
    total: v.total,
    newPatients: v.newP,
    returning: v.returningP,
    male: v.male,
    female: v.female,
    opd: v.opd,
    ipd: v.ipd,
    emergency: v.emergency,
  }));

  const sorted = sortRows(rows, "total");
  const t = (k: string) => sumOf(rows, k);
  return {
    rows: sorted,
    totals: { total: t("total"), newPatients: t("newPatients"), returning: t("returning"), male: t("male"), female: t("female"), opd: t("opd"), ipd: t("ipd"), emergency: t("emergency") },
    cards: [
      { label: "Total", value: t("total") },
      { label: "New", value: t("newPatients") },
      { label: "Returning", value: t("returning") },
    ],
  };
}

export async function erStatistics(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  const r = applyRange("createdAt", ctx.filters);
  if (r) where.createdAt = r;
  const cases = await ctx.prisma.emergencyCase.findMany({
    where,
    include: { patient: PATIENT_SELECT },
    orderBy: { createdAt: "desc" },
  });

  const rows = cases.map((c) => {
    const age = c.patient?.dateOfBirth
      ? daysBetween(c.patient.dateOfBirth, new Date()) / 365
      : c.patient?.age || null;
    return {
      date: c.createdAt,
      patient: fullName(c.patient),
      age: age !== null ? Math.round(age) : "-",
      gender: c.patient?.gender || "-",
      chiefComplaint: c.chiefComplaint || "-",
      triageLevel: c.triageLevel || "-",
      admitted: c.admitted ? "Yes" : "No",
      disposition: c.admitted ? (c.admittedTo || "Admitted") : c.dischargedAt ? "Discharged" : "Under Care",
    };
  });

  const admitted = cases.filter((c) => c.admitted).length;
  return {
    rows,
    cards: [
      { label: "ER Cases", value: rows.length },
      { label: "Admissions from ER", value: admitted },
    ],
  };
}

async function census(ctx: ExecContext, detailed: boolean): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId, status: { in: ["ADMITTED", "PENDING"] } };
  const r = applyRange("admissionDate", ctx.filters);
  if (r) where.admissionDate = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;

  const admissions = await ctx.prisma.admission.findMany({
    where,
    include: {
      patient: { select: { gender: true } },
      bedAllocations: {
        where: { status: "OCCUPIED" },
        select: { bedId: true, bed: { select: { ward: { select: { name: true, departmentId: true } } } } },
      },
    },
  });

  const deptIds = [...new Set(admissions.map((a) => a.departmentId).filter(Boolean))] as string[];
  const [deptMap, bedMap] = await Promise.all([
    deptNames(ctx.prisma, ctx.tenantId, deptIds),
    bedsPerDept(ctx.prisma, ctx.tenantId),
  ]);

  const byDept = new Map<string, Record<string, any>>();
  const patients = new Map<string, Set<string>>();
  const beds = new Map<string, Set<string>>();
  const wards = new Map<string, Set<string>>();
  for (const a of admissions) {
    const deptId = a.departmentId || "none";
    const cur = byDept.get(deptId) || { departmentId: deptId, male: 0, female: 0 };
    const g = a.patient?.gender;
    if (g === "MALE") cur.male++;
    else if (g === "FEMALE") cur.female++;
    byDept.set(deptId, cur);
    if (!patients.has(deptId)) patients.set(deptId, new Set());
    patients.get(deptId)!.add(a.patientId);
    if (!beds.has(deptId)) beds.set(deptId, new Set());
    if (!wards.has(deptId)) wards.set(deptId, new Set());
    for (const ba of a.bedAllocations) {
      beds.get(deptId)!.add(ba.bedId);
      if (ba.bed?.ward?.name) wards.get(deptId)!.add(ba.bed.ward.name);
    }
  }

  const rows = [...byDept.values()].map((v) => {
    const deptId = v.departmentId;
    const totalBeds = bedMap.get(deptId === "none" ? null : deptId) || 0;
    const occupied = beds.get(deptId)?.size || 0;
    const row: Record<string, any> = {
      department: deptId === "none" ? "-" : deptMap.get(deptId) || "-",
      patients: patients.get(deptId)?.size || 0,
      bedsOccupied: occupied,
      ward: [...(wards.get(deptId) || [])].join(", ") || "-",
      male: v.male,
      female: v.female,
    };
    if (detailed) {
      row.totalBeds = totalBeds;
      row.occupied = occupied;
      row.available = Math.max(0, totalBeds - occupied);
      row.occupancyPct = pct1(occupied, totalBeds);
    }
    return row;
  });

  const sorted = sortRows(rows, "patients");
  const t = (k: string) => sumOf(rows, k);
  const totals: Record<string, number> = { patients: t("patients"), bedsOccupied: t("bedsOccupied"), male: t("male"), female: t("female") };
  if (detailed) {
    totals.totalBeds = t("totalBeds");
    totals.occupied = t("occupied");
    totals.available = t("available");
  }
  return {
    rows: sorted,
    totals,
    cards: [
      { label: "Census", value: t("patients") },
      { label: "Beds Occupied", value: t("bedsOccupied") },
      { label: "Male", value: t("male") },
      { label: "Female", value: t("female") },
    ],
  };
}

export function deptCensus(ctx: ExecContext): Promise<ExecResult> {
  return census(ctx, false);
}

export function deptCensusNew(ctx: ExecContext): Promise<ExecResult> {
  return census(ctx, true);
}

export async function patientAnalysisDoctor(ctx: ExecContext): Promise<ExecResult> {
  const encounters = await fetchEncounters(ctx);
  const patientIds = [...new Set(encounters.map((e) => e.patientId))];
  const returning = await returningIds(ctx.prisma, ctx.tenantId, patientIds, ctx.filters.from);

  const byDoc = new Map<string, Record<string, any>>();
  const docIds = new Set<string>();
  const seen = new Set<string>();
  for (const e of encounters) {
    if (!e.doctorId) continue;
    const docId = e.doctorId;
    docIds.add(docId);
    const cur = byDoc.get(docId) || { doctorId: docId, newP: 0, returningP: 0, opd: 0, ipd: 0, total: 0 };
    if (e.type === "OPD") cur.opd++;
    else if (e.type === "IPD") cur.ipd++;
    if (!returning.has(e.patientId) && !seen.has(e.patientId)) cur.newP++;
    else cur.returningP++;
    cur.total++;
    byDoc.set(docId, cur);
    seen.add(e.patientId);
  }

  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, [...docIds]);
  const docs = await ctx.prisma.doctorProfile.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...docIds] } },
    select: { id: true, departmentId: true },
  });
  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...new Set(docs.map((d) => d.departmentId).filter(Boolean))]);

  const rows = [...byDoc.values()].map((v) => {
    const doc = docs.find((d) => d.id === v.doctorId);
    return {
      doctor: docMap.get(v.doctorId) || v.doctorId,
      department: doc?.departmentId ? deptMap.get(doc.departmentId) || "-" : "-",
      newPatients: v.newP,
      returning: v.returningP,
      opd: v.opd,
      ipd: v.ipd,
      total: v.total,
    };
  });

  const sorted = sortRows(rows, "total");
  const t = (k: string) => sumOf(rows, k);
  return {
    rows: sorted,
    totals: { newPatients: t("newPatients"), returning: t("returning"), opd: t("opd"), ipd: t("ipd"), total: t("total") },
    cards: [
      { label: "Patients", value: t("total") },
      { label: "New", value: t("newPatients") },
      { label: "Returning", value: t("returning") },
    ],
  };
}

export async function dischargeRecordSheet(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId, isDischarged: true };
  const r = applyRange("dischargeDate", ctx.filters);
  if (r) where.dischargeDate = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;

  const admissions = await ctx.prisma.admission.findMany({
    where,
    include: {
      patient: PATIENT_SELECT,
      bedAllocations: {
        where: { status: { in: ["OCCUPIED", "AVAILABLE", "RESERVED"] } },
        include: { bed: { select: { bedNumber: true, ward: { select: { name: true } } } } },
        orderBy: { allocatedAt: "desc" },
        take: 1,
      },
      invoices: { select: { dueAmount: true, totalAmount: true, status: true } },
    },
    orderBy: { dischargeDate: "desc" },
  });

  const docIds = [...new Set(admissions.map((a) => a.admittingDoctorId).filter(Boolean))] as string[];
  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, docIds);

  const rows = admissions.map((a) => {
    const outstanding = a.invoices.reduce((s: number, i: any) => s + money(i.dueAmount), 0);
    return {
      patient: fullName(a.patient),
      uhid: uhid(a.patient),
      admissionNumber: a.admissionNumber,
      admissionDate: a.admissionDate,
      dischargeDate: a.dischargeDate,
      ward: a.bedAllocations?.[0]?.bed?.ward?.name || "-",
      bed: a.bedAllocations?.[0]?.bed?.bedNumber || "-",
      doctor: a.admittingDoctorId ? docMap.get(a.admittingDoctorId) || "-" : "-",
      diagnosis: a.finalDiagnosis || a.primaryDiagnosis || a.provisionalDiagnosis || "-",
      dischargeType: a.dischargeType || "-",
      billingStatus: outstanding > 0 ? "OUTSTANDING" : a.invoices.length ? "SETTLED" : "-",
    };
  });

  return {
    rows,
    cards: [{ label: "Discharges", value: rows.length }],
  };
}

export async function patientDetailOpd(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId, type: "OPD" };
  const r = applyRange("createdAt", ctx.filters);
  if (r) where.createdAt = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;
  if (ctx.filters.doctorId) where.doctorId = ctx.filters.doctorId;
  if (ctx.filters.patientId) where.patientId = ctx.filters.patientId;

  const encounters = await ctx.prisma.encounter.findMany({
    where,
    include: {
      patient: PATIENT_SELECT,
      department: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const encIds = encounters.map((e) => e.id);
  const invoices = encIds.length
    ? await ctx.prisma.invoice.findMany({
        where: { tenantId: ctx.tenantId, encounterId: { in: encIds }, status: { not: "CANCELLED" } },
        select: { encounterId: true, totalAmount: true, items: { select: { id: true } } },
      })
    : [];
  const invByEnc = new Map<string, { billing: number; services: number }>();
  for (const i of invoices) {
    const cur = invByEnc.get(i.encounterId) || { billing: 0, services: 0 };
    cur.billing += money(i.totalAmount);
    cur.services += (i.items || []).length;
    invByEnc.set(i.encounterId, cur);
  }

  const docIds = [...new Set(encounters.map((e) => e.doctorId).filter(Boolean))] as string[];
  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, docIds);

  const rows = encounters.map((e) => {
    const inv = invByEnc.get(e.id) || { billing: 0, services: 0 };
    return {
      date: e.createdAt,
      uhid: uhid(e.patient),
      patient: fullName(e.patient),
      doctor: e.doctorId ? docMap.get(e.doctorId) || "-" : "-",
      department: e.department?.name || "-",
      type: e.followUpDate ? "FOLLOWUP" : "NEW",
      diagnosis: e.diagnosis || e.chiefComplaint || "-",
      services: inv.services,
      billing: r2(inv.billing),
    };
  });

  return {
    rows,
    totals: { services: rows.reduce((s, r) => s + r.services, 0), billing: r2(rows.reduce((s, r) => s + r.billing, 0)) },
    cards: [{ label: "OPD Visits", value: rows.length }],
  };
}

export async function patientDetailIpd(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  const r = applyRange("admissionDate", ctx.filters);
  if (r) where.admissionDate = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;
  if (ctx.filters.patientId) where.patientId = ctx.filters.patientId;

  const admissions = await ctx.prisma.admission.findMany({
    where,
    include: {
      patient: PATIENT_SELECT,
      bedAllocations: {
        where: { status: { in: ["OCCUPIED", "AVAILABLE", "RESERVED"] } },
        include: { bed: { select: { bedNumber: true, ward: { select: { name: true } } } } },
        orderBy: { allocatedAt: "desc" },
        take: 1,
      },
      invoices: {
        where: { status: { not: "CANCELLED" } },
        select: { totalAmount: true, items: { select: { id: true } } },
      },
    },
    orderBy: { admissionDate: "desc" },
  });

  const docIds = [...new Set(admissions.map((a) => a.admittingDoctorId).filter(Boolean))] as string[];
  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, docIds);

  const rows = admissions.map((a) => {
    const charges = a.invoices.reduce((s: number, i: any) => s + money(i.totalAmount), 0);
    const services = a.invoices.reduce((s: number, i: any) => s + (i.items || []).length, 0);
    return {
      patient: fullName(a.patient),
      uhid: uhid(a.patient),
      admissionNumber: a.admissionNumber,
      admissionDate: a.admissionDate,
      ward: a.bedAllocations?.[0]?.bed?.ward?.name || "-",
      bed: a.bedAllocations?.[0]?.bed?.bedNumber || "-",
      doctor: a.admittingDoctorId ? docMap.get(a.admittingDoctorId) || "-" : "-",
      diagnosis: a.primaryDiagnosis || a.provisionalDiagnosis || "-",
      services,
      charges: r2(charges),
      dischargeDate: a.dischargeDate,
    };
  });

  return {
    rows,
    totals: { services: rows.reduce((s, r) => s + r.services, 0), charges: r2(rows.reduce((s, r) => s + r.charges, 0)) },
    cards: [{ label: "IPD Admissions", value: rows.length }],
  };
}

export async function bedOccupancy(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  if (ctx.filters.bedId) where.id = ctx.filters.bedId;
  if (ctx.filters.status) {
    where.status = ctx.filters.status;
  } else {
    where.status = "OCCUPIED";
  }
  const allocWhere: any = { status: "OCCUPIED" };
  if (ctx.filters.from || ctx.filters.to) {
    allocWhere.OR = [];
    if (ctx.filters.from) allocWhere.OR.push({ releasedAt: null }, { releasedAt: { gte: ctx.filters.from } });
    if (ctx.filters.to) allocWhere.OR.push({ allocatedAt: { lte: ctx.filters.to } });
  }

  const beds = await ctx.prisma.bed.findMany({
    where,
    include: {
      ward: { select: { name: true } },
      room: { select: { roomType: true } },
      allocations: {
        where: allocWhere,
        include: {
          admission: { select: { admissionDate: true, patient: { select: { firstName: true, middleName: true, lastName: true, mrn: true } } } },
        },
        orderBy: { allocatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { bedNumber: "asc" },
  });

  const rows = beds.map((b) => {
    const alloc = b.allocations?.[0];
    return {
      ward: b.ward?.name || "-",
      bed: b.bedNumber,
      bedType: b.room?.roomType || "WARD",
      status: b.status,
      patient: alloc?.admission?.patient ? fullName(alloc.admission.patient) : "-",
      admissionDate: alloc?.admission?.admissionDate,
      duration: alloc?.admission?.admissionDate ? daysBetween(alloc.admission.admissionDate, new Date()) : 0,
    };
  });

  return {
    rows,
    cards: [
      { label: "Occupied Beds", value: rows.filter((r) => r.patient !== "-").length },
      { label: "Total (filtered)", value: rows.length },
    ],
  };
}

export async function bedAnalysis(ctx: ExecContext): Promise<ExecResult> {
  const allocWhere: any = { tenantId: ctx.tenantId };
  if (ctx.filters.from || ctx.filters.to) {
    allocWhere.OR = [];
    if (ctx.filters.from) allocWhere.OR.push({ releasedAt: null }, { releasedAt: { gte: ctx.filters.from } });
    if (ctx.filters.to) allocWhere.OR.push({ allocatedAt: { lte: ctx.filters.to } });
  }
  const allocations = await ctx.prisma.bedAllocation.findMany({
    where: allocWhere,
    include: {
      bed: { select: { bedNumber: true, ward: { select: { name: true } } } },
    },
  });

  const from = ctx.filters.from;
  const to = ctx.filters.to;
  const periodDays = Math.max(1, from && to ? daysBetween(from, to) + 1 : 30);
  const start = from || new Date(Date.now() - periodDays * 86400000);

  const movements = await ctx.prisma.bedMovement.findMany({
    where: { tenantId: ctx.tenantId },
    select: { bedId: true },
  });
  const movesByBed = new Map<string, number>();
  for (const m of movements) movesByBed.set(m.bedId, (movesByBed.get(m.bedId) || 0) + 1);

  const byBed = new Map<string, { ward: string; bed: string; occupiedDays: number; count: number }>();
  for (const a of allocations) {
    const key = a.bedId;
    const cur = byBed.get(key) || { ward: a.bed?.ward?.name || "-", bed: a.bed?.bedNumber || "-", occupiedDays: 0, count: 0 };
    const allocStart = a.allocatedAt > start ? a.allocatedAt : start;
    const allocEnd = a.releasedAt ? a.releasedAt : new Date();
    const days = daysBetween(allocStart, allocEnd);
    cur.occupiedDays += days;
    cur.count += 1;
    byBed.set(key, cur);
  }

  const rows = [...byBed.values()].map((v) => ({
    ward: v.ward,
    bed: v.bed,
    occupiedDays: v.occupiedDays,
    utilization: pct1(v.occupiedDays, periodDays),
    transfers: movesByBed.get(v.bed === "-" ? "" : "") || 0,
    avgOccupancy: v.count ? Math.round((v.occupiedDays / v.count) * 10) / 10 : 0,
    available: Math.max(0, periodDays - v.occupiedDays),
  }));

  const sorted = sortRows(rows, "occupiedDays");
  return {
    rows: sorted,
    totals: { occupiedDays: rows.reduce((s, r) => s + r.occupiedDays, 0) },
    cards: [{ label: "Beds Analyzed", value: rows.length }, { label: "Occupied Days", value: rows.reduce((s, r) => s + r.occupiedDays, 0) }],
  };
}

export async function serviceWiseStats(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.serviceId) extra.items = { some: { serviceId: ctx.filters.serviceId } };
  const invoices = await fetchInvoices(ctx, extra);

  const byKey = new Map<string, Record<string, any>>();
  const deptIds = new Set<string>();
  const patients = new Map<string, Set<string>>();
  for (const inv of invoices) {
    for (const item of inv.items || []) {
      const key = item.serviceId || item.serviceName || "-";
      const cur = byKey.get(key) || { service: item.serviceName || key, departmentId: item.departmentId, quantity: 0, revenue: 0 };
      const fin = itemFinance(inv, item);
      cur.quantity += money(item.quantity) || 1;
      cur.revenue += fin.net;
      byKey.set(key, cur);
      if (!patients.has(key)) patients.set(key, new Set());
      patients.get(key)!.add(inv.patientId);
      if (item.departmentId) deptIds.add(item.departmentId);
    }
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byKey.entries()].map(([key, v]) => ({
    service: v.service,
    department: v.departmentId ? deptMap.get(v.departmentId) || "-" : "-",
    quantity: v.quantity,
    patients: patients.get(key)?.size || 0,
    revenue: r2(v.revenue),
  }));

  const sorted = sortRows(rows, "revenue");
  const t = (k: string) => sumOf(rows, k);
  return {
    rows: sorted,
    totals: { quantity: t("quantity"), patients: t("patients"), revenue: r2(t("revenue")) },
    cards: [{ label: "Services", value: rows.length }, { label: "Revenue", value: r2(t("revenue")) }],
  };
}

export async function monthlyDoctorWise(ctx: ExecContext): Promise<ExecResult> {
  const encounters = await fetchEncounters(ctx);
  const docIds = new Set<string>();
  const byKey = new Map<string, Record<string, any>>();
  const patients = new Map<string, Set<string>>();

  for (const e of encounters) {
    if (!e.doctorId) continue;
    docIds.add(e.doctorId);
    const key = `${monthKey(e.createdAt)}|${e.doctorId}`;
    const cur = byKey.get(key) || { month: monthLabel(monthKey(e.createdAt)), doctorId: e.doctorId, patients: 0, opd: 0, ipd: 0, services: 0, revenue: 0 };
    if (e.type === "OPD") cur.opd++;
    else if (e.type === "IPD") cur.ipd++;
    cur.services++;
    byKey.set(key, cur);
    if (!patients.has(key)) patients.set(key, new Set());
    patients.get(key)!.add(e.patientId);
  }

  const invWhere = invoiceWhere(ctx, { items: { some: { doctorId: { in: [...docIds] } } } });
  const invoices = await ctx.prisma.invoice.findMany({
    where: invWhere,
    select: { issuedDate: true, items: { select: { doctorId: true, lineTotal: true } } },
  });
  for (const inv of invoices) {
    const month = monthLabel(monthKey(inv.issuedDate));
    for (const item of inv.items || []) {
      if (!item.doctorId) continue;
      const key = `${monthKey(inv.issuedDate)}|${item.doctorId}`;
      const cur = byKey.get(key) || { month, doctorId: item.doctorId, patients: 0, opd: 0, ipd: 0, services: 0, revenue: 0 };
      cur.revenue += money(item.lineTotal);
      byKey.set(key, cur);
    }
  }

  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, [...docIds]);
  const docs = await ctx.prisma.doctorProfile.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...docIds] } },
    select: { id: true, departmentId: true },
  });
  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...new Set(docs.map((d) => d.departmentId).filter(Boolean))]);

  const rows = [...byKey.entries()].map(([key, v]) => {
    const doc = docs.find((d) => d.id === v.doctorId);
    return {
      month: v.month,
      doctor: docMap.get(v.doctorId) || "-",
      department: doc?.departmentId ? deptMap.get(doc.departmentId) || "-" : "-",
      patients: patients.get(key)?.size || 0,
      opd: v.opd,
      ipd: v.ipd,
      services: v.services,
      revenue: r2(v.revenue),
    };
  });

  const sorted = rows.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const t = (k: string) => sumOf(rows, k);
  return {
    rows: sorted,
    totals: { patients: t("patients"), opd: t("opd"), ipd: t("ipd"), services: t("services"), revenue: r2(t("revenue")) },
    cards: [{ label: "Doctors", value: docIds.size }, { label: "Revenue", value: r2(t("revenue")) }],
  };
}

export async function docWisePatientTotal(ctx: ExecContext): Promise<ExecResult> {
  const encounters = await fetchEncounters(ctx);
  const patientIds = [...new Set(encounters.map((e) => e.patientId))];
  const returning = await returningIds(ctx.prisma, ctx.tenantId, patientIds, ctx.filters.from);

  const byDoc = new Map<string, Record<string, any>>();
  const docIds = new Set<string>();
  const seen = new Set<string>();
  for (const e of encounters) {
    if (!e.doctorId) continue;
    docIds.add(e.doctorId);
    const cur = byDoc.get(e.doctorId) || { doctorId: e.doctorId, opd: 0, ipd: 0, newP: 0, followups: 0, total: 0 };
    if (e.type === "OPD") cur.opd++;
    else if (e.type === "IPD") cur.ipd++;
    if (e.type === "FOLLOWUP") cur.followups++;
    if (!returning.has(e.patientId) && !seen.has(e.patientId)) cur.newP++;
    cur.total++;
    byDoc.set(e.doctorId, cur);
    seen.add(e.patientId);
  }

  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, [...docIds]);
  const docs = await ctx.prisma.doctorProfile.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...docIds] } },
    select: { id: true, departmentId: true },
  });
  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...new Set(docs.map((d) => d.departmentId).filter(Boolean))]);

  const rows = [...byDoc.values()].map((v) => {
    const doc = docs.find((d) => d.id === v.doctorId);
    return {
      doctor: docMap.get(v.doctorId) || "-",
      department: doc?.departmentId ? deptMap.get(doc.departmentId) || "-" : "-",
      opd: v.opd,
      ipd: v.ipd,
      newPatients: v.newP,
      followups: v.followups,
      total: v.total,
    };
  });

  const sorted = sortRows(rows, "total");
  const t = (k: string) => sumOf(rows, k);
  return {
    rows: sorted,
    totals: { opd: t("opd"), ipd: t("ipd"), newPatients: t("newPatients"), followups: t("followups"), total: t("total") },
    cards: [
      { label: "Doctors", value: rows.length },
      { label: "Total Patients", value: t("total") },
    ],
  };
}

export async function ageWiseOpd(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId, type: "OPD" };
  const r = applyRange("createdAt", ctx.filters);
  if (r) where.createdAt = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;
  if (ctx.filters.doctorId) where.doctorId = ctx.filters.doctorId;

  const encounters = await ctx.prisma.encounter.findMany({
    where,
    include: { patient: { select: { gender: true, dateOfBirth: true, age: true } } },
  });

  const byKey = new Map<string, Record<string, any>>();
  const deptIds = new Set<string>();
  const docIds = new Set<string>();
  for (const e of encounters) {
    const group = ageGroupOf(e.patient?.dateOfBirth) || (e.patient?.age ? ageGroupOfAge(e.patient.age) : "Unknown");
    const gender = e.patient?.gender || "OTHER";
    const deptId = e.departmentId || "none";
    const docId = e.doctorId || "none";
    if (e.departmentId) deptIds.add(deptId);
    if (e.doctorId) docIds.add(docId);
    const key = `${group}|${gender}|${deptId}|${docId}`;
    const cur = byKey.get(key) || { ageGroup: group, gender, departmentId: deptId, doctorId: docId, count: 0 };
    cur.count++;
    byKey.set(key, cur);
  }

  const [deptMap, docMap] = await Promise.all([
    deptNames(ctx.prisma, ctx.tenantId, [...deptIds]),
    doctorNames(ctx.prisma, ctx.tenantId, [...docIds]),
  ]);

  const rows = [...byKey.values()].map((v) => ({
    ageGroup: v.ageGroup,
    gender: v.gender,
    department: v.departmentId === "none" ? "-" : deptMap.get(v.departmentId) || "-",
    doctor: v.doctorId === "none" ? "-" : docMap.get(v.doctorId) || "-",
    count: v.count,
  }));

  const sorted = sortRows(rows, "count");
  return {
    rows: sorted,
    totals: { count: rows.reduce((s, r) => s + r.count, 0) },
    cards: [{ label: "OPD Patients", value: rows.reduce((s, r) => s + r.count, 0) }],
  };
}

export async function doctorWiseReferral(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId, referringDoctor: { not: null } };
  const r = applyRange("admissionDate", ctx.filters);
  if (r) where.admissionDate = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;

  const admissions = await ctx.prisma.admission.findMany({
    where,
    include: { patient: PATIENT_SELECT },
    orderBy: { admissionDate: "desc" },
  });

  const docIds = [...new Set(admissions.map((a) => a.admittingDoctorId).filter(Boolean))] as string[];
  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, docIds);
  const deptIds = [...new Set(admissions.map((a) => a.departmentId).filter(Boolean))] as string[];
  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, deptIds);

  const rows = admissions.map((a) => ({
    referringDoctor: a.referringDoctor || "-",
    patient: fullName(a.patient),
    date: a.admissionDate,
    department: a.departmentId ? deptMap.get(a.departmentId) || "-" : "-",
    receivingDoctor: a.admittingDoctorId ? docMap.get(a.admittingDoctorId) || "-" : "-",
    service: a.provisionalDiagnosis || "-",
    status: a.status,
    count: 1,
  }));

  const t = (k: string) => sumOf(rows, k);
  return {
    rows,
    totals: { count: t("count") },
    cards: [{ label: "Referrals", value: rows.length }],
  };
}
