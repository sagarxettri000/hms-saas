import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { getTenantContext, TenantContext } from "../utils/tenant-context";

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return getTenantContext(request);
  },
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
