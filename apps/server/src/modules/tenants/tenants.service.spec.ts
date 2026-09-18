import { TenantsService } from "./tenants.service";

describe("TenantsService.create onboarding security", () => {
  const adminUserRow = {
    id: "u1",
    email: "admin@newhosp.com",
    firstName: "New",
    lastName: "Admin",
    role: "HOSPITAL_ADMIN",
    status: "PENDING",
    mustChangePassword: true,
  };

  const tx = {
    tenant: {
      create: jest.fn().mockResolvedValue({ id: "t1", code: "NEWHOS" }),
    },
    plan: {
      findUnique: jest.fn().mockResolvedValue({ id: "p1" }),
    },
    subscription: {
      create: jest.fn().mockResolvedValue({ id: "s1" }),
    },
    branch: {
      create: jest.fn().mockResolvedValue({ id: "b1" }),
    },
    user: {
      create: jest.fn().mockResolvedValue(adminUserRow),
    },
    department: {
      create: jest.fn().mockResolvedValue({ id: "d1" }),
    },
  };

  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(),
  };

  const makeService = () => new TenantsService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
  });

  it("creates the onboarded admin as PENDING so an anonymous caller cannot log in", async () => {
    const service = makeService();
    const result = await service.create({
      name: "New Hospital",
      code: "NEWHOS",
      adminFirstName: "New",
      adminLastName: "Admin",
      adminEmail: "admin@newhosp.com",
      adminPassword: "AttackerChoosesMe123!",
    } as any);

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "HOSPITAL_ADMIN",
          status: "PENDING",
          emailVerifiedAt: null,
          mustChangePassword: true,
        }),
      }),
    );
    expect(result.adminUser.status).toBe("PENDING");
  });

  it("never returns credentials (passwordHash / twoFactorSecret) in the create response", async () => {
    const service = makeService();
    const result = await service.create({
      name: "New Hospital",
      code: "NEWHOS2",
      adminFirstName: "New",
      adminLastName: "Admin",
      adminEmail: "admin@newhosp.com",
      adminPassword: "AttackerChoosesMe123!",
    } as any);

    const raw = JSON.parse(JSON.stringify(result.adminUser));
    expect(Object.keys(raw)).toEqual(
      expect.not.arrayContaining(["passwordHash", "twoFactorSecret"]),
    );
    expect(raw.passwordHash).toBeUndefined();
  });
});
