import { ForbiddenException } from "@nestjs/common";
import { TenantGuard } from "./tenant.guard";

function makeContext(user: any, headers: Record<string, string> = {}) {
  const request: any = { user, headers };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as any;
}

describe("TenantGuard (tenant isolation)", () => {
  const prisma = {
    tenant: {
      findFirst: jest.fn(),
    },
  };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(true),
  };
  const guard = new TenantGuard(reflector as any, prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
    (guard as any).tenantCache.clear();
    reflector.getAllAndOverride.mockReturnValue(true);
    prisma.tenant.findFirst.mockResolvedValue({
      id: "tenant-a",
      status: "ACTIVE",
    });
  });

  it("allows a user in their own tenant with matching header", async () => {
    const ctx = makeContext(
      { id: "u1", tenantId: "tenant-a", role: "HOSPITAL_ADMIN" },
      { "x-tenant-id": "tenant-a" },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tenant-a" } }),
    );
  });

  it("allows a user in their own tenant with no header", async () => {
    const ctx = makeContext({
      id: "u1",
      tenantId: "tenant-a",
      role: "HOSPITAL_ADMIN",
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("caches the tenant status lookup across requests", async () => {
    const ctx = makeContext({
      id: "u1",
      tenantId: "tenant-a",
      role: "HOSPITAL_ADMIN",
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.tenant.findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects a user attempting to access another tenant via header", async () => {
    const ctx = makeContext(
      { id: "u1", tenantId: "tenant-a", role: "HOSPITAL_ADMIN" },
      { "x-tenant-id": "tenant-b" },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a user with no tenant id", async () => {
    const ctx = makeContext({ id: "u1", role: "HOSPITAL_ADMIN" });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it("rejects requests for a non-existent tenant", async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);
    const ctx = makeContext(
      { id: "u1", tenantId: "ghost", role: "HOSPITAL_ADMIN" },
      { "x-tenant-id": "ghost" },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it("rejects suspended tenants", async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: "tenant-a",
      status: "SUSPENDED",
    });
    const ctx = makeContext({
      id: "u1",
      tenantId: "tenant-a",
      role: "HOSPITAL_ADMIN",
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow("Tenant is SUSPENDED");
  });

  it("allows TRIAL tenants", async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: "tenant-a",
      status: "TRIAL",
    });
    const ctx = makeContext({
      id: "u1",
      tenantId: "tenant-a",
      role: "HOSPITAL_ADMIN",
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("lets super admin switch tenants via header", async () => {
    const ctx = makeContext(
      { id: "sa", tenantId: null, role: "PLATFORM_SUPER_ADMIN" },
      { "x-tenant-id": "tenant-b" },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tenant-b" } }),
    );
  });

  it("auto-assigns first active tenant for super admin without header", async () => {
    prisma.tenant.findFirst.mockResolvedValueOnce({
      id: "tenant-x",
      status: "ACTIVE",
    });
    const ctx = makeContext({
      id: "sa",
      tenantId: null,
      role: "PLATFORM_SUPER_ADMIN",
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE" },
      }),
    );
  });

  it("bypasses checks when route is not tenant scoped", async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = makeContext({ id: "u1" });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });

  it("rejects when no authenticated user is present", async () => {
    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
