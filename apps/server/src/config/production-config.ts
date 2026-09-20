import { Logger } from "@nestjs/common";

const logger = new Logger("ProductionConfig");

export function validateProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.CORS_ORIGIN) missing.push("CORS_ORIGIN");
  if (!process.env.JWT_ACCESS_PRIVATE_KEY && !process.env.JWT_ACCESS_SECRET) {
    missing.push("JWT_ACCESS_PRIVATE_KEY or JWT_ACCESS_SECRET");
  }
  if (process.env.ENABLE_RLS !== "true") missing.push("ENABLE_RLS=true");
  if (missing.length > 0) {
    throw new Error(
      `Production security configuration is incomplete: ${missing.join(", ")}`,
    );
  }

  const corsOrigin = process.env.CORS_ORIGIN as string;
  const databaseUrl = process.env.DATABASE_URL as string;
  const origins = corsOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    origins.length === 0 ||
    origins.includes("*") ||
    origins.some((origin) => !origin.startsWith("https://"))
  ) {
    throw new Error(
      "Production CORS_ORIGIN must contain only explicit HTTPS origins; wildcards and HTTP origins are rejected.",
    );
  }

  if (!process.env.APP_URL?.startsWith("https://")) {
    throw new Error("Production APP_URL must be an explicit HTTPS URL.");
  }

  if (/localhost|127\.0\.0\.1/i.test(databaseUrl)) {
    throw new Error("Production DATABASE_URL cannot point to localhost.");
  }

  logger.log("Production security configuration validated.");
}