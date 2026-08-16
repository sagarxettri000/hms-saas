import { Injectable } from "@nestjs/common";
import {
  PermissionAction,
  RESOURCE_PERMISSIONS,
  getResourcePermissions,
} from "@hms/shared";

@Injectable()
export class PermissionsService {
  listAll() {
    return Object.values(PermissionAction).map((action) => ({
      name: action,
      label: action.replace(/_/g, " ").toLowerCase(),
    }));
  }

  listResources() {
    return Object.entries(RESOURCE_PERMISSIONS).map(([resource, actions]) => ({
      resource,
      label: resource.replace(/_/g, " "),
      actions: getResourcePermissions(
        resource as keyof typeof RESOURCE_PERMISSIONS,
      ),
    }));
  }
}
