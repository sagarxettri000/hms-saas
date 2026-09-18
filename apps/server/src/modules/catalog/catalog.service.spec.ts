import { CatalogService } from "./catalog.service";

describe("CatalogService", () => {
  const prisma = {
    labTest: { findMany: jest.fn().mockResolvedValue([]) },
    medicine: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new CatalogService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it("returns ICD-10 entries matching a code prefix", () => {
    const results = service.searchIcd10("E11");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.code.startsWith("E11"))).toBe(true);
  });

  it("searches ICD-10 by name", () => {
    const results = service.searchIcd10("hypertension");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain("hypertension");
  });

  it("returns entries up to the default limit when no search term is given", () => {
    const results = service.searchIcd10();
    expect(results.length).toBe(25);
  });

  it("respects the limit", () => {
    const results = service.searchIcd10("", 5);
    expect(results.length).toBe(5);
  });

  it("lists tenant lab tests with search filter", async () => {
    prisma.labTest.findMany.mockResolvedValue([{ id: "lt1", name: "CBC" }]);
    const results = await service.labTests("t1", "CBC");
    expect(results).toHaveLength(1);
    const arg = prisma.labTest.findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe("t1");
    expect(arg.where.isActive).toBe(true);
    expect(arg.where.OR).toBeDefined();
  });

  it("lists tenant medicines with search filter", async () => {
    prisma.medicine.findMany.mockResolvedValue([
      { id: "m1", name: "Paracetamol" },
    ]);
    const results = await service.medicines("t1", "para");
    expect(results).toHaveLength(1);
    const arg = prisma.medicine.findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe("t1");
    expect(arg.where.OR).toHaveLength(4);
  });
});
