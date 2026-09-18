import { BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";
import { TwoFactorService } from "./two-factor.service";

describe("TwoFactorService", () => {
  const service = new TwoFactorService({
    sign: jest.fn(),
    verify: jest.fn(),
  } as any);

  // Reference TOTP implementation (RFC 6238, HMAC-SHA1, 30s, 6 digits)
  function fromBase32(input: string): Buffer {
    const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const c of clean) {
      const v = a.indexOf(c);
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

  function totp(secret: string, counter: number): string {
    const key = fromBase32(secret);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter));
    const digest = crypto.createHmac("sha1", key).update(buf).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return (binary % 1000000).toString().padStart(6, "0");
  }

  it("generates a base32 secret usable by authenticator apps", () => {
    const secret = service.generateSecret();
    expect(secret).toBeTruthy();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBe(32);
    expect(fromBase32(secret).length).toBe(20);
  });

  it("builds an otpauth:// TOTP URL with the email and issuer", () => {
    const url = service.generateOtpUrl("doctor@hosp.com", "MFRGGZDFMY");
    expect(url).toContain("otpauth://totp/");
    expect(url).toContain("secret=MFRGGZDFMY");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
    expect(url).toContain("algorithm=SHA1");
  });

  it("accepts the current TOTP code", () => {
    const secret = service.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = totp(secret, counter);
    expect(service.verify(secret, code)).toBe(true);
  });

  it("accepts a code from the previous 30s window (skew tolerance)", () => {
    const secret = service.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30) - 1;
    const code = totp(secret, counter);
    expect(service.verify(secret, code)).toBe(true);
  });

  it("rejects an expired code from two windows ago", () => {
    const secret = service.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30) - 2;
    const code = totp(secret, counter);
    expect(service.verify(secret, code)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    const secret = service.generateSecret();
    expect(service.verify(secret, "abc")).toBe(false);
    expect(service.verify(secret, "12345")).toBe(false);
    expect(service.verify(secret, "1234567")).toBe(false);
    expect(service.verify("", "123456")).toBe(false);
  });

  it("rejects a random wrong code", () => {
    const secret = service.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const wrong = (Number(totp(secret, counter)) + 1)
      .toString()
      .padStart(6, "0");
    expect(service.verify(secret, wrong)).toBe(false);
  });

  it("assertValid throws for disabled 2FA", () => {
    expect(() => service.assertValid(null, "123456")).toThrow(
      BadRequestException,
    );
  });

  it("assertValid throws for an invalid code", () => {
    const secret = service.generateSecret();
    expect(() => service.assertValid(secret, "000000")).toThrow(
      BadRequestException,
    );
  });

  it("assertValid passes for a valid code", () => {
    const secret = service.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    expect(() =>
      service.assertValid(secret, totp(secret, counter)),
    ).not.toThrow();
  });
});
