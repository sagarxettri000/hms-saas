import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ControlledSubstancesService } from "./controlled-substances.service";

function makeService(prisma: any): ControlledSubstancesService {
  return new ControlledSubstancesService(prisma);
}

describe("ControlledSubstancesService", () => {
  describe("create", () => {
    const prisma = {
      controlledSubstanceLog: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "l1" })),
      },
    };
    const service = makeService(prisma as any);

    beforeEach(() => jest.clearAllMocks());

    it("rejects a missing drug", async () => {
      await expect(
        service.create("t1", { quantity: 2, drug: "" }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a quantity below 1", async () => {
      await expect(
        service.create("t1", { drug: "Morphine", quantity: 0 }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a log entry with a username", async () => {
      const result = await service.create(
        "t1",
        { drug: "Morphine", quantity: 2, patient: "P" },
        "u1",
        "Dr. A",
      );
      expect(result.drug).toBe("Morphine");
      expect(result.quantity).toBe(2);
      expect(result.loggedBy).toBe("Dr. A");
      expect(result.loggedAt).toBeInstanceOf(Date);
    });
  });

  describe("remove", () => {
    it("throws when the entry does not exist", async () => {
      const prisma = {
        controlledSubstanceLog: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = makeService(prisma as any);
      await expect(service.remove("t1", "l-x")).rejects.toThrow(NotFoundException);
    });

    it("deletes an existing entry", async () => {
      const prisma = {
        controlledSubstanceLog: {
          findFirst: jest.fn().mockResolvedValue({ id: "l1", tenantId: "t1" }),
          delete: jest.fn().mockResolvedValue({ id: "l1" }),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.remove("t1", "l1");
      expect(result.success).toBe(true);
      expect(prisma.controlledSubstanceLog.delete).toHaveBeenCalledWith({
        where: { id: "l1" },
      });
    });
  });
});
