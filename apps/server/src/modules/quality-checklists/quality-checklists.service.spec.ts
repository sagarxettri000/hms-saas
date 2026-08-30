import { BadRequestException } from "@nestjs/common";
import { QualityChecklistsService } from "./quality-checklists.service";

function makeService(prisma: any): QualityChecklistsService {
  return new QualityChecklistsService(prisma);
}

describe("QualityChecklistsService", () => {
  describe("findAll", () => {
    it("returns tenant-scoped checklist items", async () => {
      const prisma = {
        qualityChecklist: {
          findMany: jest.fn().mockResolvedValue([{ id: "q1", category: "A", item: "x" }]),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.findAll("t1", {});
      expect(result).toHaveLength(1);
      expect(prisma.qualityChecklist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "t1" } }),
      );
    });
  });

  describe("setItem", () => {
    it("rejects missing category or item", async () => {
      const prisma = { qualityChecklist: {} };
      const service = makeService(prisma as any);
      await expect(service.setItem("t1", { category: "A", item: "" }, "u1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("creates a new checked item", async () => {
      const prisma = {
        qualityChecklist: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...data, id: "q1" })),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.setItem(
        "t1",
        { category: "Sanitation", item: "Bins emptied", checked: true },
        "u1",
      );
      expect(result.checked).toBe(true);
      expect(result.checkedBy).toBe("u1");
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it("updates an existing item when unchecked", async () => {
      const prisma = {
        qualityChecklist: {
          findFirst: jest.fn().mockResolvedValue({ id: "q1", category: "A", item: "x" }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: "q1", ...data })),
          create: jest.fn(),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.setItem(
        "t1",
        { category: "A", item: "x", checked: false },
        "u1",
      );
      expect(result.checked).toBe(false);
      expect(result.checkedBy).toBeNull();
      expect(prisma.qualityChecklist.create).not.toHaveBeenCalled();
    });
  });
});
