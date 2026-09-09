import { NextFunction, Request, Response } from "express";

/**
 * Minimal no-dependency cookie parser. Reads `Cookie` headers into
 * `req.cookies` (used by the JWT strategy fallback and the CSRF guard).
 * Never fails; malformed headers simply yield an empty cookie map.
 */
export function cookieParserMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const header = req.headers?.cookie;
    const cookies: Record<string, string> = {};
    if (typeof header === "string" && header.length > 0) {
      for (const part of header.split(";")) {
        const idx = part.indexOf("=");
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key) continue;
        try {
          cookies[decodeURIComponent(key)] = decodeURIComponent(value);
        } catch {
          cookies[key] = value;
        }
      }
    }
    (req as any).cookies = cookies;
  } catch {
    (req as any).cookies = {};
  }
  next();
}