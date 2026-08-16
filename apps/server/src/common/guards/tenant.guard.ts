import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TENANT_SCOPED_KEY } from "../decorators/permissions.decorator";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TenantGuard implements CanActivate {
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

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true, status: true },
    });

    if (!tenant) {
      throw new ForbiddenException("Tenant does not exist.");
    }

    if (tenant.status !== "ACTIVE" && tenant.status !== "TRIAL") {
      throw new ForbiddenException(
        `Tenant is ${tenant.status}. Access blocked.`,
      );
    }

    (user as any).tenantId = tenantId;

    return true;
  }
}
