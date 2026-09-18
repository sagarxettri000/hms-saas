import { ForbiddenException } from "@nestjs/common";
import { RolesGuard } from "./roles.guard";
import { UserRole } from "@hms/shared";

function makeContext(user: any, allowedRoles: UserRole[] | null) {
  const request: any = { user };
  const reflector: any = {
    getAllAndOverride: jest.fn().mockReturnValue(allowedRoles),
  };
  const context: any = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { context, reflector, request };
}

describe("RolesGuard (disproportionate role allow-list)", () => {
  it("is a no-op when no @Roles is declared", () => {
    const { context, reflector } = makeContext({ role: "NURSE" }, null);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows a user whose role is in the allow-list", () => {
    const { context, reflector } = makeContext({ role: "FINANCE_MANAGER" }, [
      "FINANCE_MANAGER",
      "HOSPITAL_ADMIN",
    ] as any);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects a user whose role is not in the allow-list", () => {
    const { context, reflector } = makeContext({ role: "RECEPTIONIST" }, [
      "FINANCE_MANAGER",
      "HOSPITAL_ADMIN",
    ] as any);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("rejects when no authenticated user is present", () => {
    const { context, reflector } = makeContext(undefined, [
      "FINANCE_MANAGER",
    ] as any);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("rejects when the user has no role", () => {
    const { context, reflector } = makeContext({ id: "u1" }, [
      "FINANCE_MANAGER",
    ] as any);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
