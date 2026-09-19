import { BadRequestException } from "@nestjs/common";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  const prisma = {
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    invoiceItem: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    insuranceClaim: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    insuranceProvider: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    appointment: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    patient: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    admission: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    bed: { count: jest.fn().mockResolvedValue(0) },
    doctorProfile: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    labOrder: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    radiologyOrder: { count: jest.fn().mockResolvedValue(0) },
    encounter: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    refund: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: 0 }),
    },
    department: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        name: "Test Hospital",
        city: "Kathmandu",
        addressLine1: "Test St",
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        firstName: "Ada",
        lastName: "Lovelace",
      }),
    },
  };
  const service = new ReportsService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it("rejects an invalid from date", async () => {
    await expect(
      service.getSummary("t1", { from: "not-a-date" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects an invalid to date", async () => {
    await expect(service.revenueByStatus("t1", { to: "nope" })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("computes revenue, collected and outstanding", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { totalAmount: 100, paidAmount: 60, status: "PAID" },
      { totalAmount: 200, paidAmount: 0, status: "PARTIAL" },
    ]);
    const res = await service.getSummary("t1");
    expect(res.totalRevenue).toBe(300);
    expect(res.collected).toBe(60);
    expect(res.outstanding).toBe(240);
  });

  it("returns zero outstanding when fully collected", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { totalAmount: 50, paidAmount: 50, status: "PAID" },
    ]);
    const res = await service.getSummary("t1");
    expect(res.outstanding).toBe(0);
  });

  it("scopes the invoice query to the tenant and excludes cancelled", async () => {
    await service.revenueByStatus("t1", {
      from: "2026-08-01",
      to: "2026-08-15",
    });
    const arg = prisma.invoice.findMany.mock.calls[0][0];
    const to = new Date("2026-08-15");
    to.setHours(23, 59, 59, 999);
    expect(arg.where.tenantId).toBe("t1");
    expect(arg.where.status).toEqual({ not: "CANCELLED" });
    expect(arg.where.issuedDate).toEqual({
      gte: new Date("2026-08-01"),
      lte: to,
    });
  });

  it("aggregates revenue by status", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { status: "PAID", totalAmount: 100, paidAmount: 100, dueAmount: 0 },
      { status: "PAID", totalAmount: 50, paidAmount: 50, dueAmount: 0 },
      { status: "OVERDUE", totalAmount: 30, paidAmount: 0, dueAmount: 30 },
    ]);
    const res = await service.revenueByStatus("t1");
    expect(res).toHaveLength(2);
    expect(res.find((r) => r.status === "PAID")).toEqual({
      status: "PAID",
      count: 2,
      amount: 150,
      collected: 150,
    });
    expect(res.find((r) => r.status === "OVERDUE")).toEqual({
      status: "OVERDUE",
      count: 1,
      amount: 30,
      collected: 0,
    });
    expect(res[0].status).toBe("PAID");
  });

  it("groups appointments/admissions/lab by status", async () => {
    prisma.appointment.groupBy.mockResolvedValue([
      { status: "SCHEDULED", _count: 3 },
    ]);
    prisma.admission.groupBy.mockResolvedValue([
      { status: "ADMITTED", _count: 1 },
    ]);
    prisma.labOrder.groupBy.mockResolvedValue([
      { status: "PENDING", _count: 5 },
    ]);
    const [a, ad, l] = await Promise.all([
      service.appointmentsByStatus("t1"),
      service.admissionsByStatus("t1"),
      service.labByStatus("t1"),
    ]);
    expect(a).toEqual([{ status: "SCHEDULED", count: 3 }]);
    expect(ad).toEqual([{ status: "ADMITTED", count: 1 }]);
    expect(l).toEqual([{ status: "PENDING", count: 5 }]);
  });

  it("builds doctor workload with resolved names, sorted and capped", async () => {
    prisma.appointment.groupBy.mockResolvedValue([
      { doctorId: "d1", _count: 8 },
      { doctorId: "d2", _count: 2 },
      { doctorId: "d3", _count: 5 },
    ]);
    prisma.doctorProfile.findMany.mockResolvedValue([
      { id: "d1", user: { firstName: "Alice", lastName: "A" } },
      { id: "d2", user: { firstName: "Bob", lastName: "B" } },
      { id: "d3", user: { firstName: "Cara", lastName: "C" } },
    ]);
    const res = await service.doctorWorkload("t1");
    expect(res.map((r) => r.name)).toEqual(["Alice A", "Cara C", "Bob B"]);
    expect(res[0].count).toBe(8);
    expect(res.map((r) => r.doctorId)).toEqual(["d1", "d3", "d2"]);
  });

  it("returns an empty workload when no appointments exist", async () => {
    prisma.appointment.groupBy.mockResolvedValue([]);
    const res = await service.doctorWorkload("t1");
    expect(res).toEqual([]);
    expect(prisma.doctorProfile.findMany).not.toHaveBeenCalled();
  });

  it("builds department stats with resolved names", async () => {
    prisma.encounter.groupBy.mockResolvedValue([
      { departmentId: "dept1", _count: 4 },
    ]);
    prisma.department.findMany.mockResolvedValue([
      { id: "dept1", name: "Cardiology" },
    ]);
    const res = await service.departmentStats("t1");
    expect(res).toEqual([
      { departmentId: "dept1", name: "Cardiology", count: 4 },
    ]);
  });

  it("lists analysis report definitions grouped by category", () => {
    const tree = service.getAnalysisTree();
    const ids = tree.flatMap((c) => c.reports.map((r) => r.id));
    expect(ids).toContain("credit-sales");
    expect(ids).toContain("geographical-stats");
    expect(
      tree.find((c) => c.id === "REVENUE")?.reports.length,
    ).toBeGreaterThan(20);
    expect(
      tree.find((c) => c.id === "STATISTICS")?.reports.length,
    ).toBeGreaterThan(20);
  });

  it("returns definitions for every report id in the tree", () => {
    const tree = service.getAnalysisTree();
    const ids = tree.flatMap((c) => c.reports.map((r) => r.id));
    for (const id of ids) {
      const def = service.getAnalysisDefinition(id);
      expect(def.id).toBe(id);
      expect(def.columns.length).toBeGreaterThan(0);
    }
  });

  it("throws for an unknown report id", () => {
    expect(() => service.getAnalysisDefinition("nope")).toThrow();
  });

  it("resolves department filter options scoped to the tenant", async () => {
    prisma.department.findMany.mockResolvedValue([
      { id: "d1", name: "Cardiology" },
      { id: "d2", name: "Ortho" },
    ]);
    const res = await service.getAnalysisOptions("t1", "department");
    expect(res).toEqual([
      { value: "d1", label: "Cardiology" },
      { value: "d2", label: "Ortho" },
    ]);
    const arg = prisma.department.findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe("t1");
    expect(arg.where.isActive).toBe(true);
  });

  it("generates credit-sales from live invoice data with totals", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        issuedDate: new Date("2026-08-01"),
        invoiceNumber: "INV-1",
        subtotal: 100,
        discountAmount: 10,
        taxAmount: 5,
        totalAmount: 95,
        paidAmount: 50,
        dueAmount: 45,
        isCredit: true,
        patient: { firstName: "A", lastName: "B" },
        items: [],
      },
      {
        issuedDate: new Date("2026-08-02"),
        invoiceNumber: "INV-2",
        subtotal: 200,
        discountAmount: 0,
        taxAmount: 20,
        totalAmount: 220,
        paidAmount: 220,
        dueAmount: 0,
        isCredit: false,
        patient: { firstName: "C", lastName: "D" },
        items: [],
      },
    ]);
    const res = await service.generateAnalysis(
      "t1",
      undefined,
      "credit-sales",
      {
        from: "2026-08-01",
        to: "2026-08-31",
      },
    );
    expect(res.report.id).toBe("credit-sales");
    expect(res.count).toBe(2);
    expect(res.rows[0]).toMatchObject({
      invoiceNumber: "INV-1",
      gross: 100,
      net: 95,
    });
    expect(res.totals.gross).toBe(300);
    expect(res.meta.hospital.name).toBe("Test Hospital");
    const invoiceArg = prisma.invoice.findMany.mock.calls[0][0];
    expect(invoiceArg.where.tenantId).toBe("t1");
  });

  it("rejects an invalid from date on generate", async () => {
    await expect(
      service.generateAnalysis("t1", undefined, "credit-sales", {
        from: "not-a-date",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects an out-of-range from date on generate", async () => {
    await expect(
      service.generateAnalysis("t1", undefined, "credit-sales", {
        from: "0000-01-01",
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.generateAnalysis("t1", undefined, "credit-sales", {
        from: "9999-12-31",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects an out-of-range to date on generate", async () => {
    await expect(
      service.generateAnalysis("t1", undefined, "credit-sales", {
        to: "9999-01-01",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a to date before the from date", async () => {
    await expect(
      service.generateAnalysis("t1", undefined, "credit-sales", {
        from: "2026-08-01",
        to: "2025-01-01",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects an invalid month on generate", async () => {
    await expect(
      service.generateAnalysis("t1", undefined, "credit-sales", {
        month: "13",
        year: "2026",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects an invalid year on generate", async () => {
    await expect(
      service.generateAnalysis("t1", undefined, "credit-sales", {
        month: "3",
        year: "9999",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("scopes the generated query to the selected department", async () => {
    prisma.invoice.findMany.mockResolvedValue([]);
    await service.generateAnalysis("t1", undefined, "credit-sales", {
      department: "dept1",
    });
    const arg = prisma.invoice.findMany.mock.calls[0][0];
    expect(arg.where.items.some.departmentId).toBe("dept1");
  });

  it("computes the analytics overview with KPIs, trend and aging", async () => {
    prisma.invoice.aggregate
      .mockResolvedValueOnce({
        _sum: { totalAmount: 1000, paidAmount: 600, dueAmount: 400 },
        _count: 4,
      })
      .mockResolvedValueOnce({
        _sum: { totalAmount: 800, paidAmount: 500, dueAmount: 300 },
        _count: 3,
      });
    prisma.invoice.groupBy
      .mockResolvedValueOnce([
        {
          type: "OPD",
          _sum: { totalAmount: 600, paidAmount: 400, dueAmount: 200 },
          _count: 2,
        },
        {
          type: "LAB",
          _sum: { totalAmount: 400, paidAmount: 200, dueAmount: 200 },
          _count: 2,
        },
      ])
      .mockResolvedValueOnce([
        { status: "PAID", _count: 2 },
        { status: "OVERDUE", _count: 2 },
      ])
      .mockResolvedValueOnce([
        {
          patientId: "p1",
          _sum: { totalAmount: 600, paidAmount: 400, dueAmount: 200 },
          _count: 2,
        },
      ]);
    prisma.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 550 }, _count: 3 })
      .mockResolvedValueOnce({ _sum: { amount: 500 }, _count: 3 });
    prisma.payment.groupBy.mockResolvedValueOnce([
      { method: "CASH", _sum: { amount: 400 }, _count: 2 },
      { method: "CARD", _sum: { amount: 150 }, _count: 1 },
    ]);
    prisma.refund.aggregate.mockResolvedValueOnce({
      _sum: { amount: 50 },
      _count: 1,
    });
    prisma.invoice.findMany
      .mockResolvedValueOnce([
        { issuedDate: new Date(), totalAmount: 600 },
        { issuedDate: new Date(), totalAmount: 400 },
      ])
      .mockResolvedValueOnce([
        { dueAmount: 200, dueDate: new Date(), issuedDate: new Date() },
      ])
      .mockResolvedValueOnce([]);
    prisma.payment.findMany
      .mockResolvedValueOnce([{ paidAt: new Date(), amount: 550 }])
      .mockResolvedValueOnce([]);
    prisma.invoiceItem.groupBy.mockResolvedValueOnce([
      { departmentId: "d1", _sum: { lineTotal: 700 } },
    ]);
    prisma.insuranceClaim.groupBy
      .mockResolvedValueOnce([
        {
          status: "APPROVED",
          _count: 2,
          _sum: { claimAmount: 300, approvedAmount: 250, receivedAmount: 100 },
        },
      ])
      .mockResolvedValueOnce([
        {
          providerId: "prov1",
          _count: 2,
          _sum: { claimAmount: 300, approvedAmount: 250, receivedAmount: 100 },
        },
      ]);
    prisma.patient.findMany.mockResolvedValueOnce([
      { id: "p1", mrn: "M1", firstName: "Asha", middleName: null, lastName: "Rai" },
    ]);
    prisma.department.findMany.mockResolvedValueOnce([
      { id: "d1", name: "Cardiology" },
    ]);
    prisma.insuranceProvider.findMany.mockResolvedValueOnce([
      { id: "prov1", name: "Nepal Insurance", type: "NATIONAL" },
    ]);

    const res = await service.getAnalyticsOverview("t1", { days: "30" });

    expect(res.range.days).toBe(30);
    expect(res.kpis.revenue).toBe(1000);
    expect(res.kpis.collections).toBe(550);
    expect(res.kpis.refunds).toBe(50);
    expect(res.kpis.netCollections).toBe(500);
    expect(res.kpis.outstanding).toBe(400);
    expect(res.kpis.collectionRate).toBeCloseTo(55);
    expect(res.kpis.invoices).toBe(4);
    expect(res.kpis.paidInvoices).toBe(2);
    expect(res.kpis.overdueInvoices).toBe(2);
    expect(res.kpis.prevRevenue).toBe(800);
    expect(res.kpis.revenueDelta).toBeCloseTo(25);
    expect(res.trend).toHaveLength(30);
    expect(res.trend.reduce((s: number, t: any) => s + t.revenue, 0)).toBe(1000);
    expect(res.revenueByType[0]).toMatchObject({
      type: "OPD",
      label: "Outpatient",
      amount: 600,
    });
    expect(res.collectionByMethod[0]).toMatchObject({
      method: "CASH",
      amount: 400,
    });
    expect(
      res.outstandingAging.reduce((s: number, b: any) => s + b.amount, 0),
    ).toBe(200);
    expect(res.topPayers[0]).toMatchObject({
      patientId: "p1",
      name: "Asha Rai",
      billed: 600,
    });
    expect(res.revenueByDepartment[0]).toMatchObject({
      name: "Cardiology",
      amount: 700,
    });
    expect(res.insurance.claimed).toBe(300);
    expect(res.insurance.received).toBe(100);
    expect(res.insurance.topProviders[0]).toMatchObject({
      name: "Nepal Insurance",
      claimed: 300,
    });
    const invArg = prisma.invoice.aggregate.mock.calls[0][0];
    expect(invArg.where.tenantId).toBe("t1");
    expect(invArg.where.status).toEqual({ not: "CANCELLED" });
  });

  it("rejects an invalid from date on analytics", async () => {
    await expect(
      service.getAnalyticsOverview("t1", { from: "not-a-date" }),
    ).rejects.toThrow(BadRequestException);
  });
});
