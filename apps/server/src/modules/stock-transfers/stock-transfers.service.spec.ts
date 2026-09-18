import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { StockTransfersService } from "./stock-transfers.service";

function makeTx(overrides: any = {}) {
  return {
    inventoryItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    inventoryTransaction: { create: jest.fn() },
    stockTransfer: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ ...data, id: "st1" })),
    },
    ...overrides,
  };
}

function makePrisma(tx: any, outside: any = {}) {
  return {
    store: { findFirst: jest.fn() },
    inventoryItem: { findFirst: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(tx)),
    ...outside,
  };
}

function baseDto() {
  return {
    fromStoreId: "A",
    toStoreId: "B",
    inventoryItemId: "i1",
    quantity: 5,
  };
}

describe("StockTransfersService", () => {
  describe("create", () => {
    it("rejects a missing quantity", async () => {
      const tx = makeTx();
      const service = makeService(makePrisma(tx) as any);
      await expect(
        service.create("t1", { ...baseDto(), quantity: 0 }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects missing stores", async () => {
      const tx = makeTx();
      const service = makeService(makePrisma(tx) as any);
      await expect(
        service.create("t1", { ...baseDto(), toStoreId: undefined }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a missing inventory item", async () => {
      const tx = makeTx();
      const service = makeService(makePrisma(tx) as any);
      await expect(
        service.create(
          "t1",
          { ...baseDto(), inventoryItemId: undefined },
          "u1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects transferring into the same store", async () => {
      const tx = makeTx();
      const service = makeService(makePrisma(tx) as any);
      await expect(
        service.create("t1", { ...baseDto(), toStoreId: "A" }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFound when the item is not in the source store", async () => {
      const prisma = makePrisma(makeTx());
      prisma.store.findFirst.mockResolvedValue({ id: "A", name: "Store A" });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: "i1",
        storeId: "C",
        name: "Paracetamol",
      });
      const service = makeService(prisma as any);
      await expect(service.create("t1", baseDto(), "u1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws ConflictException when source stock is insufficient", async () => {
      const tx = makeTx();
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
      const prisma = makePrisma(tx);
      prisma.store.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === "A"
            ? { id: "A", name: "Store A" }
            : { id: "B", name: "Store B" },
        ),
      );
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: "i1",
        storeId: "A",
        name: "Paracetamol",
        medicineId: null,
        purchaseRate: 10,
      });
      const service = makeService(prisma as any);
      await expect(service.create("t1", baseDto(), "u1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("moves stock atomically and records a completed transfer", async () => {
      const tx = makeTx();
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      tx.inventoryItem.findFirst.mockResolvedValue({
        id: "d1",
        storeId: "B",
        name: "Paracetamol",
        medicineId: null,
      });
      tx.inventoryItem.update.mockResolvedValue({
        id: "d1",
        currentStock: 8,
      });
      tx.inventoryTransaction.create.mockResolvedValue({});
      const prisma = makePrisma(tx);
      prisma.store.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === "A"
            ? { id: "A", name: "Store A" }
            : { id: "B", name: "Store B" },
        ),
      );
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: "i1",
        storeId: "A",
        name: "Paracetamol",
        medicineId: null,
        purchaseRate: 10,
        batchNumber: null,
        expiryDate: null,
        itemType: "MEDICINE",
        sku: null,
        unit: "strip",
        salesRate: 12,
        reorderLevel: 5,
        location: null,
      });

      const service = makeService(prisma as any);
      const result = await service.create("t1", baseDto(), "u1");

      expect(result.status).toBe("COMPLETED");
      expect(result.quantity).toBe(5);
      expect(result.createdBy).toBe("u1");
      expect(result.fromStore).toBe("Store A");
      expect(result.toStore).toBe("Store B");
      expect(result.inventoryItemId).toBe("i1");
      expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "i1", tenantId: "t1", currentStock: { gte: 5 } },
          data: { currentStock: { decrement: 5 } },
        }),
      );
      expect(tx.inventoryTransaction.create).toHaveBeenCalledTimes(2);
      const types = tx.inventoryTransaction.create.mock.calls.map(
        (c: any) => c[0].data.type,
      );
      expect(types).toEqual(
        expect.arrayContaining(["TRANSFER_OUT", "TRANSFER_IN"]),
      );
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

function makeService(prisma: any): StockTransfersService {
  return new StockTransfersService(prisma);
}
