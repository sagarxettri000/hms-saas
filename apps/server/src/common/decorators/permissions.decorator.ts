import { SetMetadata } from "@nestjs/common";
import { PermissionAction, UserRole } from "@hms/shared";

export const PERMISSIONS_KEY = "permissions";
export const PUBLIC_KEY = "isPublic";
export const TENANT_SCOPED_KEY = "tenantScoped";
export const ROLES_KEY = "roles";
export const FORBID_ROLES_KEY = "forbidRoles";

export const Permissions = (...permissions: PermissionAction[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);

// Disproportionate-role guard: restricts an endpoint to an explicit role
// allow-list, in addition to any @Permissions() action check. Used for
// high-impact operations (e.g. finance reconciliation) where a generic access
// action alone is too coarse.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// Hard-deny guard: forbids an endpoint to an explicit role list regardless of
// the flat action-based PermissionsGuard. Used to carve billing/sensitive
// domains out of roles that otherwise hold generic READ/CREATE/EDIT actions.
export const ForbidRoles = (...roles: UserRole[]) =>
  SetMetadata(FORBID_ROLES_KEY, roles);
