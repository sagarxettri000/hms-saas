import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const checks: Record<string, { status: string; latency?: number }> = {};
    const startedAt = Date.now();

    // Database check
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: "healthy",
        latency: Date.now() - dbStart,
      };
    } catch {
      checks.database = {
        status: "unhealthy",
      };
    }

    const status = Object.values(checks).every((c) => c.status === "healthy")
      ? "healthy"
      : Object.values(checks).some((c) => c.status === "healthy")
        ? "degraded"
        : "unhealthy";

    return {
      status,
      ready: checks.database?.status === "healthy",
      services: checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      latency: Date.now() - startedAt,
      version: "1.0.0",
    };
  }
}
