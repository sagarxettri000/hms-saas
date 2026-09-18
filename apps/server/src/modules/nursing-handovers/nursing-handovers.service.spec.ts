import { NursingHandoversService } from "./nursing-handovers.service";

function makeService(prisma: any): NursingHandoversService {
  return new NursingHandoversService(prisma);
}

describe("NursingHandoversService", () => {
  describe("create", () => {
    const prisma = {
      shiftHandover: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "h1" })),
      },
    };
    const service = makeService(prisma as any);

    beforeEach(() => jest.clearAllMocks());

    it("creates a handover with a given shift date", async () => {
      const result = await service.create(
        "t1",
        {
          wardId: "w1",
          wardName: "Ward A",
          shiftDate: "2026-01-01",
          notes: "quiet",
        },
        "u1",
        "Nurse B",
      );
      expect(result.wardId).toBe("w1");
      expect(result.wardName).toBe("Ward A");
      expect(result.shiftDate).toBeInstanceOf(Date);
      expect(result.savedBy).toBe("Nurse B");
    });

    it("defaults the shift date to now when omitted", async () => {
      const result = await service.create("t1", { wardName: "Ward A" }, "u1");
      expect(result.shiftDate).toBeInstanceOf(Date);
      expect(result.savedBy).toBe("u1");
    });
  });

  describe("findAll", () => {
    it("returns paginated tenant-scoped handovers", async () => {
      const prisma = {
        shiftHandover: {
          findMany: jest.fn().mockResolvedValue([{ id: "h1" }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      const service = makeService(prisma as any);
      const result = await service.findAll("t1", { limit: 10 });
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(prisma.shiftHandover.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "t1" } }),
      );
    });
  });
});
