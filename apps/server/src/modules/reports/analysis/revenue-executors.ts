import type { ExecContext, ExecResult } from "./report.types";
import {
  money,
  r2,
  pct1,
  fullName,
  userName,
  doctorName,
  uhid,
  dateKey,
  applyRange,
  patientSearch,
  itemFinance,
  itemFreeAmount,
  PATIENT_SELECT,
  invoiceWhere,
  fetchInvoices,
  refundByInvoice,
  deptNames,
  doctorNames,
  userNames,
  wardByAdmission,
  sortRows,
  sumOf,
} from "./report-utils";

const INVOICE_TYPES = {
  OPD: ["OPD", "SPECIAL_OPD", "SERVICE", "PHARMACY", "AMBULANCE"],
  IPD: ["IPD", "DISCHARGE"],
  LAB: ["LAB"],
  RADIOLOGY: ["RADIOLOGY"],
  PHARMACY: ["PHARMACY"],
};

export async function depositCollections(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  const r = applyRange("receivedAt", ctx.filters);
  if (r) where.receivedAt = r;
  if (ctx.filters.paymentMode) where.method = ctx.filters.paymentMode;
  if (ctx.filters.userId) where.receivedBy = ctx.filters.userId;
  const ps = patientSearch(ctx.filters.search);
  if (ps) where.patient = ps;

  const deposits = await ctx.prisma.deposit.findMany({
    where,
    include: {
      patient: PATIENT_SELECT,
      admission: { select: { id: true, departmentId: true } },
    },
    orderBy: { receivedAt: "desc" },
  });

  const byUser = [...new Set(deposits.map((d) => d.receivedBy).filter(Boolean))] as string[];
  const userMap = await userNames(ctx.prisma, ctx.tenantId, byUser);
  const deptIds = [...new Set(deposits.map((d) => d.admission?.departmentId).filter(Boolean))] as string[];
  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, deptIds);

  const rows = deposits.map((d) => ({
    receivedAt: d.receivedAt,
    depositNumber: d.depositNumber,
    patient: fullName(d.patient),
    uhid: uhid(d.patient),
    department: d.admission?.departmentId ? deptMap.get(d.admission.departmentId) || "-" : "-",
    amount: money(d.amount),
    method: d.method || "-",
    receivedBy: userMap.get(d.receivedBy) || "-",
    depositType: d.type || "-",
    status: d.status || "-",
  }));

  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    rows,
    totals: { amount: r2(total) },
    cards: [
      { label: "Total Deposits", value: r2(total) },
      { label: "Deposits", value: rows.length },
    ],
  };
}

export async function creditSales(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.doctorId) {
    extra.items = { some: { ...(extra.items?.some || {}), doctorId: ctx.filters.doctorId } };
  }
  if (ctx.filters.status) {
    extra.status = ctx.filters.status;
  } else {
    extra.OR = [{ isCredit: true }, { dueAmount: { gt: 0 } }];
  }
  const invoices = await fetchInvoices(ctx, extra);

  const refundMap = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));
  for (const inv of invoices) {
    const ref = refundMap.get(inv.id) || 0;
    inv.paidAmount = money(inv.paidAmount) - ref;
    inv.dueAmount = money(inv.dueAmount) + ref;
  }

  const deptIds = new Set<string>();
  for (const i of invoices) for (const it of i.items || []) if (it.departmentId) deptIds.add(it.departmentId);
  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);

  const rows = invoices.map((inv) => {
    const depts = [...new Set((inv.items || []).map((it: any) => deptMap.get(it.departmentId) || "-").filter((d: any) => d !== "-"))];
    const services = [...new Set((inv.items || []).map((it: any) => it.serviceName || "-").filter((s: any) => s !== "-"))];
    const gross = money(inv.subtotal);
    const discount = money(inv.discountAmount);
    const tax = money(inv.taxAmount);
    const net = money(inv.totalAmount);
    const paid = money(inv.paidAmount);
    const credit = inv.isCredit ? net : 0;
    const outstanding = money(inv.dueAmount);
    return {
      issuedDate: inv.issuedDate,
      invoiceNumber: inv.invoiceNumber,
      patient: fullName(inv.patient),
      department: depts.join(", ") || "-",
      service: services.slice(0, 3).join(", ") || "-",
      gross: r2(gross),
      discount: r2(discount),
      net: r2(net),
      paid: r2(paid),
      credit: r2(credit),
      outstanding: r2(outstanding),
    };
  });

  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: {
      gross: t("gross"),
      discount: t("discount"),
      net: t("net"),
      paid: t("paid"),
      credit: t("credit"),
      outstanding: t("outstanding"),
    },
    cards: [
      { label: "Credit Sales", value: t("credit") },
      { label: "Outstanding", value: t("outstanding") },
      { label: "Collected", value: t("paid") },
    ],
  };
}

export async function freeAndConcession(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {
    OR: [
      { discountAmount: { gt: 0 } },
      { items: { some: { rate: { lte: 0 } } } },
    ],
  };
  if (ctx.filters.departmentId) extra.AND = [{ items: { some: { departmentId: ctx.filters.departmentId } } }];
  if (ctx.filters.doctorId) extra.AND = [{ items: { some: { doctorId: ctx.filters.doctorId } } }];
  const invoices = await fetchInvoices(ctx, extra);

  const rows: Record<string, any>[] = [];
  for (const inv of invoices) {
    for (const item of inv.items || []) {
      const fin = itemFinance(inv, item);
      const free = itemFreeAmount(item);
      if (fin.discount <= 0 && free <= 0) continue;
      const concession = inv.discountStatus === "APPROVED" || inv.discountApprovedBy ? fin.discount : 0;
      rows.push({
        issuedDate: inv.issuedDate,
        patient: fullName(inv.patient),
        uhid: uhid(inv.patient),
        department: item.departmentId || "-",
        doctor: item.doctorId || "-",
        service: item.serviceName || "-",
        gross: r2(fin.gross),
        discount: r2(fin.discount),
        concession: r2(concession),
        free: r2(free),
        net: r2(fin.net),
        reason: inv.discountReason || "-",
      });
    }
  }

  const deptIds = [...new Set(rows.map((r) => r.department).filter((x) => x !== "-"))] as string[];
  const docIds = [...new Set(rows.map((r) => r.doctor).filter((x) => x !== "-"))] as string[];
  const [deptMap, docMap] = await Promise.all([
    deptNames(ctx.prisma, ctx.tenantId, deptIds),
    doctorNames(ctx.prisma, ctx.tenantId, docIds),
  ]);
  for (const r of rows) {
    r.department = deptMap.get(r.department) || "-";
    r.doctor = docMap.get(r.doctor) || "-";
  }

  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: { gross: t("gross"), discount: t("discount"), concession: t("concession"), free: t("free"), net: t("net") },
    cards: [
      { label: "Concessions Given", value: t("concession") },
      { label: "Free Amount", value: t("free") },
      { label: "Discount", value: t("discount") },
    ],
  };
}

