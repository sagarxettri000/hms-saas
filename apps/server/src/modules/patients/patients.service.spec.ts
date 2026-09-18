import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PatientsService, CreatePatientDto } from "./patients.service";

function makeService(prisma: any): PatientsService {
  return new PatientsService(prisma);
}

describe("PatientsService", () => {
  describe("create", () => {
    const prisma = {
      patient: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({
          ...data,
          id: "patient-1",
        })),
      },
      patientAllergy: { create: jest.fn() },
      patientCondition: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn) => fn(prisma)),
      auditLog: { create: jest.fn() },
    };
    const service = makeService(prisma);

    beforeEach(() => {
      jest.clearAllMocks();
      // mock findDuplicates to return empty
      jest.spyOn(service as any, "findDuplicates").mockResolvedValue([]);
      jest
        .spyOn(service as any, "generateMrn")
        .mockResolvedValue("NBM-202501-0001");
      jest.spyOn(service as any, "generateUid").mockReturnValue("UID-TEST123");
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);
    });

    it("creates patient with required fields", async () => {
      const dto: CreatePatientDto = {
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: new Date("1990-01-01"),
        gender: "MALE",
      };
      const result = (await service.create("tenant-1", dto, "user-1")) as any;
      expect(result.firstName).toBe("John");
      expect(result.lastName).toBe("Doe");
      expect(result.mrn).toBe("NBM-202501-0001");
    });

    it("detects duplicate by mobile", async () => {
      jest.spyOn(service as any, "findDuplicates").mockResolvedValue([
        {
          id: "p1",
          mrn: "NBM-001",
          firstName: "John",
          lastName: "Doe",
          mobile: "9876543210",
        },
      ]);
      const dto: CreatePatientDto = {
        firstName: "John",
        lastName: "Doe",
        mobile: "9876543210",
      };
      const result = await service.create("tenant-1", dto, "user-1");
      expect((result as any).duplicateDetected).toBe(true);
      expect((result as any).duplicates).toHaveLength(1);
    });

    it("detects duplicate by nationalId", async () => {
      jest.spyOn(service as any, "findDuplicates").mockResolvedValue([
        {
          id: "p1",
          mrn: "NBM-001",
          firstName: "Jane",
          lastName: "Doe",
          nationalId: "NAT123",
        },
      ]);
      const dto: CreatePatientDto = {
        firstName: "Jane",
        lastName: "Doe",
        nationalId: "NAT123",
      };
      const result = await service.create("tenant-1", dto, "user-1");
      expect((result as any).duplicateDetected).toBe(true);
    });

    it("stores allergies and chronic conditions", async () => {
      const dto: CreatePatientDto = {
        firstName: "Bob",
        lastName: "Smith",
        allergies: [{ allergen: "Penicillin", severity: "HIGH" }],
        chronicConditions: [{ name: "Diabetes", icd10Code: "E11" }],
      };
      await service.create("tenant-1", dto, "user-1");
      expect(prisma.patientAllergy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allergen: "Penicillin",
            severity: "HIGH",
          }),
        }),
      );
      expect(prisma.patientCondition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "Diabetes", icd10Code: "E11" }),
        }),
      );
    });
  });

  describe("findAll", () => {
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1",
            firstName: "John",
            lastName: "Doe",
            mrn: "NBM-001",
            _count: { appointments: 2 },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = makeService(prisma);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("returns paginated results", async () => {
      const result = await service.findAll("tenant-1", { page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it("filters by search query", async () => {
      await service.findAll("tenant-1", { search: "John" });
      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                firstName: { contains: "John", mode: "insensitive" },
              }),
            ]),
          }),
        }),
      );
    });

    it("filters by patientType", async () => {
      await service.findAll("tenant-1", { patientType: "IPD" });
      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ patientType: "IPD" }),
        }),
      );
    });
  });

  describe("findById", () => {
    const prisma = {
      patient: {
        findFirst: jest.fn(),
      },
    };
    const service = makeService(prisma);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("returns patient with relations", async () => {
      const mockPatient = {
        id: "p1",
        firstName: "John",
        allergies: [],
        conditions: [],
      };
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      const result = await service.findById("tenant-1", "p1");
      expect(result).toEqual(mockPatient);
    });

    it("throws NotFoundException for non-existent patient", async () => {
      prisma.patient.findFirst.mockResolvedValue(null);
      await expect(service.findById("tenant-1", "nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    const prisma = {
      patient: {
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => data),
      },
      patientAllergy: { deleteMany: jest.fn(), create: jest.fn() },
      patientCondition: { deleteMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn) => fn(prisma)),
      auditLog: { create: jest.fn() },
    };
    const service = makeService(prisma);

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.patient.findFirst.mockResolvedValue({ id: "p1", tenantId: "t1" });
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);
    });

    it("updates patient fields", async () => {
      const result = await service.update(
        "tenant-1",
        "p1",
        { firstName: "Updated" },
        "user-1",
      );
      expect(result.firstName).toBe("Updated");
      expect(prisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p1" },
          data: expect.objectContaining({
            firstName: "Updated",
            updatedBy: "user-1",
          }),
        }),
      );
    });

    it("replaces allergies when provided", async () => {
      await service.update(
        "tenant-1",
        "p1",
        { allergies: [{ allergen: "Latex" }] },
        "user-1",
      );
      expect(prisma.patientAllergy.deleteMany).toHaveBeenCalledWith({
        where: { patientId: "p1" },
      });
      expect(prisma.patientAllergy.create).toHaveBeenCalled();
    });
  });

  describe("remove (soft delete)", () => {
    const prisma = {
      patient: {
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => data),
      },
      auditLog: { create: jest.fn() },
    };
    const service = makeService(prisma);

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.patient.findFirst.mockResolvedValue({ id: "p1", tenantId: "t1" });
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);
    });

    it("soft deletes patient", async () => {
      const result = await service.remove("tenant-1", "p1", "user-1");
      expect(result.status).toBe("INACTIVE");
      expect(result.deletedAt).toBeDefined();
    });
  });
});
