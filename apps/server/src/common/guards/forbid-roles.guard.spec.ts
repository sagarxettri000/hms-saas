import { ForbiddenException } from "@nestjs/common";
import { ForbidRolesGuard } from "./forbid-roles.guard";

function makeContext(user: any, forbiddenRoles: any[] | null) {
  const request: any = { user };
  const reflector: any = {
    getAllAndOverride: jest.fn().mockReturnValue(forbiddenRoles),
  };
  const context: any = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { context, reflector, request };
}

describe("ForbidRolesGuard (hard-deny role guard)", () => {
  it("is a no-op when no @ForbidRoles is declared", () => {
    const { context, reflector } = makeContext({ role: "DOCTOR" }, null);
    const guard = new ForbidRolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows a user whose role is not in the forbid-list", () => {
    const { context, reflector } = makeContext({ role: "FINANCE_MANAGER" }, [
      "DOCTOR",
      "NURSE",
    ]);
    const guard = new ForbidRolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects a user whose role is in the forbid-list", () => {
    const { context, reflector } = makeContext({ role: "DOCTOR" }, [
      "DOCTOR",
      "NURSE",
    ]);
    const guard = new ForbidRolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("rejects when no authenticated user is present", () => {
    const { context, reflector } = makeContext(undefined, ["DOCTOR"] as any);
    const guard = new ForbidRolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("rejects when the user has no role", () => {
    const { context, reflector } = makeContext({ id: "u1" }, ["DOCTOR"] as any);
    const guard = new ForbidRolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});