export async function testPriceList(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  if (ctx.filters.test) where.id = ctx.filters.test;
  if (ctx.filters.status) {
    where.status = ctx.filters.status;
  } else {
    where.isActive = true;
  }
  if (ctx.filters.search) {
    where.OR = [
      { name: { contains: ctx.filters.search, mode: "insensitive" as const } },
      { code: { contains: ctx.filters.search, mode: "insensitive" as const } },
    ];
  }
  const tests = await ctx.prisma.labTest.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return {
    rows: tests.map((t) => ({
      name: t.name,
      category: t.category || "-",
      discipline: t.discipline || "-",
      price: money(t.price),
      updatedAt: t.updatedAt || t.createdAt,
      status: t.status || "ACTIVE",
    })),
    cards: [
      { label: "Tests", value: tests.length },
      { label: "Active", value: tests.filter((t) => t.isActive !== false).length },
    ],
  };
}

export async function billPrint(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.status) extra.status = ctx.filters.status;
  const invoices = await fetchInvoices(ctx, extra);
  const rows = invoices.map((inv) => ({
    issuedDate: inv.issuedDate,
    invoiceNumber: inv.invoiceNumber,
    patient: fullName(inv.patient),
    uhid: uhid(inv.patient),
    totalAmount: money(inv.totalAmount),
    paidAmount: money(inv.paidAmount),
    dueAmount: money(inv.dueAmount),
    status: inv.status,
    printCount: inv.printCount || 0,
  }));
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: { totalAmount: t("totalAmount"), paidAmount: t("paidAmount"), dueAmount: t("dueAmount") },
    cards: [
      { label: "Bills", value: rows.length },
      { label: "Total", value: t("totalAmount") },
      { label: "Due", value: t("dueAmount") },
    ],
  };
}

export async function dayWiseCollection(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId, status: { in: ["COMPLETED", "PARTIAL"] } };
  const r = applyRange("paidAt", ctx.filters);
  if (r) where.paidAt = r;
  if (ctx.filters.paymentMode) where.method = ctx.filters.paymentMode;
  if (ctx.filters.userId) where.receivedBy = ctx.filters.userId;

  const payments = await ctx.prisma.payment.findMany({
    where,
    select: { paidAt: true, amount: true, invoice: { select: { type: true } } },
  });

  const buckets = new Map<string, Record<string, number>>();
  for (const p of payments) {
    const day = dateKey(p.paidAt);
    const b = buckets.get(day) || { opd: 0, ipd: 0, lab: 0, radiology: 0, pharmacy: 0, other: 0, total: 0 };
    const amt = money(p.amount);
    const type = p.invoice?.type || "OTHER";
    if (INVOICE_TYPES.OPD.includes(type)) b.opd += amt;
    else if (INVOICE_TYPES.IPD.includes(type)) b.ipd += amt;
    else if (INVOICE_TYPES.LAB.includes(type)) b.lab += amt;
    else if (INVOICE_TYPES.RADIOLOGY.includes(type)) b.radiology += amt;
    else if (INVOICE_TYPES.PHARMACY.includes(type)) b.pharmacy += amt;
    else b.other += amt;
    b.total += amt;
    buckets.set(day, b);
  }

  const rows = [...buckets.entries()]
    .map(([date, b]) => ({
      date,
      opd: r2(b.opd),
      ipd: r2(b.ipd),
      lab: r2(b.lab),
      radiology: r2(b.radiology),
      pharmacy: r2(b.pharmacy),
      other: r2(b.other),
      total: r2(b.total),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: { opd: t("opd"), ipd: t("ipd"), lab: t("lab"), radiology: t("radiology"), pharmacy: t("pharmacy"), other: t("other"), total: t("total") },
    cards: [
      { label: "Total Collection", value: t("total") },
      { label: "OPD", value: t("opd") },
      { label: "IPD", value: t("ipd") },
    ],
    chart: {
      type: "trend",
      labelsKey: "date",
      series: [{ key: "total", label: "Collection" }],
    },
  };
}

export async function departmentWiseRevenue(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  const invoices = await fetchInvoices(ctx, extra);
  const refunds = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));

  const byDept = new Map<string, Record<string, number>>();
  const deptIds = new Set<string>();
  for (const inv of invoices) {
    const items = inv.items || [];
    const invRefund = refunds.get(inv.id) || 0;
    const totalLine = items.reduce((s: number, i: any) => s + money(i.lineTotal), 0);
    for (const item of items) {
      if (!item.departmentId) continue;
      deptIds.add(item.departmentId);
      const fin = itemFinance(inv, item);
      const refundShare = totalLine > 0 ? invRefund * (money(item.lineTotal) / totalLine) : 0;
      const cur = byDept.get(item.departmentId) || { gross: 0, discount: 0, concession: 0, refund: 0, net: 0, paid: 0, outstanding: 0 };
      cur.gross += fin.gross;
      cur.discount += fin.discount;
      cur.concession += inv.discountStatus === "APPROVED" || inv.discountApprovedBy ? fin.discount : 0;
      cur.refund += refundShare;
      cur.net += fin.net - refundShare;
      cur.paid += fin.paid;
      cur.outstanding += fin.outstanding;
      byDept.set(item.departmentId, cur);
    }
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byDept.entries()].map(([id, v]) => ({
    department: deptMap.get(id) || id,
    gross: r2(v.gross),
    discount: r2(v.discount),
    concession: r2(v.concession),
    refund: r2(v.refund),
    net: r2(v.net),
    paid: r2(v.paid),
    outstanding: r2(v.outstanding),
  }));

  const sorted = sortRows(rows, "net");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: {
      gross: t("gross"),
      discount: t("discount"),
      concession: t("concession"),
      refund: t("refund"),
      net: t("net"),
      paid: t("paid"),
      outstanding: t("outstanding"),
    },
    cards: [
      { label: "Gross Revenue", value: t("gross") },
      { label: "Net Revenue", value: t("net") },
      { label: "Outstanding", value: t("outstanding") },
    ],
    chart: {
      type: "bar",
      labelsKey: "department",
      series: [{ key: "net", label: "Net Revenue" }],
    },
  };
}

