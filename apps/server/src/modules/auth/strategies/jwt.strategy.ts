import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import * as jwt from "jsonwebtoken";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  accessPublicKeys,
  buildPublicKeyMap,
  legacyAccessSecret,
  accessSigningAlgorithm,
} from "../token-keys";

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
    const secret = legacyAccessSecret();
    if (secret) return secret;
    // RSA-only mode: internal (2FA-setup / SSE) tokens fall back to an
    // ephemeral secret that resets on restart.  These tokens are short-lived
    // and scoped to a single workflow, so the rotation is acceptable.
    if (accessSigningAlgorithm() === "RS256") {
      return require("crypto").randomBytes(48).toString("hex");
    }
    throw new Error(
      "JWT_ACCESS_SECRET or JWT_ACCESS_PRIVATE_KEY must be configured. " +
        "The server refuses to run without a signing credential.",
    );
  }

  constructor(private readonly prisma: PrismaService) {
    const keyMap = buildPublicKeyMap(accessPublicKeys());
    super({
      jwtFromRequest: (req: any) => {
        const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        if (fromHeader) return fromHeader;
        const fromCookie = req?.cookies?.hms_access as string | undefined;
        if (fromCookie) return fromCookie;
        return null;
      },
      ignoreExpiration: false,
      secretOrKeyProvider: (
        _request: unknown,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string) => void,
      ) => {
        try {
          const decoded = jwt.decode(rawJwtToken, { complete: true }) as {
            header: { alg: string; kid?: string };
          } | null;
          const alg: string | undefined = decoded?.header?.alg;
          if (!alg) {
            done(new Error("Unrecognised token"));
            return;
          }

          if (alg === "HS256") {
            const secret = legacyAccessSecret();
            if (!secret) {
              done(
                new Error(
                  "Received an HS256 token but JWT_ACCESS_SECRET is not configured.",
                ),
              );
              return;
            }
            done(null, secret);
            return;
          }

          // RS256 (and any other asymmetric algorithm) — verify against the
          // public key whose fingerprint matches the token's `kid`, so tokens
          // signed by a previous key keep verifying during rotation.
          const keys = accessPublicKeys();
          if (!keys.length) {
            done(
              new Error(
                `Received a ${alg} token but no public keys are configured for verification.`,
              ),
            );
            return;
          }
          const kid = decoded?.header?.kid;
          if (typeof kid === "string") {
            const kidKey = keyMap.get(kid);
            if (kidKey) {
              done(null, kidKey);
              return;
            }
          }
          // Legacy tokens from before `kid` was set: accept only when a single
          // key is configured, otherwise refuse to guess.
          if (keys.length === 1) {
            done(null, keys[0]);
            return;
          }
          done(new Error("Unknown signing key (kid not found)."));
        } catch (err) {
          done(err as Error);
        }
      },
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
      throw new UnauthorizedException("Invalid email or password");
    }

    if (user.status === "SUSPENDED" || user.status === "LOCKED") {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (payload.sid) {
      const session = await this.prisma.session.findFirst({
        where: { id: payload.sid, userId: payload.sub },
        select: { id: true, isActive: true, expiresAt: true, revokedAt: true },
      });
      if (
        !session ||
        !session.isActive ||
        (session.expiresAt && session.expiresAt < new Date()) ||
        session.revokedAt
      ) {
        throw new UnauthorizedException("Invalid email or password");
      }
    }

    return {
      ...user,
      permissions: payload.permissions,
      sessionId: payload.sid,
    };
  }
}
