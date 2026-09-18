import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@hms/shared";
import { FORBID_ROLES_KEY } from "../decorators/permissions.decorator";

// Hard-deny role guard. If an endpoint declares @ForbidRoles(...), a matching
// authenticated role is rejected with 403 even when its flat action-based
// permissions would otherwise allow the call. When no @ForbidRoles is declared
// this guard is a no-op.
@Injectable()
export class ForbidRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const forbiddenRoles = this.reflector.getAllAndOverride<UserRole[]>(
      FORBID_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!forbiddenRoles || forbiddenRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException("No user context for role check");
    }

    if (forbiddenRoles.includes(user.role)) {
      throw new ForbiddenException("Role not permitted for this operation");
    }

    return true;
  }
}
