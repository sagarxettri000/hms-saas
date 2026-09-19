import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient, Prisma } from "@prisma/client";
import { RlsContext } from "../common/rls/rls.context";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Query-level event logging is useful locally but adds measurable overhead
    // per statement on serverless (a remote DB round trip dominates already).
    // Production keeps only warn/error.
    const isProduction = process.env.NODE_ENV === "production";
    super({
      // Interactive transactions touch the remote Prisma Postgres host with
      // several sequential round-trips (number generation + create + update
      // + ledger write ≈ 8 queries); the 5s default expires mid-transaction
      // on a remote DB (~600ms+ per round trip) and rolls back valid work.
      transactionOptions: {
        maxWait: 10_000,
        timeout: 30_000,
      },
      log: isProduction
        ? [
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "info" },
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ],
    });
  }

  private applyRlsExtension() {
    if (process.env.ENABLE_RLS !== "true") {
      return;
    }
    const base = this as unknown as PrismaClient;
    const extended = base.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const ctx = RlsContext.get();
            const tenant = ctx?.tenantId;
            const bypass = ctx?.bypass === true || !tenant;
            // Only scope to the caller's tenant when RLS is NOT bypassed and a
            // tenant is known. PostgreSQL does not allow parameters (e.g. $1)
            // in the SET command, so the value must be inlined. To prevent SQL
            // injection via a caller-supplied tenant id, sanitize it down to a
            // safe character set (tenant ids are Prisma cuids) before quoting.
            if (tenant && !bypass) {
              const safeTenant = String(tenant).replace(/[^a-zA-Z0-9_-]/g, "");
              const [, , result] = await base.$transaction([
                base.$executeRawUnsafe(
                  `SET LOCAL app.current_tenant_id = '${safeTenant}'`,
                ),
                base.$executeRaw`SET LOCAL app.rls_bypass = 'false'`,
                query(args) as Prisma.PrismaPromise<unknown>,
              ]);
              return result;
            }
            const [, result] = await base.$transaction([
              base.$executeRaw`SET LOCAL app.rls_bypass = 'true'`,
              query(args) as Prisma.PrismaPromise<unknown>,
            ]);
            return result;
          },
        },
      },
    });
    Object.assign(this, extended);
    this.logger.log("Row-Level Security Prisma extension enabled.");
  }

  async onModuleInit() {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
        this.applyRlsExtension();
        this.logger.log("Database connected successfully");
        return;
      } catch (err) {
        this.logger.warn(
          `Database connection attempt ${attempt}/5 failed: ${err instanceof Error ? err.message : err}`,
        );
        if (attempt < 5)
          await new Promise((r) => setTimeout(r, 5000 * attempt));
      }
    }
    this.logger.error(
      "Could not connect to database after 5 attempts, starting without DB",
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log("Database disconnected");
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Cannot clean database in production");
    }
    const models = Reflect.ownKeys(this).filter(
      (key): key is string =>
        typeof key === "string" && !key.startsWith("_") && !key.startsWith("$"),
    );
    const delegates = this as unknown as Record<
      string,
      { deleteMany: () => Promise<unknown> }
    >;
    for (const model of models) {
      if (typeof delegates[model]?.deleteMany === "function") {
        await delegates[model].deleteMany();
      }
    }
  }
}
