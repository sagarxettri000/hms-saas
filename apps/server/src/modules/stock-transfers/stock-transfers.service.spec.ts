import { BadRequestException } from "@nestjs/common";
import { StockTransfersService } from "./stock-transfers.service";

function makeService(prisma: any): StockTransfersService {
  return new StockTransfersService(prisma);
}

describe("StockTransfersService", () => {
  describe("create", () => {
    const prisma = {
      stockTransfer: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "st1" })),
      },
    };
    const service = makeService(prisma as any);

    beforeEach(() => jest.clearAllMocks());

    it("rejects a missing quantity", async () => {
      await expect(
        service.create("t1", { fromStore: "A", toStore: "B", quantity: 0 }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects missing stores", async () => {
      await expect(
        service.create("t1", { fromStore: "A", quantity: 5 }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a completed transfer", async () => {
      const result = await service.create(
        "t1",
        { fromStore: "A", toStore: "B", itemName: "Paracetamol", quantity: 5 },
        "u1",
      );
      expect(result.status).toBe("COMPLETED");
      expect(result.quantity).toBe(5);
      expect(result.createdBy).toBe("u1");
      expect(result.transferredAt).toBeInstanceOf(Date);
    });
  });

  describe("findAll", () => {
    it("returns paginated tenant-scoped transfers", async () => {
      const prisma = {
        stockTransfer: {
          findMany: jest.fn().mockResolvedValue([{ id: "st1" }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.findAll("t1", { limit: 10 });
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(prisma.stockTransfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "t1" } }),
      );
    });
  });
});
