import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@hms/shared";
import { ROLES_KEY } from "../decorators/permissions.decorator";

// Disproportionate-role guard. If an endpoint declares @Roles(...), the
// authenticated user's role must be in the allow-list, regardless of the flat
// action-based PermissionsGuard. This closes cross-domain escalations where a
// generic action (e.g. APPROVE) is shared by many roles but an operation
// (e.g. end-of-day finance reconciliation) should only ever be performed by
// finance/admin-class roles. When no @Roles is declared this guard is a no-op.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException("No user context for role check");
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException("Role not permitted for this operation");
    }

    return true;
  }
}
