import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

export const CORRELATION_HEADER = "x-correlation-id";

const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function sanitizeCorrelationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128 || !SAFE_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers[CORRELATION_HEADER];
    const correlationId = sanitizeCorrelationId(incoming) ?? randomUUID();
    (req as any).correlationId = correlationId;
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  }
}
