import { Module, Global } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisConfigured = Boolean(configService.get("REDIS_HOST"));
        return {
          connection: {
            host: configService.get("REDIS_HOST", "localhost"),
            port: configService.get("REDIS_PORT", 6379),
            password: configService.get("REDIS_PASSWORD") || undefined,
            db: configService.get("REDIS_DB", 0),
            // Without a configured Redis the app must still boot: the queue
            // service falls back to processing HL7 messages synchronously.
            // Only connect eagerly when Redis is explicitly configured.
            maxRetriesPerRequest: redisConfigured ? 3 : null,
            enableReadyCheck: redisConfigured,
            lazyConnect: !redisConfigured,
          },
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: "hl7-ingest" },
      { name: "hl7-retry" },
      { name: "hl7-dead-letter" },
    ),
  ],
  exports: [BullModule],
})
export class Hl7QueueModule {}
