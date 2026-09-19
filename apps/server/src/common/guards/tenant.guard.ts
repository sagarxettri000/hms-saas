import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TENANT_SCOPED_KEY } from "../decorators/permissions.decorator";
import { PrismaService } from "../../prisma/prisma.service";

// The tenant existence/status lookup runs on every tenant-scoped request. On
// serverless with a remote database that is a full round trip per request, so
// cache it briefly per warm instance. A short TTL keeps status changes
// (suspend/activate) effective within a minute.
const TENANT_STATUS_TTL_MS = 60_000;
const TENANT_CACHE_MAX = 500;

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly tenantCache = new Map<
    string,
    { status: string; expiresAt: number }
  >();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isTenantScoped = this.reflector.getAllAndOverride<boolean>(
      TENANT_SCOPED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isTenantScoped) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    const headerTenant = request.headers["x-tenant-id"] as string | undefined;

    let tenantId = user.tenantId as string | undefined;

    if (user.role === "PLATFORM_SUPER_ADMIN") {
      // Super admin may switch tenants via header, otherwise auto-assign first active tenant.
      tenantId = headerTenant || tenantId;
      if (!tenantId) {
        const tenant = await this.prisma.tenant.findFirst({
          where: { status: "ACTIVE" },
          select: { id: true, name: true },
        });
        if (tenant) {
          tenantId = tenant.id;
        }
      }
    } else {
      // Non-super users are bound to their own tenant; never trust a header override.
      if (headerTenant && headerTenant !== tenantId) {
        throw new ForbiddenException(
          "You do not have access to the requested tenant.",
        );
      }
    }

    if (!tenantId) {
      throw new ForbiddenException(
        "Tenant ID is required. Please select a tenant or contact your administrator.",
      );
    }

    const status = await this.resolveTenantStatus(tenantId);

    if (status === null) {
      throw new ForbiddenException("Tenant does not exist.");
    }

    if (status !== "ACTIVE" && status !== "TRIAL") {
      throw new ForbiddenException(`Tenant is ${status}. Access blocked.`);
    }

    (user as any).tenantId = tenantId;

    return true;
  }

  private async resolveTenantStatus(tenantId: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.tenantCache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      return cached.status;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true, status: true },
    });

    if (!tenant) {
      return null;
    }

    if (this.tenantCache.size >= TENANT_CACHE_MAX) {
      const oldest = this.tenantCache.keys().next().value;
      if (oldest !== undefined) {
        this.tenantCache.delete(oldest);
      }
    }
    this.tenantCache.set(tenantId, {
      status: tenant.status,
      expiresAt: now + TENANT_STATUS_TTL_MS,
    });

    return tenant.status;
  }
}
