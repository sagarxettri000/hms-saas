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
    super({
      log: [
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
            if (tenant) {
              const [, , result] = await base.$transaction([
                base.$executeRawUnsafe(
                  `SET LOCAL app.current_tenant_id = '${tenant}'`,
                ),
                base.$executeRawUnsafe(`SET LOCAL app.rls_bypass = 'false'`),
                query(args) as Prisma.PrismaPromise<unknown>,
              ]);
              return result;
            }
            const [, result] = await base.$transaction([
              base.$executeRawUnsafe(`SET LOCAL app.rls_bypass = 'true'`),
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
        this.logger.warn(`Database connection attempt ${attempt}/5 failed: ${err instanceof Error ? err.message : err}`);
        if (attempt < 5) await new Promise(r => setTimeout(r, 5000 * attempt));
      }
    }
    this.logger.error("Could not connect to database after 5 attempts, starting without DB");
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
