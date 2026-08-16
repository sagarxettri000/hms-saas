import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_KEY } from "../decorators/permissions.decorator";

const ALLOWED_PATHS = new Set([
  "/api/v1/auth/change-password",
  "/api/v1/auth/me",
  "/api/v1/auth/logout",
  "/api/v1/auth/logout-all",
]);

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
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

    if (!user || !user.mustChangePassword) {
      return true;
    }

    const path = request.path as string;
    if (ALLOWED_PATHS.has(path)) {
      return true;
    }

    throw new ForbiddenException("You must change your password first");
  }
}
