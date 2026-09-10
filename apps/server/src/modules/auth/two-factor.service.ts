import { Injectable, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Injectable()
export class TwoFactorService {
  private readonly issuer = "HMS SaaS";

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Short-lived token secret derived from the access-token secret so no
   * extra environment variable is required. Tokens signed with it are only
   * accepted by the 2FA setup endpoints (purpose: "twofactor_setup") and can
   * never be used as a normal access token (wrong secret for JwtStrategy).
   */
  setupTokenSecret(): string {
    const access = JwtStrategy.secretOrKey();
    return crypto
      .createHmac("sha256", access)
      .update("hms:2fa:setup")
      .digest("hex");
  }

  signSetupToken(payload: {
    sub: string;
    email: string;
    tenantId?: string | null;
    role?: string;
  }): string {
    return this.jwtService.sign(
      { ...payload, purpose: "twofactor_setup" },
      { secret: this.setupTokenSecret(), expiresIn: "10m" },
    );
  }

  verifySetupToken(token: string): {
    sub: string;
    email?: string;
    tenantId?: string | null;
    role?: string;
  } | null {
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        email?: string;
        tenantId?: string | null;
        role?: string;
        purpose?: string;
      }>(token, { secret: this.setupTokenSecret() });
      if (payload?.purpose !== "twofactor_setup" || !payload?.sub) return null;
      return payload;
    } catch {
      return null;
    }
  }

  generateSecret(): string {
    // RFC 4648 base32 (no padding) — required by Google Authenticator/Authy.
    return this.toBase32(crypto.randomBytes(20));
  }

  generateOtpUrl(email: string, secret: string): string {
    const label = encodeURIComponent(`${this.issuer}:${email}`);
    const params = new URLSearchParams({
      secret,
      issuer: this.issuer,
      algorithm: "SHA1",
      digits: "6",
      period: "30",
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  verify(secret: string, token: string): boolean {
    if (!secret || !token) return false;
    if (!/^\d{6}$/.test(token)) return false;

    const timeStep = 30;
    const now = Math.floor(Date.now() / 1000 / timeStep);

    // Accept current and previous window (30s skew tolerance)
    for (let i = 0; i >= -1; i--) {
      const expected = this.generateCode(secret, now + i);
      if (this.safeEqual(expected, token)) return true;
    }
    return false;
  }

  private generateCode(secret: string, counter: number): string {
    const key = this.fromBase32(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter));
    const hmac = crypto.createHmac("sha1", key);
    hmac.update(buffer);
    const digest = hmac.digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    const otp = binary % 1000000;
    return otp.toString().padStart(6, "0");
  }

  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  private toBase32(buffer: Buffer): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let out = "";
    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
    return out;
  }

  private fromBase32(input: string): Buffer {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const c of clean) {
      const v = alphabet.indexOf(c);
      if (v < 0) continue;
      value = (value << 5) | v;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(out);
  }

  assertValid(secret: string | null, token: string | undefined): void {
    if (!secret) throw new BadRequestException("2FA is not enabled");
    if (!token || !this.verify(secret, token)) {
      throw new BadRequestException("Invalid 2FA code");
    }
  }
}
