import { BadRequestException } from "@nestjs/common";
import { AttendanceService } from "./attendance.service";

function makeService(prisma: any): AttendanceService {
  return new AttendanceService(prisma);
}

describe("AttendanceService", () => {
  describe("clockIn", () => {
    it("returns an existing open session instead of creating a new one", async () => {
      const open = { id: "a1", clockOut: null };
      const prisma = {
        attendanceRecord: {
          findFirst: jest.fn().mockResolvedValue(open),
          create: jest.fn(),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.clockIn("t1", { staffName: "Dr. X" }, "u1");
      expect(result).toBe(open);
      expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
    });

    it("creates a new record when none is open", async () => {
      const prisma = {
        attendanceRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...data, id: "a1" })),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.clockIn("t1", { staffName: "Dr. X" }, "u1");
      expect(result.id).toBe("a1");
      expect(result.clockOut).toBeUndefined();
      expect(result.createdBy).toBe("u1");
    });
  });

  describe("clockOut", () => {
    it("throws when there is no open session", async () => {
      const prisma = {
        attendanceRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      };
      const service = makeService(prisma as any);
      await expect(service.clockOut("t1", "u1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("closes the open session and computes hours", async () => {
      const open = { id: "a1", clockIn: new Date(Date.now() - 3600000), clockOut: null };
      const prisma = {
        attendanceRecord: {
          findFirst: jest.fn().mockResolvedValue(open),
          update: jest.fn().mockImplementation(({ data }) => ({ id: "a1", ...data })),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.clockOut("t1", "u1");
      expect(result.clockOut).toBeInstanceOf(Date);
      expect(result.hours).toBeGreaterThan(0);
      expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "a1" } }),
      );
    });
  });

  describe("enroll", () => {
    it("rejects a missing program", async () => {
      const prisma = { staffTraining: { create: jest.fn() } };
      const service = makeService(prisma as any);
      await expect(service.enroll("t1", { program: "" }, "u1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("enrolls a staff member", async () => {
      const prisma = {
        staffTraining: {
          create: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...data, id: "tr1" })),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.enroll("t1", { program: "CPR" }, "u1", "Dr. X");
      expect(result.program).toBe("CPR");
      expect(result.staffName).toBe("Dr. X");
      expect(result.enrolledAt).toBeInstanceOf(Date);
    });
  });

  describe("toggleTraining", () => {
    it("throws when the record is missing", async () => {
      const prisma = {
        staffTraining: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      };
      const service = makeService(prisma as any);
      await expect(service.toggleTraining("t1", "tr-x")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("sets completedAt when previously incomplete", async () => {
      const prisma = {
        staffTraining: {
          findFirst: jest.fn().mockResolvedValue({ id: "tr1", completedAt: null }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: "tr1", ...data })),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.toggleTraining("t1", "tr1");
      expect(result.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("setCertificateDate", () => {
    it("sets the certificate date", async () => {
      const prisma = {
        staffTraining: {
          findFirst: jest.fn().mockResolvedValue({ id: "tr1", tenantId: "t1" }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: "tr1", ...data })),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.setCertificateDate("t1", "tr1", "2026-01-01");
      expect(result.certificateDate).toBeInstanceOf(Date);
    });
  });
});
