import { UnauthorizedException } from "@nestjs/common";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
}

export function getTenantContext(req: any): TenantContext {
  const tenantId = req.headers["x-tenant-id"] as string | undefined;
  const user = req.user;

  if (!user) {
    throw new UnauthorizedException("Authentication required");
  }

  return {
    tenantId: user.tenantId || tenantId || "",
    userId: user.sub || user.userId || "",
    role: user.role || "",
    permissions: user.permissions || [],
  };
}

export function extractBearerToken(req: any): string | null {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}
