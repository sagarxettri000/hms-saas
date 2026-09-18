import { NotFoundException } from "@nestjs/common";
import { AdmissionsService } from "./admissions.service";

const tenantId = "t1";

const prismaMock = (): any => ({
  patient: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  admission: {
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
  },
  bedAllocation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  bed: { findFirst: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn((fn) => fn(prismaMock())),
});

const notificationsMock = () => ({ create: jest.fn() });

describe("AdmissionsService.findAll (search)", () => {
  it("builds a search filter across admissionNumber and patient name/mrn", async () => {
    const prisma = prismaMock();
    const service = new AdmissionsService(
      prisma as any,
      notificationsMock() as any,
    );

    await service.findAll(tenantId, { search: "  JhAn  " } as any);

    const where = prisma.admission.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(tenantId);
    expect(where.OR).toEqual([
      { admissionNumber: { contains: "JhAn", mode: "insensitive" } },
      {
        patient: {
          is: {
            OR: [
              { firstName: { contains: "JhAn", mode: "insensitive" } },
              { lastName: { contains: "JhAn", mode: "insensitive" } },
              { mrn: { contains: "JhAn", mode: "insensitive" } },
            ],
          },
        },
      },
    ]);
  });

  it("does not add OR when search is empty/whitespace", async () => {
    const prisma = prismaMock();
    const service = new AdmissionsService(
      prisma as any,
      notificationsMock() as any,
    );

    await service.findAll(tenantId, { search: "   " } as any);

    const where = prisma.admission.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  it("combines status filter with search", async () => {
    const prisma = prismaMock();
    const service = new AdmissionsService(
      prisma as any,
      notificationsMock() as any,
    );

    await service.findAll(tenantId, {
      status: "ADMITTED",
      search: "NBM",
    } as any);

    const where = prisma.admission.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("ADMITTED");
    expect(where.OR).toHaveLength(2);
  });

  it("paginates and returns total", async () => {
    const prisma = prismaMock();
    prisma.admission.findMany.mockResolvedValue([{ id: "a1" }]);
    prisma.admission.count.mockResolvedValue(21);
    const service = new AdmissionsService(
      prisma as any,
      notificationsMock() as any,
    );

    const res = await service.findAll(tenantId, { page: 2, limit: 20 } as any);

    expect(prisma.admission.findMany.mock.calls[0][0].skip).toBe(20);
    expect(res.total).toBe(21);
    expect(res.totalPages).toBe(2);
  });
});

describe("AdmissionsService.findById", () => {
  it("throws NotFound for a foreign-tenant id (IDOR guard)", async () => {
    const prisma = prismaMock();
    prisma.admission.findFirst.mockResolvedValue(null);
    const service = new AdmissionsService(
      prisma as any,
      notificationsMock() as any,
    );

    await expect(service.findById(tenantId, "other-tenant-id")).rejects.toThrow(
      NotFoundException,
    );
    // tenant scope is always part of the lookup
    expect(prisma.admission.findFirst.mock.calls[0][0].where.tenantId).toBe(
      tenantId,
    );
  });
});
