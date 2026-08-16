import { Injectable, BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";

@Injectable()
export class TwoFactorService {
  private readonly issuer = "HMS SaaS";

  generateSecret(): string {
    return crypto.randomBytes(20).toString("base64");
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
    const key = Buffer.from(secret, "base64");
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

  assertValid(secret: string | null, token: string | undefined): void {
    if (!secret) throw new BadRequestException("2FA is not enabled");
    if (!token || !this.verify(secret, token)) {
      throw new BadRequestException("Invalid 2FA code");
    }
  }
}
