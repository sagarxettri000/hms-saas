import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../../prisma/prisma.service";

interface JwtPayload {
  sub: string;
  email: string;
  tenantId?: string;
  role: string;
  permissions: string[];
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  static secretOrKey(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error(
        "JWT_ACCESS_SECRET environment variable is required (was previously falling back to a hardcoded default). Set a strong random secret before starting the server.",
      );
    }
    return secret;
  }

  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JwtStrategy.secretOrKey(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        tenantId: true,
        role: true,
        status: true,
        isActive: true,
        firstName: true,
        lastName: true,
        mustChangePassword: true,
        doctorProfile: { select: { id: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }

    if (user.status === "SUSPENDED" || user.status === "LOCKED") {
      throw new UnauthorizedException("Account is not active");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Account is disabled");
    }

    if (payload.sid) {
      const session = await this.prisma.session.findFirst({
        where: { id: payload.sid, userId: payload.sub },
        select: { id: true, isActive: true, expiresAt: true, revokedAt: true },
      });
      if (!session || !session.isActive || (session.expiresAt && session.expiresAt < new Date()) || session.revokedAt) {
        throw new UnauthorizedException("Session has been invalidated");
      }
    }

    return {
      ...user,
      permissions: payload.permissions,
      sessionId: payload.sid,
    };
  }
}