export async function discountOutstanding(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {
    OR: [{ discountAmount: { gt: 0 } }, { dueAmount: { gt: 0 } }],
  };
  if (ctx.filters.departmentId) extra.AND = [{ items: { some: { departmentId: ctx.filters.departmentId } } }];
  const invoices = await fetchInvoices(ctx, extra);

  const refundMap = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));

  const rows = invoices.map((inv) => {
    const ref = refundMap.get(inv.id) || 0;
    const depts = [...new Set((inv.items || []).map((it: any) => it.departmentId).filter(Boolean))];
    const fin = itemFinance(inv, { lineTotal: money(inv.subtotal), quantity: 1 } as any);
    return {
      patient: fullName(inv.patient),
      invoiceNumber: inv.invoiceNumber,
      department: depts.join(", ") || "-",
      gross: r2(money(inv.subtotal)),
      discount: r2(money(inv.discountAmount)),
      concession: r2(inv.discountStatus === "APPROVED" || inv.discountApprovedBy ? money(inv.discountAmount) : 0),
      paid: r2(money(inv.paidAmount) - ref),
      outstanding: r2(money(inv.dueAmount) + ref),
    };
  });

  const deptIds = [...new Set(rows.flatMap((r) => r.department.split(", ")))] as string[];
  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, deptIds);
  for (const r of rows) {
    r.department = r.department.split(", ").map((d: string) => deptMap.get(d) || d).join(", ");
  }

  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: { gross: t("gross"), discount: t("discount"), concession: t("concession"), paid: t("paid"), outstanding: t("outstanding") },
    cards: [
      { label: "Bills With Discount", value: rows.filter((r) => r.discount > 0).length },
      { label: "Discount", value: t("discount") },
      { label: "Outstanding", value: t("outstanding") },
    ],
  };
}

export async function doctorWiseIncome(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.doctorId) extra.items = { some: { doctorId: ctx.filters.doctorId } };
  const invoices = await fetchInvoices(ctx, extra);

  const refundMap = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));
  for (const inv of invoices) {
    const ref = refundMap.get(inv.id) || 0;
    inv.paidAmount = money(inv.paidAmount) - ref;
    inv.dueAmount = money(inv.dueAmount) + ref;
  }

  const byDoc = new Map<string, Record<string, number>>();
  const docIds = new Set<string>();
  const patients = new Map<string, Set<string>>();
  for (const inv of invoices) {
    const items = inv.items || [];
    for (const item of items) {
      if (!item.doctorId) continue;
      docIds.add(item.doctorId);
      const cur = byDoc.get(item.doctorId) || { patients: 0, services: 0, gross: 0, discount: 0, net: 0 };
      const fin = itemFinance(inv, item);
      cur.gross += fin.gross;
      cur.discount += fin.discount;
      cur.net += fin.net;
      cur.services += 1;
      byDoc.set(item.doctorId, cur);
      if (!patients.has(item.doctorId)) patients.set(item.doctorId, new Set());
      patients.get(item.doctorId)!.add(inv.patientId);
    }
  }

  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, [...docIds]);
  const docDept = new Map<string, string>();
  const docs = await ctx.prisma.doctorProfile.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...docIds] } },
    select: { id: true, departmentId: true },
  });
  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...new Set(docs.map((d) => d.departmentId).filter(Boolean))]);
  for (const d of docs) docDept.set(d.id, deptMap.get(d.departmentId) || "-");

  const rows = [...byDoc.entries()].map(([id, v]) => ({
    doctor: docMap.get(id) || id,
    department: docDept.get(id) || "-",
    patients: patients.get(id)?.size || 0,
    services: v.services,
    gross: r2(v.gross),
    discount: r2(v.discount),
    net: r2(v.net),
  }));

  const sorted = sortRows(rows, "net");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: {
      patients: rows.reduce((s, r) => s + r.patients, 0),
      services: t("services"),
      gross: t("gross"),
      discount: t("discount"),
      net: t("net"),
    },
    cards: [
      { label: "Doctors", value: rows.length },
      { label: "Net Income", value: t("net") },
    ],
  };
}

export async function deptTestwiseRevenue(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.serviceId) extra.items = { some: { serviceId: ctx.filters.serviceId } };
  const invoices = await fetchInvoices(ctx, extra);

  const byKey = new Map<string, { departmentId: string; service: string; quantity: number; gross: number; discount: number; net: number }>();
  const deptIds = new Set<string>();
  for (const inv of invoices) {
    for (const item of inv.items || []) {
      const key = `${item.departmentId || "-"}|${item.serviceName || item.serviceId || "-"}`;
      const cur = byKey.get(key) || { departmentId: item.departmentId || "-", service: item.serviceName || "-", quantity: 0, gross: 0, discount: 0, net: 0 };
      const fin = itemFinance(inv, item);
      cur.quantity += money(item.quantity) || 1;
      cur.gross += fin.gross;
      cur.discount += fin.discount;
      cur.net += fin.net;
      byKey.set(key, cur);
      if (item.departmentId) deptIds.add(item.departmentId);
    }
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byKey.values()].map((v) => ({
    department: deptMap.get(v.departmentId) || "-",
    service: v.service,
    quantity: v.quantity,
    gross: r2(v.gross),
    discount: r2(v.discount),
    net: r2(v.net),
  }));

  const sorted = sortRows(rows, "net");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: { quantity: rows.reduce((s, r) => s + r.quantity, 0), gross: t("gross"), discount: t("discount"), net: t("net") },
    cards: [
      { label: "Services", value: rows.length },
      { label: "Net Revenue", value: t("net") },
    ],
  };
}

export async function doctorVsDept(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.doctorId) extra.items = { some: { doctorId: ctx.filters.doctorId } };
  const invoices = await fetchInvoices(ctx, extra);

  const refundMap = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));
  for (const inv of invoices) {
    const ref = refundMap.get(inv.id) || 0;
    inv.paidAmount = money(inv.paidAmount) - ref;
    inv.dueAmount = money(inv.dueAmount) + ref;
  }

  const byKey = new Map<string, Record<string, any>>();
  const docIds = new Set<string>();
  const deptIds = new Set<string>();
  const patients = new Map<string, Set<string>>();
  for (const inv of invoices) {
    for (const item of inv.items || []) {
      if (!item.doctorId && !item.departmentId) continue;
      const key = `${item.doctorId || "none"}|${item.departmentId || "none"}`;
      const cur = byKey.get(key) || { doctorId: item.doctorId, departmentId: item.departmentId, patients: 0, services: 0, gross: 0, discount: 0, net: 0, outstanding: 0 };
      const fin = itemFinance(inv, item);
      cur.gross += fin.gross;
      cur.discount += fin.discount;
      cur.net += fin.net;
      cur.outstanding += fin.outstanding;
      cur.services += 1;
      byKey.set(key, cur);
      if (!patients.has(key)) patients.set(key, new Set());
      patients.get(key)!.add(inv.patientId);
      if (item.doctorId) docIds.add(item.doctorId);
      if (item.departmentId) deptIds.add(item.departmentId);
    }
  }

  const [docMap, deptMap] = await Promise.all([
    doctorNames(ctx.prisma, ctx.tenantId, [...docIds]),
    deptNames(ctx.prisma, ctx.tenantId, [...deptIds]),
  ]);

  const rows = [...byKey.entries()].map(([key, v]) => ({
    doctor: v.doctorId ? docMap.get(v.doctorId) || "-" : "-",
    department: v.departmentId ? deptMap.get(v.departmentId) || "-" : "-",
    patients: patients.get(key)?.size || 0,
    services: v.services,
    gross: r2(v.gross),
    discount: r2(v.discount),
    net: r2(v.net),
    outstanding: r2(v.outstanding),
  }));

  const sorted = sortRows(rows, "net");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: { patients: rows.reduce((s, r) => s + r.patients, 0), services: t("services"), gross: t("gross"), discount: t("discount"), net: t("net"), outstanding: t("outstanding") },
    cards: [{ label: "Net Revenue", value: t("net") }, { label: "Outstanding", value: t("outstanding") }],
  };
}

