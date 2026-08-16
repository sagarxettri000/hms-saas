import { BadRequestException } from "@nestjs/common";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  const prisma = {
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    appointment: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    patient: { count: jest.fn().mockResolvedValue(0) },
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
    department: {
      findMany: jest.fn().mockResolvedValue([]),
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
    await expect(
      service.revenueByStatus("t1", { to: "nope" }),
    ).rejects.toThrow(BadRequestException);
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
    await service.revenueByStatus("t1", { from: "2026-08-01", to: "2026-08-15" });
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
});
