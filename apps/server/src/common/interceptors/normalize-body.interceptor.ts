import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";

const FK_SUFFIX = /Id$/;

function isForeignKeyKey(key: string): boolean {
  return FK_SUFFIX.test(key);
}

function normalizeObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === "string" && value === "" && isForeignKeyKey(key)) {
      obj[key] = null;
      continue;
    }
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (
          value[i] &&
          typeof value[i] === "object" &&
          !Array.isArray(value[i])
        ) {
          value[i] = normalizeObject(value[i]);
        }
      }
    } else if (typeof value === "object") {
      obj[key] = normalizeObject(value as Record<string, unknown>);
    }
  }
  return obj;
}

@Injectable()
export class NormalizeBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    if (request.body && typeof request.body === "object") {
      request.body = normalizeObject(request.body);
    }
    return next.handle();
  }
}
