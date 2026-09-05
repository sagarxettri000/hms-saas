import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionAction, getResourcePermissions } from "@hms/shared";
import {
  PERMISSIONS_KEY,
  PUBLIC_KEY,
} from "../decorators/permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionAction[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("No user context for permission check");
    }

    const userPermissions = user.permissions as string[] | undefined;
    if (!userPermissions) {
      throw new ForbiddenException("User has no permissions defined");
    }

    // Platform super admins and tenant admins bypass all permission checks
    if (
      user.role === "PLATFORM_SUPER_ADMIN" ||
      user.role === "HOSPITAL_ADMIN" ||
      user.role === "HOSPITAL_OWNER"
    ) {
      return true;
    }

    const hasAll = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasAll) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
