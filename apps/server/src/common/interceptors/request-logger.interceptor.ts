import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request, Response } from "express";

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req: Request = http.getRequest();
    const res: Response = http.getResponse();

    const start = Date.now();
    const correlationId = (req as any).correlationId;

    return next.handle().pipe(
      tap({
        next: () => {
          this.log(req, res.statusCode, Date.now() - start, correlationId);
        },
        error: (err: any) => {
          this.log(
            req,
            err?.status || err?.statusCode || 500,
            Date.now() - start,
            correlationId,
            err?.message,
          );
        },
      }),
    );
  }

  private log(
    req: Request,
    status: number,
    durationMs: number,
    correlationId: string,
    error?: string,
  ) {
    // Log the path without the query string so sensitive values passed via
    // the URL (e.g. short-lived SSE stream tokens) never reach the logs.
    const path =
      typeof req.path === "string"
        ? req.path
        : (req.originalUrl || req.url || "/").split("?")[0];
    const meta: Record<string, any> = {
      correlationId,
      method: req.method,
      path,
      status,
      durationMs,
      ip: req.ip,
    };
    if ((req as any).user) {
      const user = (req as any).user;
      meta.userId = user.id;
      meta.tenantId = user.tenantId;
      meta.role = user.role;
    }
    if (error) meta.error = error;

    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "log";
    const msg = `${req.method} ${path} ${status} ${durationMs}ms`;
    this.logger[level](msg, meta);
  }
}
