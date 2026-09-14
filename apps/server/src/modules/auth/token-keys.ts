import * as crypto from "crypto";

function readPem(value: string | undefined): string | null {
  const pem = value?.trim();
  // Environment variables commonly store PEMs with escaped newline sequences.
  // Normalise both single-escaped (\n) and double-escaped (\\n) forms.
  if (!pem) return null;
  const normalized = pem
    .replace(/\\\\n/g, "\\n")
    .replace(/\\n/g, "\n")
    .trim();
  return normalized || null;
}

export function accessPrivatePem(): string | null {
  return readPem(process.env.JWT_ACCESS_PRIVATE_KEY);
}

function extractPemBlocks(value: string): string[] {
  const re = /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/g;
  const matches = value.match(re);
  if (!matches || matches.length === 0) return [];
  return matches.map((m) => readPem(m) ?? "");
}

export function accessPublicKeys(): string[] {
  const envRaw = process.env.JWT_ACCESS_PUBLIC_KEYS?.trim();
  if (envRaw) {
    // Accept a JSON array of PEM strings, a raw PEM (possibly several PEMs
    // joined with newlines), or a PEM with escaped \n sequences.
    try {
      const arr = JSON.parse(envRaw);
      if (Array.isArray(arr)) {
        const fromArray = arr.map((x: string | number | null | undefined) => readPem(String(x ?? "")) ?? "");
        if (fromArray.length > 0) return fromArray.filter(Boolean);
      }
    } catch {
      // Fall through and try block extraction on the raw value.
    }
    const fromBlocks = extractPemBlocks(envRaw);
    if (fromBlocks.length > 0) return fromBlocks;
    const single = readPem(envRaw);
    if (single) return [single];
  }
  // Derive from the private key when no explicit public keys are provided.
  const privatePem = accessPrivatePem();
  if (privatePem) {
    try {
      const pub = crypto
        .createPublicKey(privatePem)
        .export({ type: "spki", format: "pem" });
      return [String(pub)];
    } catch {
      // Ignore — the server will throw at startup if the private key is malformed.
    }
  }
  return [];
}

/**
 * Fingerprint of a public key, used as the JWT `kid` so verification for
 * rotated key sets can pick the matching key out of JWT_ACCESS_PUBLIC_KEYS.
 */
export function publicKeyFingerprint(pem: string): string {
  const canonical = crypto
    .createPublicKey(pem)
    .export({ type: "spki", format: "pem" })
    .toString()
    .trim();
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/** `kid` for newly signed access tokens (fingerprint of the active private key). */
export function accessSigningKid(): string | null {
  const privatePem = accessPrivatePem();
  if (!privatePem) return null;
  try {
    return publicKeyFingerprint(privatePem);
  } catch {
    return null;
  }
}

export function accessSigningAlgorithm(): "RS256" | "HS256" {
  return accessPrivatePem() ? "RS256" : "HS256";
}

export function legacyAccessSecret(): string | null {
  const secret = process.env.JWT_ACCESS_SECRET?.trim();
  return secret ? secret : null;
}

export function buildPublicKeyMap(keys: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const pem of keys) {
    try {
      map.set(publicKeyFingerprint(pem), pem);
    } catch {
      // Skip malformed entries.
    }
  }
  return map;
}
