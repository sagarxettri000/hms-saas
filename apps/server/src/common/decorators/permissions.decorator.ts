import { SetMetadata } from "@nestjs/common";
import { PermissionAction } from "@hms/shared";

export const PERMISSIONS_KEY = "permissions";
export const PUBLIC_KEY = "isPublic";
export const TENANT_SCOPED_KEY = "tenantScoped";

export const Permissions = (...permissions: PermissionAction[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);
