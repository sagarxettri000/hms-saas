import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  AppointmentsService,
  CreateAppointmentDto,
} from "./appointments.service";

function makeService(prisma: any): AppointmentsService {
  return new AppointmentsService(prisma, {
    create: jest.fn().mockResolvedValue({}),
  } as any);
}

describe("AppointmentsService", () => {
  describe("create", () => {
    const prisma = {
      doctorProfile: {
        findFirst: jest.fn(),
      },
      appointment: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data, include }) => ({
          ...data,
          id: "apt-1",
          patient: {
            id: "p1",
            firstName: "John",
            lastName: "Doe",
            mrn: "NBM-001",
          },
          doctor: { user: { firstName: "Dr", lastName: "Smith" } },
          department: { id: "dept-1", name: "OPD" },
        })),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      patient: {
        findFirst: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "new-patient" })),
      },
      availabilitySlot: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(prisma)),
      auditLog: { create: jest.fn() },
    };
    const service = makeService(prisma);

    const mockDoctor = {
      id: "doc-1",
      userId: "user-doc-1",
      departmentId: "dept-1",
    };

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.doctorProfile.findFirst.mockResolvedValue(mockDoctor);
      prisma.appointment.findFirst.mockResolvedValue(null); // no conflict
      prisma.appointment.create.mockResolvedValue({
        id: "apt-1",
        tenantId: "tenant-1",
        patientId: "p1",
        doctorId: "doc-1",
        appointmentDate: new Date("2025-01-15"),
        startTime: "10:00",
        endTime: "10:15",
        tokenNumber: "TK-001",
        status: "CONFIRMED",
        patient: {
          id: "p1",
          firstName: "John",
          lastName: "Doe",
          mrn: "NBM-001",
        },
        doctor: { user: { firstName: "Dr", lastName: "Smith" } },
      });
      prisma.patient.findFirst.mockResolvedValue({
        id: "p1",
        tenantId: "tenant-1",
      });
      jest.spyOn(service as any, "generateToken").mockResolvedValue("TK-001");
      jest.spyOn(service as any, "calculateEndTime").mockReturnValue("10:15");
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);
    });

    it("rejects when doctor not found", async () => {
      prisma.doctorProfile.findFirst.mockResolvedValue(null);
      await expect(
        service.create("tenant-1", {
          patientId: "p1",
          doctorId: "doc-999",
          appointmentDate: new Date("2025-01-15"),
          startTime: "10:00",
        } as CreateAppointmentDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects double booking for same doctor/time", async () => {
      prisma.appointment.findFirst.mockResolvedValue({ id: "existing-apt" });
      await expect(
        service.create("tenant-1", {
          patientId: "p1",
          doctorId: "doc-1",
          appointmentDate: new Date("2025-01-15"),
          startTime: "10:00",
        } as CreateAppointmentDto),
      ).rejects.toThrow(ConflictException);
    });

    it("creates appointment for existing patient", async () => {
      const dto: CreateAppointmentDto = {
        patientId: "p1",
        doctorId: "doc-1",
        appointmentDate: new Date("2025-01-15"),
        startTime: "10:00",
      };
      const result = await service.create("tenant-1", dto, "user-1");
      expect(result.id).toBe("apt-1");
      expect(result.tokenNumber).toBe("TK-001");
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-1",
            patientId: "p1",
            doctorId: "doc-1",
            status: "CONFIRMED",
          }),
        }),
      );
    });

    it("auto-registers new patient when patientId not provided", async () => {
      // Create fresh mocks for this test to avoid beforeEach interference
      const testPrisma = {
        doctorProfile: {
          findFirst: jest.fn().mockResolvedValue(mockDoctor),
        },
        appointment: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => ({
            ...data,
            id: "apt-1",
            patient: {
              id: "new-patient",
              firstName: "New",
              lastName: "Patient",
              mrn: "NBM-001",
            },
            doctor: { user: { firstName: "Dr", lastName: "Smith" } },
            department: { id: "dept-1", name: "OPD" },
          })),
        },
        patient: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...data, id: "new-patient" })),
        },
        availabilitySlot: { updateMany: jest.fn() },
        $transaction: jest.fn().mockImplementation((fn) => fn(testPrisma)),
        auditLog: { create: jest.fn() },
      };
      const testService = makeService(testPrisma);

      jest
        .spyOn(testService as any, "generateToken")
        .mockResolvedValue("TK-001");
      jest
        .spyOn(testService as any, "calculateEndTime")
        .mockReturnValue("10:15");
      jest.spyOn(testService as any, "logAudit").mockResolvedValue(undefined);

      const dto: CreateAppointmentDto = {
        patientId: undefined,
        doctorId: "doc-1",
        appointmentDate: new Date("2025-01-15"),
        startTime: "10:00",
        patientFirstName: "New",
        patientLastName: "Patient",
        patientMobile: "9876543210",
      };
      const result = await testService.create("tenant-1", dto, "user-1");
      expect(result.patientId).toBe("new-patient");
      expect(testPrisma.patient.create).toHaveBeenCalled();
    });

    it("sets status to CHECKED_IN for walk-in", async () => {
      const dto: CreateAppointmentDto = {
        patientId: "p1",
        doctorId: "doc-1",
        appointmentDate: new Date("2025-01-15"),
        startTime: "10:00",
        isWalkIn: true,
      };
      await service.create("tenant-1", dto, "user-1");
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CHECKED_IN",
            isWalkIn: true,
          }),
        }),
      );
    });
  });

  describe("findAll", () => {
    const prisma = {
      appointment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "apt-1",
            patientId: "p1",
            doctorId: "doc-1",
            status: "CONFIRMED",
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
    });

    it("filters by patientId", async () => {
      await service.findAll("tenant-1", { patientId: "p1" });
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            patientId: "p1",
          }),
        }),
      );
    });

    it("filters by doctorId", async () => {
      await service.findAll("tenant-1", { doctorId: "doc-1" });
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            doctorId: "doc-1",
          }),
        }),
      );
    });

    it("filters by status", async () => {
      await service.findAll("tenant-1", { status: "CONFIRMED,CHECKED_IN" });
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            status: { in: ["CONFIRMED", "CHECKED_IN"] },
          }),
        }),
      );
    });
  });

  describe("updateStatus", () => {
    const prisma = {
      appointment: {
        findFirst: jest.fn().mockResolvedValue({
          id: "apt-1",
          tenantId: "tenant-1",
          status: "CONFIRMED",
        }),
        update: jest.fn().mockImplementation(({ data }) => data),
      },
      auditLog: { create: jest.fn() },
    };
    const service = makeService(prisma);

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);
    });

    it("sets checkInAt when status becomes CHECKED_IN", async () => {
      await service.updateStatus("tenant-1", "apt-1", "CHECKED_IN", "user-1");
      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "apt-1" },
          data: expect.objectContaining({ checkInAt: expect.any(Date) }),
        }),
      );
    });

    it("sets completedAt when status becomes COMPLETED", async () => {
      await service.updateStatus("tenant-1", "apt-1", "COMPLETED", "user-1");
      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "apt-1" },
          data: expect.objectContaining({ completedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
