import { SetMetadata } from "@nestjs/common";
import { PermissionAction, UserRole } from "@hms/shared";

export const PERMISSIONS_KEY = "permissions";
export const PUBLIC_KEY = "isPublic";
export const TENANT_SCOPED_KEY = "tenantScoped";
export const ROLES_KEY = "roles";

export const Permissions = (...permissions: PermissionAction[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);

// Disproportionate-role guard: restricts an endpoint to an explicit role
// allow-list, in addition to any @Permissions() action check. Used for
// high-impact operations (e.g. finance reconciliation) where a generic access
// action alone is too coarse.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
