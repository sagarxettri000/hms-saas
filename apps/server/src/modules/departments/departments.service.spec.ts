import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { DepartmentsService } from "./departments.service";

function makeService(prisma: any, audit?: any) {
  return new DepartmentsService(
    prisma,
    audit ?? { log: jest.fn().mockResolvedValue(undefined) },
  );
}

function deptPrisma(department: any, overrides: any = {}) {
  return {
    department: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.tenantId === "t1" && where.id === (where.id ?? "d1")
          ? department
          : null,
      ),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ data }: any) => ({
        id: "d1",
        ...department,
        ...data,
      })),
      ...(overrides.department || {}),
    },
    user: { count: jest.fn().mockResolvedValue(0), ...(overrides.user || {}) },
    ward: { count: jest.fn().mockResolvedValue(0), ...(overrides.ward || {}) },
    appointment: {
      count: jest.fn().mockResolvedValue(0),
      ...(overrides.appointment || {}),
    },
    billingService: {
      count: jest.fn().mockResolvedValue(0),
      ...(overrides.billingService || {}),
    },
    bed: { count: jest.fn().mockResolvedValue(0), ...(overrides.bed || {}) },
    ...(overrides.root || {}),
  };
}

const baseDept = {
  id: "d1",
  tenantId: "t1",
  name: "Radiology",
  code: "RAD",
  description: "Imaging",
  parentId: null,
  branchId: null,
  isActive: true,
};