export async function wardVsDept(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = { admissionId: { not: null } };
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  const invoices = await fetchInvoices(ctx, extra);

  const admissionIds = [...new Set(invoices.map((i) => i.admissionId).filter(Boolean))] as string[];
  const wardMap = await wardByAdmission(ctx.prisma, ctx.tenantId, admissionIds);

  const byKey = new Map<string, Record<string, any>>();
  const deptIds = new Set<string>();
  const patients = new Map<string, Set<string>>();
  for (const inv of invoices) {
    const ward = inv.admissionId ? wardMap.get(inv.admissionId)?.ward || "-" : "-";
    for (const item of inv.items || []) {
      const key = `${ward}|${item.departmentId || "none"}`;
      const cur = byKey.get(key) || { ward, departmentId: item.departmentId, patients: 0, services: 0, revenue: 0, outstanding: 0 };
      const fin = itemFinance(inv, item);
      cur.revenue += fin.net;
      cur.outstanding += fin.outstanding;
      cur.services += 1;
      byKey.set(key, cur);
      if (!patients.has(key)) patients.set(key, new Set());
      patients.get(key)!.add(inv.patientId);
      if (item.departmentId) deptIds.add(item.departmentId);
    }
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byKey.entries()].map(([key, v]) => ({
    ward: v.ward,
    department: v.departmentId ? deptMap.get(v.departmentId) || "-" : "-",
    patients: patients.get(key)?.size || 0,
    services: v.services,
    revenue: r2(v.revenue),
    outstanding: r2(v.outstanding),
  }));

  const sorted = sortRows(rows, "revenue");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: { patients: rows.reduce((s, r) => s + r.patients, 0), services: t("services"), revenue: t("revenue"), outstanding: t("outstanding") },
    cards: [{ label: "Revenue", value: t("revenue") }, { label: "Outstanding", value: t("outstanding") }],
  };
}

export async function deptVsClinical(ctx: ExecContext): Promise<ExecResult> {
  const invoices = await fetchInvoices(ctx, {});
  const byDept = new Map<string, { op: number; clinical: number }>();
  const deptIds = new Set<string>();
  for (const inv of invoices) {
    const clinical = INVOICE_TYPES.IPD.includes(inv.type) || ["LAB", "RADIOLOGY", "PROCEDURE", "OT"].includes(inv.type);
    const items = inv.items || [];
    const total = money(inv.totalAmount);
    const sub = money(inv.subtotal);
    for (const item of items) {
      if (!item.departmentId) continue;
      deptIds.add(item.departmentId);
      const cur = byDept.get(item.departmentId) || { op: 0, clinical: 0 };
      const fin = itemFinance(inv, item);
      if (clinical) cur.clinical += fin.net;
      else cur.op += fin.net;
      byDept.set(item.departmentId, cur);
    }
    if (!items.length && inv.departmentId) {
      deptIds.add(inv.departmentId);
      const cur = byDept.get(inv.departmentId) || { op: 0, clinical: 0 };
      if (clinical) cur.clinical += total;
      else cur.op += total;
      byDept.set(inv.departmentId, cur);
    }
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byDept.entries()].map(([id, v]) => ({
    department: deptMap.get(id) || id,
    opRevenue: r2(v.op),
    clinicalRevenue: r2(v.clinical),
    difference: r2(v.op - v.clinical),
  }));

  const sorted = sortRows(rows, "difference");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: { opRevenue: t("opRevenue"), clinicalRevenue: t("clinicalRevenue"), difference: t("difference") },
    cards: [{ label: "Op Revenue", value: t("opRevenue") }, { label: "Clinical Revenue", value: t("clinicalRevenue") }],
  };
}

export async function accountRevenueTally(ctx: ExecContext): Promise<ExecResult> {
  const entryWhere: any = { tenantId: ctx.tenantId };
  const r = applyRange("date", ctx.filters);
  if (r) entryWhere.date = r;
  const entries = await ctx.prisma.journalEntry.findMany({
    where: entryWhere,
    select: { id: true },
  });
  const ids = entries.map((e) => e.id);
  if (!ids.length) {
    return { rows: [], totals: { debit: 0, credit: 0, revenue: 0, adjustment: 0, balance: 0 } };
  }

  const lineWhere: any = { tenantId: ctx.tenantId, journalEntryId: { in: ids } };
  if (ctx.filters.accountId) lineWhere.accountId = ctx.filters.accountId;
  const lines = await ctx.prisma.journalLine.findMany({
    where: lineWhere,
    select: { accountId: true, debit: true, credit: true },
  });

  const accounts = await ctx.prisma.account.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, name: true, type: true },
  });
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  const byAcc = new Map<string, Record<string, any>>();
  for (const l of lines) {
    const acc = accMap.get(l.accountId);
    const cur = byAcc.get(l.accountId) || { account: acc?.name || l.accountId, transactions: 0, debit: 0, credit: 0, revenue: 0, adjustment: 0, balance: 0 };
    cur.transactions += 1;
    cur.debit += money(l.debit);
    cur.credit += money(l.credit);
    if (acc?.type === "INCOME") cur.revenue += money(l.credit) - money(l.debit);
    byAcc.set(l.accountId, cur);
  }

  const rows = [...byAcc.values()].map((v) => ({
    account: v.account,
    transactions: v.transactions,
    debit: r2(v.debit),
    credit: r2(v.credit),
    revenue: r2(v.revenue),
    adjustment: r2(v.adjustment),
    balance: r2(v.credit - v.debit),
  }));

  const sorted = sortRows(rows, "credit");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: { transactions: rows.reduce((s, r) => s + r.transactions, 0), debit: t("debit"), credit: t("credit"), revenue: t("revenue"), adjustment: t("adjustment"), balance: r2(t("credit") - t("debit")) },
    cards: [{ label: "Accounts", value: rows.length }, { label: "Revenue", value: t("revenue") }],
  };
}

