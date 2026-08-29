import { AsyncLocalStorage } from "async_hooks";

export interface RlsSecurityContext {
  tenantId?: string;
  bypass?: boolean;
}

export class RlsContext {
  private static storage = new AsyncLocalStorage<RlsSecurityContext>();

  static run<T>(ctx: RlsSecurityContext, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }

  static get(): RlsSecurityContext | undefined {
    return this.storage.getStore();
  }
}