describe("DepartmentsService.update (department edit)", () => {
  it("404s when the department belongs to another tenant (IDOR)", async () => {
    const prisma = deptPrisma(baseDept, {
      department: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    await expect(
      service.update("t1", "d1", { name: "X" }, "u1"),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("updates the name and preserves identity (same id, code untouched)", async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const prisma = deptPrisma(baseDept);
    const service = makeService(prisma, audit);
    const result = await service.update(
      "t1",
      "d1",
      { name: "Imaging Centre" },
      "u1",
    );

    expect(result.id).toBe("d1");
    expect(result.code).toBe("RAD");
    expect(prisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: { name: "Imaging Centre" },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      "t1",
      "u1",
      "Department",
      "d1",
      "UPDATE",
      expect.objectContaining({
        previous: expect.objectContaining({ name: "Radiology" }),
        changes: { name: "Imaging Centre" },
      }),
    );
  });

  it("normalizes code to uppercase and rejects duplicates within the tenant", async () => {
    const prisma = deptPrisma(baseDept, {
      department: {
        findUnique: jest.fn().mockResolvedValue({ id: "d2", code: "LAB" }),
      },
    });
    const service = makeService(prisma);
    await expect(
      service.update("t1", "d1", { code: "lab" }, "u1"),
    ).rejects.toThrow(ConflictException);
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("allows keeping the department's own code (case-normalized)", async () => {
    const prisma = deptPrisma(baseDept, {
      department: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    const result = await service.update("t1", "d1", { code: "rad" }, "u1");
    expect(result.code).toBe("RAD");
    expect(prisma.department.update).toHaveBeenCalled();
  });

  it("rejects empty name", async () => {
    const service = makeService(deptPrisma(baseDept));
    await expect(
      service.update("t1", "d1", { name: "   " }, "u1"),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects self-parent and descendant cycles", async () => {
    const service = makeService(deptPrisma(baseDept));
    await expect(
      service.update("t1", "d1", { parentId: "d1" }, "u1"),
    ).rejects.toThrow(/own parent/);
  });

  it("rejects a parent that is a descendant of the department (cycle)", async () => {
    const prisma = deptPrisma(baseDept, {
      department: {
        findFirst: jest.fn().mockResolvedValue(baseDept),
        // First findUnique (parent lookup) returns a child whose parentId points back to d1
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: "child", parentId: "d1" })
          .mockResolvedValue(null),
        update: jest.fn(),
      },
    });
    const service = makeService(prisma);
    await expect(
      service.update("t1", "d1", { parentId: "child" }, "u1"),
    ).rejects.toThrow(/descendant/);
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("404s when the new parent is in another tenant", async () => {
    const prisma = deptPrisma(baseDept, {
      department: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(baseDept) // the department itself
          .mockResolvedValueOnce(null), // parent lookup scoped to tenant
        update: jest.fn(),
      },
    });
    const service = makeService(prisma);
    await expect(
      service.update("t1", "d1", { parentId: "p-other-tenant" }, "u1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("blocks deactivation while dependent active records exist", async () => {
    const prisma = deptPrisma(baseDept, {
      user: { count: jest.fn().mockResolvedValue(3) },
      appointment: { count: jest.fn().mockResolvedValue(2) },
    });
    const service = makeService(prisma);
    await expect(
      service.update("t1", "d1", { isActive: false }, "u1"),
    ).rejects.toThrow(ConflictException);
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("allows deactivation when nothing depends on it", async () => {
    const prisma = deptPrisma(baseDept);
    const service = makeService(prisma);
    const result = await service.update("t1", "d1", { isActive: false }, "u1");
    expect(result.isActive).toBe(false);
  });

  it("rejects an update with no actual changes", async () => {
    const service = makeService(deptPrisma(baseDept));
    await expect(service.update("t1", "d1", {}, "u1")).rejects.toThrow(
      /No changes/,
    );
  });
});

describe("DepartmentsService.updateWard (ward edit)", () => {
  const baseWard = {
    id: "w1",
    tenantId: "t1",
    name: "General Ward",
    code: "GW",
    location: "Block A",
    departmentId: "d1",
    isActive: true,
  };

  function wardPrisma(ward: any, overrides: any = {}) {
    return {
      ward: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.tenantId === "t1" && where.id === ward.id ? ward : null,
        ),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...ward,
          ...data,
          department: { id: "d1", name: "Radiology" },
        })),
        ...(overrides.ward || {}),
      },
      department: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.tenantId === "t1" ? { id: where.id, name: "Radiology" } : null,
        ),
        ...(overrides.department || {}),
      },
      bed: { count: jest.fn().mockResolvedValue(0), ...(overrides.bed || {}) },
      ...(overrides.root || {}),
    };
  }

  it("404s for a ward in another tenant (IDOR)", async () => {
    const prisma = wardPrisma(baseWard, {
      ward: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    await expect(
      service.updateWard("t1", "w1", { name: "X" }, "u1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("updates name/location and returns the ward with its department", async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const prisma = wardPrisma(baseWard);
    const service = makeService(prisma, audit);
    const result = await service.updateWard(
      "t1",
      "w1",
      { name: "Gen Ward", location: "Block B" },
      "u1",
    );

    expect(result.id).toBe("w1");
    expect(result.department).toEqual({ id: "d1", name: "Radiology" });
    expect(audit.log).toHaveBeenCalledWith(
      "t1",
      "u1",
      "Ward",
      "w1",
      "UPDATE",
      expect.objectContaining({
        previous: expect.objectContaining({
          name: "General Ward",
          location: "Block A",
        }),
        changes: { name: "Gen Ward", location: "Block B" },
      }),
    );
  });

  it("validates the new department belongs to the same tenant before reassignment", async () => {
    const prisma = wardPrisma(baseWard, {
      department: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    await expect(
      service.updateWard("t1", "w1", { departmentId: "d-evil" }, "u1"),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.ward.update).not.toHaveBeenCalled();
  });

  it("clears the department when departmentId is null", async () => {
    const prisma = wardPrisma(baseWard);
    const service = makeService(prisma);
    await service.updateWard("t1", "w1", { departmentId: null }, "u1");
    expect(prisma.ward.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ departmentId: null }),
      }),
    );
  });

  it("blocks deactivation while any bed in the ward is occupied", async () => {
    const prisma = wardPrisma(baseWard, {
      bed: { count: jest.fn().mockResolvedValue(4) },
    });
    const service = makeService(prisma);
    await expect(
      service.updateWard("t1", "w1", { isActive: false }, "u1"),
    ).rejects.toThrow(/occupied/);
    expect(prisma.ward.update).not.toHaveBeenCalled();
  });

  it("allows deactivation when beds are free", async () => {
    const prisma = wardPrisma(baseWard);
    const service = makeService(prisma);
    const result = await service.updateWard(
      "t1",
      "w1",
      { isActive: false },
      "u1",
    );
    expect(result.isActive).toBe(false);
  });

  it("rejects an empty update", async () => {
    const service = makeService(wardPrisma(baseWard));
    await expect(service.updateWard("t1", "w1", {}, "u1")).rejects.toThrow(
      /No changes/,
    );
  });
});

describe("DepartmentsService.findOne", () => {
  it("404s when not found in tenant", async () => {
    const prisma = deptPrisma(baseDept, {
      department: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    await expect(service.findOne("t1", "d1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("returns the department with counts for the edit form", async () => {
    const prisma = deptPrisma(baseDept, {
      department: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseDept,
          _count: { users: 2, doctors: 1, wards: 1 },
          children: [],
        }),
      },
    });
    const service = makeService(prisma);
    const result = await service.findOne("t1", "d1");
    expect(result._count).toEqual({ users: 2, doctors: 1, wards: 1 });
  });
});
