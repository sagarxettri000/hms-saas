import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdverseEventsService } from "./adverse-events.service";

function makeService(prisma: any): AdverseEventsService {
  return new AdverseEventsService(prisma);
}

describe("AdverseEventsService", () => {
  describe("create", () => {
    const prisma = {
      patient: {
        findFirst: jest.fn().mockResolvedValue({ id: "p1" }),
      },
      adverseEvent: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({
            ...data,
            id: "e1",
            status: "OPEN",
          })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = makeService(prisma as any);

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.patient.findFirst.mockResolvedValue({ id: "p1" });
    });

    it("rejects a missing tenant", async () => {
      await expect(
        service.create("", { type: "MEDICATION", description: "x" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a missing description", async () => {
      await expect(
        service.create("t1", { type: "MEDICATION", description: "" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an unknown patient", async () => {
      prisma.patient.findFirst.mockResolvedValue(null);
      await expect(
        service.create("t1", {
          patientId: "p-ghost",
          type: "FALL",
          description: "patient fell",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates an event with defaults", async () => {
      const result = await service.create(
        "t1",
        { patientId: "p1", type: "MEDICATION", description: "wrong dose" },
        "u1",
      );
      expect(result.severity).toBe("MODERATE");
      expect(result.status).toBe("OPEN");
      expect(result.reportedBy).toBe("u1");
      expect(prisma.adverseEvent.create).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    const prisma = {
      adverseEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: "e1", tenantId: "t1" }),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: "e1", ...data })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = makeService(prisma as any);

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.adverseEvent.findFirst.mockResolvedValue({
        id: "e1",
        tenantId: "t1",
      });
    });

    it("throws when the event is not found", async () => {
      prisma.adverseEvent.findFirst.mockResolvedValue(null);
      await expect(
        service.update("t1", "e1", { severity: "SEVERE" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("records closedAt when status becomes CLOSED", async () => {
      const result = await service.update(
        "t1",
        "e1",
        { status: "CLOSED", rootCause: "looked into it" },
        "u1",
      );
      expect(result.status).toBe("CLOSED");
      expect(result.closedAt).toBeInstanceOf(Date);
      expect(result.closedBy).toBe("u1");
      expect(result.rootCause).toBe("looked into it");
    });

    it("updates severity without closing", async () => {
      const result = await service.update("t1", "e1", { severity: "SEVERE" });
      expect(result.severity).toBe("SEVERE");
      expect(result.closedAt).toBeUndefined();
    });
  });

  describe("dashboard", () => {
    it("returns open/severe/total/byType aggregates", async () => {
      const prisma = {
        adverseEvent: {
          count: jest
            .fn()
            .mockResolvedValueOnce(3)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(5),
          groupBy: jest.fn().mockResolvedValue([
            { type: "MEDICATION", _count: 4 },
            { type: "FALL", _count: 1 },
          ]),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.dashboard("t1");
      expect(result.open).toBe(3);
      expect(result.severe).toBe(1);
      expect(result.total).toBe(5);
      expect(result.byType).toHaveLength(2);
    });
  });
});
