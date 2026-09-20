import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_KEY } from "../decorators/permissions.decorator";
import { ROLE_PERMISSIONS, PermissionAction } from "@hms/shared";

/**
 * Defense-in-depth for VIEW-only roles (AUDITOR, PATIENT): the route-level
 * PermissionsGuard only enforces @Permissions decorators, and several GET
 * routes expose directory data without one. This interceptor independently
 * blocks any state-changing request (POST/PATCH/PUT/DELETE) from a role whose
 * permission set contains no write-capable action, so a read-only role can
 * never mutate anything regardless of route configuration.
 *
 * Admin roles bypass (mirroring PermissionsGuard). Reads are untouched.
 */
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const WRITE_ACTIONS = new Set<string>([
  PermissionAction.CREATE,
  PermissionAction.EDIT,
  PermissionAction.DELETE,
  PermissionAction.APPROVE,
  PermissionAction.REJECT,
  PermissionAction.REFUND,
  PermissionAction.ADMINISTER,
  PermissionAction.CONFIGURE,
  PermissionAction.VERIFY,
  PermissionAction.SIGN,
  PermissionAction.SETTLE,
]);

const BYPASS_ROLES = new Set([
  "PLATFORM_SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
]);

@Injectable()
export class ReadOnlyRoleGuard implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest();
    if (!WRITE_METHODS.has(request.method)) return next.handle();

    // Respect explicit @Public routes (login, refresh, etc.).
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    const user = request.user;
    if (!user) return next.handle(); // JwtAuthGuard owns 401s
    if (BYPASS_ROLES.has(user.role)) return next.handle();

    const perms: string[] = user.permissions || [];
    const canWriteSomewhere = perms.some((p) => WRITE_ACTIONS.has(p));
    if (!canWriteSomewhere) {
      throw new ForbiddenException(
        "Read-only role: state-changing operations are not permitted",
      );
    }
    return next.handle();
  }
}

