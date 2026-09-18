import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    const allowedRoles = [
      "PLATFORM_SUPER_ADMIN",
      "HOSPITAL_ADMIN",
      "HOSPITAL_OWNER",
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        "Only platform super admins and hospital admins can access this resource",
      );
    }

    return true;
  }
}