export async function indoorTreatmentSummary(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  const r = applyRange("admissionDate", ctx.filters);
  if (r) where.admissionDate = r;
  if (ctx.filters.departmentId) where.departmentId = ctx.filters.departmentId;
  if (ctx.filters.wardId) {
    const allocs = await ctx.prisma.bedAllocation.findMany({
      where: { tenantId: ctx.tenantId, bed: { wardId: ctx.filters.wardId } },
      select: { admissionId: true },
      distinct: ["admissionId"],
    });
    where.id = { in: allocs.map((a) => a.admissionId) };
  }
  if (ctx.filters.patientId) where.patientId = ctx.filters.patientId;
  if (ctx.filters.doctorId) where.admittingDoctorId = ctx.filters.doctorId;

  const admissions = await ctx.prisma.admission.findMany({
    where,
    include: {
      patient: PATIENT_SELECT,
      bedAllocations: {
        where: { status: { in: ["OCCUPIED", "AVAILABLE", "RESERVED"] } },
        include: { bed: { select: { bedNumber: true } } },
        orderBy: { allocatedAt: "desc" },
        take: 1,
      },
      invoices: { select: { id: true, totalAmount: true, paidAmount: true, dueAmount: true } },
    },
    orderBy: { admissionDate: "desc" },
  });

  const allInvIds = admissions.flatMap((a) => (a.invoices || []).map((i: any) => i.id));
  const refundMap = await refundByInvoice(ctx.prisma, ctx.tenantId, allInvIds);

  const docIds = [...new Set(admissions.map((a) => a.admittingDoctorId).filter(Boolean))] as string[];
  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, docIds);

  const rows = admissions.map((a) => {
    const charges = a.invoices.reduce((s: number, i: any) => s + money(i.totalAmount), 0);
    const payment = a.invoices.reduce((s: number, i: any) => s + money(i.paidAmount) - (refundMap.get(i.id) || 0), 0);
    const outstanding = a.invoices.reduce((s: number, i: any) => s + money(i.dueAmount) + (refundMap.get(i.id) || 0), 0);
    return {
      patient: fullName(a.patient),
      uhid: uhid(a.patient),
      admissionNumber: a.admissionNumber,
      admissionDate: a.admissionDate,
      ward: a.bedAllocations?.[0]?.bed?.bedNumber ? `Bed ${a.bedAllocations[0].bed.bedNumber}` : "-",
      bed: a.bedAllocations?.[0]?.bed?.bedNumber || "-",
      doctor: a.admittingDoctorId ? docMap.get(a.admittingDoctorId) || "-" : "-",
      service: a.finalDiagnosis || a.provisionalDiagnosis || "-",
      charges: r2(charges),
      payment: r2(payment),
      outstanding: r2(outstanding),
    };
  });

  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: { charges: t("charges"), payment: t("payment"), outstanding: t("outstanding") },
    cards: [{ label: "Admissions", value: rows.length }, { label: "Charges", value: t("charges") }, { label: "Outstanding", value: t("outstanding") }],
  };
}

export async function patientWiseRevenue(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.doctorId) extra.items = { some: { doctorId: ctx.filters.doctorId } };
  if (ctx.filters.patientId) extra.patientId = ctx.filters.patientId;
  const invoices = await fetchInvoices(ctx, extra);

  const refundMap = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));
  for (const inv of invoices) {
    const ref = refundMap.get(inv.id) || 0;
    inv.paidAmount = money(inv.paidAmount) - ref;
    inv.dueAmount = money(inv.dueAmount) + ref;
  }

  const deptIds = new Set<string>();
  const docIds = new Set<string>();
  const rows: Record<string, any>[] = [];
  for (const inv of invoices) {
    for (const item of inv.items || []) {
      const fin = itemFinance(inv, item);
      if (item.departmentId) deptIds.add(item.departmentId);
      if (item.doctorId) docIds.add(item.doctorId);
      rows.push({
        patient: fullName(inv.patient),
        uhid: uhid(inv.patient),
        issuedDate: inv.issuedDate,
        department: item.departmentId || "-",
        doctor: item.doctorId || "-",
        service: item.serviceName || "-",
        invoiceNumber: inv.invoiceNumber,
        gross: r2(fin.gross),
        discount: r2(fin.discount),
        net: r2(fin.net),
        paid: r2(fin.paid),
        outstanding: r2(fin.outstanding),
      });
    }
  }

  const [deptMap, docMap] = await Promise.all([
    deptNames(ctx.prisma, ctx.tenantId, [...deptIds]),
    doctorNames(ctx.prisma, ctx.tenantId, [...docIds]),
  ]);
  for (const r of rows) {
    r.department = deptMap.get(r.department) || "-";
    r.doctor = docMap.get(r.doctor) || "-";
  }

  const sorted = sortRows(rows, "issuedDate", false);
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: { gross: t("gross"), discount: t("discount"), net: t("net"), paid: t("paid"), outstanding: t("outstanding") },
    cards: [{ label: "Patients", value: new Set(rows.map((r) => r.uhid)).size }, { label: "Net Revenue", value: t("net") }, { label: "Outstanding", value: t("outstanding") }],
  };
}

export async function materializedView(ctx: ExecContext): Promise<ExecResult> {
  const r = applyRange("createdAt", ctx.filters);
  const inRange = r ? { tenantId: ctx.tenantId, ...{ createdAt: r } } : { tenantId: ctx.tenantId };
  const [patients, appointments, encounters, admissions, invoices, payments, labOrders, radiologyOrders, otCases, emergencyCases, beds, deposits] =
    await Promise.all([
      ctx.prisma.patient.count({ where: { ...inRange, deletedAt: null } }),
      ctx.prisma.appointment.count({ where: inRange }),
      ctx.prisma.encounter.count({ where: inRange }),
      ctx.prisma.admission.count({ where: inRange }),
      ctx.prisma.invoice.count({ where: { ...inRange, status: { not: "CANCELLED" } } }),
      ctx.prisma.payment.count({ where: inRange }),
      ctx.prisma.labOrder.count({ where: inRange }),
      ctx.prisma.radiologyOrder.count({ where: inRange }),
      ctx.prisma.oTCase.count({ where: inRange }),
      ctx.prisma.emergencyCase.count({ where: inRange }),
      ctx.prisma.bed.count({ where: { tenantId: ctx.tenantId } }),
      ctx.prisma.deposit.count({ where: inRange }),
    ]);

  const now = new Date().toISOString();
  const views = [
    { name: "Patients", description: "Registered patient records", rows: patients },
    { name: "Appointments", description: "Scheduled appointments", rows: appointments },
    { name: "Encounters", description: "Clinical visits", rows: encounters },
    { name: "Admissions", description: "IPD admissions", rows: admissions },
    { name: "Invoices", description: "Billed invoices (non-cancelled)", rows: invoices },
    { name: "Payments", description: "Payment transactions", rows: payments },
    { name: "Lab Orders", description: "Laboratory orders", rows: labOrders },
    { name: "Radiology Orders", description: "Imaging orders", rows: radiologyOrders },
    { name: "OT Cases", description: "Operation theatre cases", rows: otCases },
    { name: "Emergency Cases", description: "Emergency room cases", rows: emergencyCases },
    { name: "Beds", description: "Registered beds", rows: beds },
    { name: "Deposits", description: "Deposit collections", rows: deposits },
  ];

  return {
    rows: views.map((v) => ({
      view: v.name,
      description: v.description,
      lastRefreshed: now,
      rows: v.rows,
      data: `${v.rows} record(s)`,
    })),
    views,
    cards: [
      { label: "Patients", value: patients },
      { label: "Encounters", value: encounters },
      { label: "Invoices", value: invoices },
      { label: "Payments", value: payments },
    ],
  };
}

