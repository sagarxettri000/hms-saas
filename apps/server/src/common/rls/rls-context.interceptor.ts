import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { RlsContext } from "./rls.context";

@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      return next.handle();
    }

    const isSuperAdmin = user.role === "PLATFORM_SUPER_ADMIN";
    const ctx = {
      tenantId: user.tenantId as string | undefined,
      bypass: isSuperAdmin || !user.tenantId,
    };

    return new Observable((subscriber) => {
      RlsContext.run(ctx, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
