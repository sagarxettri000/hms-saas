import { NotificationsService } from "../notifications/notifications.service";
import { AdmissionsService, AddConsultantDto } from "./admissions.service";
import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";

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
  doctorProfile: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  consultantAssignment: { create: jest.fn(), findMany: jest.fn() },
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

describe("AdmissionsService.addConsultant", () => {
  const makeService = (prisma: any) =>
    new AdmissionsService(prisma as any, notificationsMock() as any);

  const admission = {
    id: "a1",
    tenantId,
    patientId: "p1",
    departmentId: "d1",
    status: "ADMITTED",
  };
  const doctor = { id: "doc1" };
  const dto: AddConsultantDto = { doctorId: "doc1", role: "SURGEON" };

  it("creates a dated secondary ConsultantAssignment for the admission", async () => {
    const prisma = prismaMock();
    prisma.admission.findFirst.mockResolvedValue(admission);
    prisma.doctorProfile.findFirst.mockResolvedValue(doctor);
    const created = { id: "ca1", admissionId: "a1", patientId: "p1", doctorId: "doc1", role: "SURGEON", isPrimary: false };
    prisma.consultantAssignment.create.mockResolvedValue(created);
    const service = makeService(prisma);

    const res = await service.addConsultant(tenantId, "a1", dto, "u1");

    expect(prisma.consultantAssignment.create).toHaveBeenCalledTimes(1);
    const data = prisma.consultantAssignment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId,
      admissionId: "a1",
      patientId: "p1",
      doctorId: "doc1",
      role: "SURGEON",
      isPrimary: false,
      departmentId: "d1",
      assignedBy: "u1",
    });
    // Enrichment lookup resolved doctor info onto the returned assignment.
    expect(prisma.doctorProfile.findMany).toHaveBeenCalled();
    expect(res).not.toBe(created);
    expect(res.doctor).toBeNull();
    // Secondary consultants never mutate the primary slot
    expect(data.isPrimary).toBe(false);
  });

  it("defaults the role to SECONDARY_CONSULTANT", async () => {
    const prisma = prismaMock();
    prisma.admission.findFirst.mockResolvedValue(admission);
    prisma.doctorProfile.findFirst.mockResolvedValue(doctor);
    prisma.consultantAssignment.create.mockResolvedValue({});
    const service = makeService(prisma);

    await service.addConsultant(tenantId, "a1", { doctorId: "doc1" }, "u1");

    const data = prisma.consultantAssignment.create.mock.calls[0][0].data;
    expect(data.role).toBe("SECONDARY_CONSULTANT");
  });

  it("refuses to reassign the PRIMARY_CONSULTANT slot via this route", async () => {
    const prisma = prismaMock();
    prisma.admission.findFirst.mockResolvedValue(admission);
    const service = makeService(prisma);

    await expect(
      service.addConsultant(tenantId, "a1", { doctorId: "doc1", role: "PRIMARY_CONSULTANT" }, "u1"),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.consultantAssignment.create).not.toHaveBeenCalled();
  });

  it("blocks consultants on discharged admissions", async () => {
    const prisma = prismaMock();
    prisma.admission.findFirst.mockResolvedValue({ ...admission, status: "DISCHARGED" });
    const service = makeService(prisma);

    await expect(
      service.addConsultant(tenantId, "a1", dto, "u1"),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects a doctor that does not belong to the tenant", async () => {
    const prisma = prismaMock();
    prisma.admission.findFirst.mockResolvedValue(admission);
    prisma.doctorProfile.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(
      service.addConsultant(tenantId, "a1", dto, "u1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns the full dated consultant history for the admission", async () => {
    const prisma = prismaMock();
    prisma.admission.findFirst.mockResolvedValue(admission);
    const history = [
      { id: "ca1", isPrimary: true },
      { id: "ca2", isPrimary: false },
    ];
    prisma.consultantAssignment.findMany.mockResolvedValue(history);
    const service = makeService(prisma);

    const res = await service.getConsultants(tenantId, "a1");

    const where = prisma.consultantAssignment.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ tenantId, admissionId: "a1" });
    // Enrichment keeps order (primary first, then dated history).
    expect(res.map((r: any) => r.id)).toEqual(["ca1", "ca2"]);
  });
});
