import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Observable } from "rxjs";

/**
 * Protects cookie-authenticated browser sessions against CSRF.
 *
 * Any state-changing request (non GET/HEAD/OPTIONS) that carries the
 * `hms_access` cookie MUST include the custom `X-HMS-CSRF` header.
 * Requests authenticated via a Bearer token (server-to-server / CLI /
 * integrations) are unaffected because browsers cannot attach the
 * `Authorization` header cross-site, so no cookie is present.
 */
@Injectable()
export class CsrfCookieGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();
    const method: string = req?.method || "GET";

    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return true;
    }

    const hasAccessCookie = Boolean(
      req?.cookies && (req.cookies as Record<string, string>).hms_access,
    );
    if (!hasAccessCookie) {
      return true;
    }

    const csrfHeader: unknown = req?.headers?.["x-hms-csrf"];
    if (csrfHeader === undefined || csrfHeader === "" || csrfHeader === null) {
      throw new ForbiddenException("Missing CSRF protection header");
    }

    return true;
  }
}
