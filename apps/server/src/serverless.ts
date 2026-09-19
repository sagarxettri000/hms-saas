import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import type { Express } from "express";
import helmet from "helmet";
import compression from "compression";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { NormalizeBodyInterceptor } from "./common/interceptors/normalize-body.interceptor";
import { RequestLoggerInterceptor } from "./common/interceptors/request-logger.interceptor";
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe";
import { RlsContextInterceptor } from "./common/rls/rls-context.interceptor";

let cachedApp: Express | undefined;

export async function bootstrapNest(): Promise<Express> {
  if (cachedApp) return cachedApp;

  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    logger:
      process.env.NODE_ENV === "production" ? ["error", "warn"] : undefined,
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-ID",
      "X-Correlation-ID",
      "X-HMS-CSRF",
      "X-Requested-With",
    ],
  });

  app.use(helmet());
  app.use(compression());

  app.setGlobalPrefix("api/v1");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new NormalizeBodyInterceptor(),
    new RequestLoggerInterceptor(),
    new RlsContextInterceptor(),
    new TransformInterceptor(),
  );

  await app.init();

  cachedApp = app.getHttpAdapter().getInstance() as Express;
  return cachedApp;
}