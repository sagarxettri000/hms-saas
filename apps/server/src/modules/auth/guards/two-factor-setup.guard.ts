import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../../prisma/prisma.service";
import { TwoFactorService } from "../two-factor.service";
import { JwtStrategy } from "../strategies/jwt.strategy";

/**
 * Authenticates the 2FA setup endpoints (`/auth/2fa/setup`, `/auth/2fa/enable`).
 *
 * Accepts EITHER:
 *  1. a normal access token (Authorization header or hms_access cookie) so
 *     already-logged-in users can opt in from their settings, OR
 *  2. a short-lived `twofactor_setup` token (Authorization header only) issued
 *     by `/auth/login` when a tenant enforces 2FA but the user has not enrolled.
 *
 * Setup tokens are signed with a dedicated derived secret and can never pass
 * the regular JWT strategy.
 */
@Injectable()
export class TwoFactorSetupGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  private extractToken(req: any): string | null {
    const auth = req?.headers?.authorization as string | undefined;
    if (auth && /^Bearer\s.+/.test(auth)) {
      return auth.slice(7).trim();
    }
    const cookie = req?.cookies?.hms_access as string | undefined;
    if (cookie) return cookie;
    return null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException("Authentication required");
    }

    const setupPayload = this.twoFactorService.verifySetupToken(token);
    if (setupPayload) {
      req.user = await this.userById(setupPayload.sub);
      return true;
    }

    let payload: { sub: string; purpose?: string } | null = null;
    try {
      payload = this.jwtService.verify<{ sub: string; purpose?: string }>(
        token,
        { secret: JwtStrategy.secretOrKey() },
      );
    } catch {
      throw new UnauthorizedException("Token invalid or expired");
    }
    if (payload?.purpose) {
      throw new UnauthorizedException("Token invalid or expired");
    }

    req.user = await this.userById(payload.sub);
    return true;
  }

  private async userById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        tenantId: true,
        role: true,
        status: true,
        isActive: true,
        lockedUntil: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) throw new UnauthorizedException("User no longer exists");
    if (user.status === "SUSPENDED" || user.status === "LOCKED") {
      throw new UnauthorizedException("Account is not active");
    }
    if (!user.isActive) throw new UnauthorizedException("Account is disabled");
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account locked. Try again later.");
    }

    return user;
  }
}