export async function bankDeposit(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId, method: "BANK", status: { in: ["COMPLETED", "PARTIAL"] } };
  const r = applyRange("paidAt", ctx.filters);
  if (r) where.paidAt = r;
  if (ctx.filters.userId) where.receivedBy = ctx.filters.userId;
  const ps = patientSearch(ctx.filters.search);
  if (ps) where.patient = ps;

  const payments = await ctx.prisma.payment.findMany({
    where,
    include: { patient: PATIENT_SELECT },
    orderBy: { paidAt: "desc" },
  });

  const userIds = [...new Set(payments.map((p) => p.receivedBy).filter(Boolean))] as string[];
  const userMap = await userNames(ctx.prisma, ctx.tenantId, userIds);

  const rows = payments.map((p) => ({
    paidAt: p.paidAt,
    depositNumber: p.paymentNumber,
    bank: "BANK",
    account: p.referenceNumber ? p.referenceNumber : "-",
    amount: money(p.amount),
    reference: p.referenceNumber || "-",
    receivedBy: userMap.get(p.receivedBy) || "-",
    status: p.status,
  }));

  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    rows,
    totals: { amount: r2(total) },
    cards: [{ label: "Bank Deposits", value: r2(total) }, { label: "Transactions", value: rows.length }],
  };
}

export async function indoorIncome(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = { type: { in: ["IPD", "DISCHARGE"] }, admissionId: { not: null } };
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.doctorId) extra.items = { some: { doctorId: ctx.filters.doctorId } };
  const invoices = await fetchInvoices(ctx, extra);

  const refundMap = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));
  for (const inv of invoices) {
    const ref = refundMap.get(inv.id) || 0;
    inv.paidAmount = money(inv.paidAmount) - ref;
    inv.dueAmount = money(inv.dueAmount) + ref;
  }

  const admissionIds = [...new Set(invoices.map((i) => i.admissionId).filter(Boolean))] as string[];
  const wardMap = await wardByAdmission(ctx.prisma, ctx.tenantId, admissionIds);

  const rows: Record<string, any>[] = [];
  const deptIds = new Set<string>();
  const docIds = new Set<string>();
  for (const inv of invoices) {
    for (const item of inv.items || []) {
      const fin = itemFinance(inv, item);
      if (item.departmentId) deptIds.add(item.departmentId);
      if (item.doctorId) docIds.add(item.doctorId);
      rows.push({
        issuedDate: inv.issuedDate,
        department: item.departmentId || "-",
        ward: inv.admissionId ? wardMap.get(inv.admissionId)?.ward || "-" : "-",
        doctor: item.doctorId || "-",
        service: item.serviceName || "-",
        amount: r2(fin.net),
      });
    }
  }

  const [deptMap, docMap] = await Promise.all([
    deptNames(ctx.prisma, ctx.tenantId, [...deptIds]),
    doctorNames(ctx.prisma, ctx.tenantId, [...docIds]),
  ]);
  for (const r of rows) {
    r.department = deptMap.get(r.department) || "-";
    r.doctor = docMap.get(r.doctor) || "-";
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    rows: sortRows(rows, "amount"),
    totals: { amount: r2(total) },
    cards: [{ label: "Indoor Income", value: r2(total) }, { label: "Services", value: rows.length }],
  };
}

export async function outdoorIncome(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = { type: { in: ["OPD", "SPECIAL_OPD", "SERVICE", "PHARMACY", "AMBULANCE"] } };
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.doctorId) extra.items = { some: { doctorId: ctx.filters.doctorId } };
  const invoices = await fetchInvoices(ctx, extra);

  const refundMap = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));
  for (const inv of invoices) {
    const ref = refundMap.get(inv.id) || 0;
    inv.paidAmount = money(inv.paidAmount) - ref;
    inv.dueAmount = money(inv.dueAmount) + ref;
  }

  const rows: Record<string, any>[] = [];
  const deptIds = new Set<string>();
  const docIds = new Set<string>();
  for (const inv of invoices) {
    for (const item of inv.items || []) {
      const fin = itemFinance(inv, item);
      if (item.departmentId) deptIds.add(item.departmentId);
      if (item.doctorId) docIds.add(item.doctorId);
      rows.push({
        issuedDate: inv.issuedDate,
        department: item.departmentId || "-",
        doctor: item.doctorId || "-",
        service: item.serviceName || "-",
        amount: r2(fin.net),
      });
    }
  }

  const [deptMap, docMap] = await Promise.all([
    deptNames(ctx.prisma, ctx.tenantId, [...deptIds]),
    doctorNames(ctx.prisma, ctx.tenantId, [...docIds]),
  ]);
  for (const r of rows) {
    r.department = deptMap.get(r.department) || "-";
    r.doctor = docMap.get(r.doctor) || "-";
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    rows: sortRows(rows, "amount"),
    totals: { amount: r2(total) },
    cards: [{ label: "Outdoor Income", value: r2(total) }, { label: "Services", value: rows.length }],
  };
}

export async function userWiseCollection(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId, status: { in: ["COMPLETED", "PARTIAL"] } };
  const r = applyRange("paidAt", ctx.filters);
  if (r) where.paidAt = r;
  if (ctx.filters.paymentMode) where.method = ctx.filters.paymentMode;
  if (ctx.filters.userId) where.receivedBy = ctx.filters.userId;
  if (ctx.filters.patientId) where.patientId = ctx.filters.patientId;

  const payments = await ctx.prisma.payment.findMany({
    where,
    include: { patient: PATIENT_SELECT },
    orderBy: { paidAt: "desc" },
  });

  const refunds = await ctx.prisma.refund.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "COMPLETED",
      ...(ctx.filters.from || ctx.filters.to ? { refundedAt: { gte: ctx.filters.from, lte: ctx.filters.to } } : {}),
      ...(ctx.filters.patientId ? { patientId: ctx.filters.patientId } : {}),
    },
    select: { patientId: true, processedBy: true, amount: true },
  });

  const keyOf = (userId: string | null, patientId: string) => `${userId || "none"}|${patientId}`;
  const byKey = new Map<string, { userId: string | null; patientId: string; collection: number; refund: number; paymentNumber: string; paidAt: Date; method: string }>();
  for (const p of payments) {
    const k = keyOf(p.receivedBy, p.patientId);
    const cur = byKey.get(k) || { userId: p.receivedBy, patientId: p.patientId, collection: 0, refund: 0, paymentNumber: p.paymentNumber, paidAt: p.paidAt, method: p.method };
    cur.collection += money(p.amount);
    cur.paymentNumber = p.paymentNumber;
    cur.paidAt = p.paidAt;
    cur.method = p.method;
    byKey.set(k, cur);
  }
  for (const rf of refunds) {
    const k = keyOf(rf.processedBy, rf.patientId);
    const cur = byKey.get(k) || { userId: rf.processedBy, patientId: rf.patientId, collection: 0, refund: 0, paymentNumber: "-", paidAt: rf.refundedAt, method: "-" };
    cur.refund += money(rf.amount);
    byKey.set(k, cur);
  }

  const userIds = [...new Set([...byKey.values()].map((v) => v.userId).filter(Boolean))] as string[];
  const userMap = await userNames(ctx.prisma, ctx.tenantId, userIds);
  const patients = await ctx.prisma.patient.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...new Set([...byKey.values()].map((v) => v.patientId))] } },
    select: { id: true, firstName: true, middleName: true, lastName: true, mrn: true },
  });
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  const rows = [...byKey.values()].map((v) => ({
    receivedBy: v.userId ? userMap.get(v.userId) || "-" : "-",
    patient: patientMap.get(v.patientId) ? fullName(patientMap.get(v.patientId)) : "-",
    paymentNumber: v.paymentNumber,
    paidAt: v.paidAt,
    method: v.method || "-",
    collection: r2(v.collection),
    refund: r2(v.refund),
    net: r2(v.collection - v.refund),
  }));

  const sorted = sortRows(rows, "collection");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: { collection: t("collection"), refund: t("refund"), net: t("net") },
    cards: [{ label: "Total Collection", value: t("collection") }, { label: "Net Collection", value: t("net") }],
  };
}

