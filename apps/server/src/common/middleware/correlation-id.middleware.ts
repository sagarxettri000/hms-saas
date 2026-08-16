import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

export const CORRELATION_HEADER = "x-correlation-id";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers[CORRELATION_HEADER];
    const correlationId =
      typeof incoming === "string" && incoming.trim()
        ? incoming.trim()
        : randomUUID();
    (req as any).correlationId = correlationId;
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  }
}
