import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

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

  async onModuleInit() {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
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