export async function revenueStatement(ctx: ExecContext): Promise<ExecResult> {
  const invWhere: any = { tenantId: ctx.tenantId, status: { not: "CANCELLED" } };
  const invR = applyRange("issuedDate", ctx.filters);
  if (invR) invWhere.issuedDate = invR;
  if (ctx.filters.patientId) invWhere.patientId = ctx.filters.patientId;
  const invoices = await ctx.prisma.invoice.findMany({
    where: invWhere,
    select: {
      id: true, issuedDate: true, invoiceNumber: true, patientId: true, type: true,
      subtotal: true, totalAmount: true, paidAmount: true, dueAmount: true,
      items: { select: { departmentId: true, doctorId: true } },
      patient: { select: PATIENT_SELECT.select },
    },
  });

  const payWhere: any = { tenantId: ctx.tenantId, status: { in: ["COMPLETED", "PARTIAL"] } };
  const payR = applyRange("paidAt", ctx.filters);
  if (payR) payWhere.paidAt = payR;
  if (ctx.filters.patientId) payWhere.patientId = ctx.filters.patientId;
  if (ctx.filters.paymentMode) payWhere.method = ctx.filters.paymentMode;
  const payments = await ctx.prisma.payment.findMany({
    where: payWhere,
    include: { patient: PATIENT_SELECT },
  });

  const refWhere: any = { tenantId: ctx.tenantId, status: "COMPLETED" };
  const refR = applyRange("refundedAt", ctx.filters);
  if (refR) refWhere.refundedAt = refR;
  if (ctx.filters.patientId) refWhere.patientId = ctx.filters.patientId;
  const refunds = await ctx.prisma.refund.findMany({
    where: refWhere,
    include: { patient: PATIENT_SELECT },
  });

  const rows: Record<string, any>[] = [];
  const deptIds = new Set<string>();
  const docIds = new Set<string>();

  for (const inv of invoices) {
    const deptId = inv.items?.[0]?.departmentId;
    const docId = inv.items?.[0]?.doctorId;
    if (deptId) deptIds.add(deptId);
    if (docId) docIds.add(docId);
    rows.push({
      date: inv.issuedDate,
      transaction: "INVOICE",
      patient: fullName(inv.patient),
      reference: inv.invoiceNumber,
      department: deptId || "-",
      doctor: docId || "-",
      account: inv.type || "-",
      paymentMode: "-",
      debit: 0,
      credit: money(inv.totalAmount),
      balance: 0,
    });
  }
  for (const p of payments) {
    rows.push({
      date: p.paidAt,
      transaction: "PAYMENT",
      patient: fullName(p.patient),
      reference: p.paymentNumber,
      department: "-",
      doctor: "-",
      account: p.paymentType || "INVOICE",
      paymentMode: p.method,
      debit: money(p.amount),
      credit: 0,
      balance: 0,
    });
  }
  for (const rf of refunds) {
    rows.push({
      date: rf.refundedAt || rf.createdAt,
      transaction: "REFUND",
      patient: fullName(rf.patient),
      reference: rf.refundNumber,
      department: "-",
      doctor: "-",
      account: "-",
      paymentMode: rf.refundMethod || "-",
      debit: 0,
      credit: money(rf.amount),
      balance: 0,
    });
  }

  const [deptMap, docMap] = await Promise.all([
    deptNames(ctx.prisma, ctx.tenantId, [...deptIds]),
    doctorNames(ctx.prisma, ctx.tenantId, [...docIds]),
  ]);

  rows.sort((a, b) => {
    const d = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (d !== 0) return d;
    const order = { PAYMENT: 0, INVOICE: 1, REFUND: 2 } as Record<string, number>;
    return (order[a.transaction] ?? 3) - (order[b.transaction] ?? 3);
  });

  let balance = 0;
  for (const r of rows) {
    balance += r.credit - r.debit;
    r.balance = r2(balance);
    r.department = deptMap.get(r.department) || "-";
    r.doctor = docMap.get(r.doctor) || "-";
    r.credit = r2(r.credit);
    r.debit = r2(r.debit);
  }

  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: { debit: t("debit"), credit: t("credit") },
    cards: [
      { label: "Invoice Credit", value: t("credit") },
      { label: "Collections", value: t("debit") },
      { label: "Closing Balance", value: rows.length ? rows[rows.length - 1].balance : 0 },
    ],
  };
}

export async function serviceWiseIncome(ctx: ExecContext): Promise<ExecResult> {
  const extra: any = {};
  if (ctx.filters.departmentId) extra.items = { some: { departmentId: ctx.filters.departmentId } };
  if (ctx.filters.serviceId) extra.items = { some: { serviceId: ctx.filters.serviceId } };
  const invoices = await fetchInvoices(ctx, extra);
  const refunds = await refundByInvoice(ctx.prisma, ctx.tenantId, invoices.map((i) => i.id));

  const byKey = new Map<string, Record<string, any>>();
  const deptIds = new Set<string>();
  for (const inv of invoices) {
    const items = inv.items || [];
    const invRefund = refunds.get(inv.id) || 0;
    const totalLine = items.reduce((s: number, i: any) => s + money(i.lineTotal), 0);
    for (const item of items) {
      const key = item.serviceId || item.serviceName || "-";
      const cur = byKey.get(key) || { service: item.serviceName || key, departmentId: item.departmentId, quantity: 0, gross: 0, discount: 0, refund: 0, net: 0 };
      const fin = itemFinance(inv, item);
      const refundShare = totalLine > 0 ? invRefund * (money(item.lineTotal) / totalLine) : 0;
      cur.quantity += money(item.quantity) || 1;
      cur.gross += fin.gross;
      cur.discount += fin.discount;
      cur.refund += refundShare;
      cur.net += fin.net - refundShare;
      byKey.set(key, cur);
      if (item.departmentId) deptIds.add(item.departmentId);
    }
  }

  const deptMap = await deptNames(ctx.prisma, ctx.tenantId, [...deptIds]);
  const rows = [...byKey.values()].map((v) => ({
    service: v.service,
    department: v.departmentId ? deptMap.get(v.departmentId) || "-" : "-",
    quantity: v.quantity,
    gross: r2(v.gross),
    discount: r2(v.discount),
    refund: r2(v.refund),
    net: r2(v.net),
  }));

  const sorted = sortRows(rows, "net");
  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows: sorted,
    totals: { quantity: rows.reduce((s, r) => s + r.quantity, 0), gross: t("gross"), discount: t("discount"), refund: t("refund"), net: t("net") },
    cards: [{ label: "Services", value: rows.length }, { label: "Net Income", value: t("net") }],
  };
}

