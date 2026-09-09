import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import compression from "compression";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { NormalizeBodyInterceptor } from "./common/interceptors/normalize-body.interceptor";
import { RequestLoggerInterceptor } from "./common/interceptors/request-logger.interceptor";
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe";
import { RlsContextInterceptor } from "./common/rls/rls-context.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === "production"
      ? ["error", "warn"]
      : undefined,
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID", "X-Correlation-ID", "X-HMS-CSRF", "X-Requested-With"],
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

  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("HMS SaaS API")
      .setDescription("Enterprise SaaS Hospital Management System API")
      .setVersion("1.0.0")
      .addBearerAuth()
      .addTag("Auth", "Authentication endpoints")
      .addTag("Tenants", "Multi-tenant management")
      .addTag("Users", "User management")
      .addTag("Roles", "Role management")
      .addTag("Permissions", "Permission management")
      .addTag("Patients", "Patient management")
      .addTag("Appointments", "Appointment management")
      .addTag("Doctors", "Doctor management")
      .addTag("Encounters", "Clinical encounters")
      .addTag("Departments", "Department management")
      .addTag("Settings", "System settings")
      .addTag("Health", "Health checks")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 HMS SaaS API running on http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
