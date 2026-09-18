import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PreauthorizationsService } from "./preauthorizations.service";

function makeService(prisma: any): PreauthorizationsService {
  return new PreauthorizationsService(prisma);
}

describe("PreauthorizationsService", () => {
  describe("create", () => {
    const prisma = {
      insurancePreauthorization: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "pa1" })),
      },
    };
    const service = makeService(prisma as any);

    beforeEach(() => jest.clearAllMocks());

    it("rejects a missing treatment", async () => {
      await expect(
        service.create("t1", { estimatedCost: 500, treatment: "" }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an invalid estimated cost", async () => {
      await expect(
        service.create("t1", { treatment: "MRI", estimatedCost: -5 }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a request with defaults", async () => {
      const result = await service.create(
        "t1",
        {
          patientName: "P",
          providerName: "Prov",
          treatment: "MRI",
          estimatedCost: 500,
        },
        "u1",
      );
      expect(result.treatment).toBe("MRI");
      expect(result.estimatedCost).toBe(500);
      expect(result.createdBy).toBe("u1");
      expect(result.status).toBeUndefined();
      expect(prisma.insurancePreauthorization.create).toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("returns paginated data scoped to tenant", async () => {
      const prisma = {
        insurancePreauthorization: {
          findMany: jest.fn().mockResolvedValue([{ id: "pa1" }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.findAll("t1", { limit: 10 });
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(prisma.insurancePreauthorization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "t1" } }),
      );
    });
  });

  describe("findById", () => {
    it("throws when not found", async () => {
      const prisma = {
        insurancePreauthorization: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const service = makeService(prisma as any);
      await expect(service.findById("t1", "pa-x")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("decide", () => {
    const record = { id: "pa1", tenantId: "t1", estimatedCost: 500 };
    const prisma = {
      insurancePreauthorization: {
        findFirst: jest.fn().mockImplementation(() => record),
        update: jest.fn().mockImplementation(({ data }) => {
          Object.assign(record, data);
          return record;
        }),
      },
    };
    const service = makeService(prisma as any);

    beforeEach(() => jest.clearAllMocks());

    it("rejects an invalid decision", async () => {
      await expect(service.decide("t1", "pa1", "MAYBE")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("approves with the provided amount", async () => {
      const result = await service.decide("t1", "pa1", "APPROVED", 450);
      expect(result.approvedAmount).toBe(450);
      expect(result.status).toBe("APPROVED");
      expect(result.decisionDate).toBeInstanceOf(Date);
      expect(prisma.insurancePreauthorization.update).toHaveBeenCalled();
    });

    it("denies and clears the approved amount", async () => {
      const result = await service.decide("t1", "pa1", "DENIED");
      expect(result.status).toBe("DENIED");
      expect(result.approvedAmount).toBeNull();
    });
  });
});