export async function srlReport(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  const r = applyRange("orderedAt", ctx.filters);
  if (r) where.orderedAt = r;
  if (ctx.filters.doctorId) where.doctorId = ctx.filters.doctorId;
  if (ctx.filters.patientId) where.patientId = ctx.filters.patientId;
  if (ctx.filters.status) where.status = ctx.filters.status;

  const orders = await ctx.prisma.labOrder.findMany({
    where,
    include: {
      patient: PATIENT_SELECT,
      items: { select: { labTestId: true, testName: true, price: true } },
    },
    orderBy: { orderedAt: "desc" },
  });

  const tests = await ctx.prisma.labTest.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, category: true },
  });
  const testMap = new Map(tests.map((t) => [t.id, t.category]));

  const invoiceItems = await ctx.prisma.invoiceItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      referenceType: { in: ["LAB", "LAB_ORDER", "LABORATORY"] },
      referenceId: { in: orders.map((o) => o.id) },
    },
    select: { referenceId: true, invoiceId: true, lineTotal: true },
  });
  const invIds = [...new Set(invoiceItems.map((i) => i.invoiceId))];
  const invPaid = await ctx.prisma.invoice.findMany({
    where: { tenantId: ctx.tenantId, id: { in: invIds } },
    select: { id: true, paidAmount: true, totalAmount: true },
  });
  const invMap = new Map(invPaid.map((i) => [i.id, i]));
  const paidByOrder = new Map<string, number>();
  for (const it of invoiceItems) {
    const inv = invMap.get(it.invoiceId);
    const total = inv ? money(inv.totalAmount) : 0;
    const share = total > 0 ? money(it.lineTotal) / total : 0;
    paidByOrder.set(it.referenceId, (paidByOrder.get(it.referenceId) || 0) + (inv ? money(inv.paidAmount) * share : 0));
  }

  const rows: Record<string, any>[] = [];
  for (const o of orders) {
    for (const item of o.items || []) {
      rows.push({
        date: o.orderedAt,
        orderNumber: o.orderNumber,
        patient: fullName(o.patient),
        test: item.testName,
        category: testMap.get(item.labTestId) || "-",
        amount: r2(money(item.price)),
        paid: r2(paidByOrder.get(o.id) || 0),
        status: o.status || "-",
      });
    }
  }

  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: { amount: t("amount"), paid: t("paid") },
    cards: [{ label: "Orders", value: orders.length }, { label: "Tests", value: rows.length }, { label: "Bill Amount", value: t("amount") }],
  };
}

export async function operationReport(ctx: ExecContext): Promise<ExecResult> {
  const where: any = { tenantId: ctx.tenantId };
  if (ctx.filters.from || ctx.filters.to) {
    where.OR = [
      { scheduledDate: { gte: ctx.filters.from, lte: ctx.filters.to } },
      { createdAt: { gte: ctx.filters.from, lte: ctx.filters.to } },
    ];
  }
  if (ctx.filters.doctorId) {
    where.AND = [
      { OR: [
        { surgeonId: ctx.filters.doctorId },
        { assistantId: ctx.filters.doctorId },
        { anesthetistId: ctx.filters.doctorId },
      ] },
    ];
  }
  if (ctx.filters.status) where.status = ctx.filters.status;

  const cases = await ctx.prisma.oTCase.findMany({
    where,
    include: { patient: PATIENT_SELECT },
    orderBy: { scheduledDate: "desc" },
  });

  const docIds = [...new Set(cases.flatMap((c) => [c.surgeonId, c.assistantId, c.anesthetistId]).filter(Boolean))] as string[];
  const docMap = await doctorNames(ctx.prisma, ctx.tenantId, docIds);

  const otIds = cases.map((c) => c.id);
  const invItems = otIds.length
    ? await ctx.prisma.invoiceItem.findMany({
        where: { tenantId: ctx.tenantId, referenceType: { in: ["OT", "OPERATION", "SURGERY"] }, referenceId: { in: otIds } },
        select: { referenceId: true, invoiceId: true, lineTotal: true },
      })
    : [];
  const invIds = [...new Set(invItems.map((i) => i.invoiceId))];
  const invRows = invIds.length
    ? await ctx.prisma.invoice.findMany({
        where: { tenantId: ctx.tenantId, id: { in: invIds } },
        select: { id: true, totalAmount: true, paidAmount: true },
      })
    : [];
  const invMap = new Map(invRows.map((i) => [i.id, i]));
  const finByCase = new Map<string, { charges: number; payment: number }>();
  for (const it of invItems) {
    const inv = invMap.get(it.invoiceId);
    if (!inv) continue;
    const cur = finByCase.get(it.referenceId) || { charges: 0, payment: 0 };
    cur.charges += money(it.lineTotal);
    const total = money(inv.totalAmount);
    const share = total > 0 ? money(it.lineTotal) / total : 0;
    cur.payment += money(inv.paidAmount) * share;
    finByCase.set(it.referenceId, cur);
  }

  const rows = cases.map((c) => {
    const fin = finByCase.get(c.id) || { charges: 0, payment: 0 };
    return {
      date: c.scheduledDate || c.createdAt,
      patient: fullName(c.patient),
      uhid: uhid(c.patient),
      procedureName: c.procedureName,
      surgeon: c.surgeonId ? docMap.get(c.surgeonId) || "-" : "-",
      department: c.otRoom || "-",
      otRoom: c.otRoom || "-",
      charges: r2(fin.charges),
      billing: r2(fin.charges),
      payment: r2(fin.payment),
      status: c.status,
    };
  });

  const t = (k: string) => r2(sumOf(rows, k));
  return {
    rows,
    totals: { charges: t("charges"), billing: t("billing"), payment: t("payment") },
    cards: [{ label: "Operations", value: rows.length }, { label: "Charges", value: t("charges") }],
  };
}
