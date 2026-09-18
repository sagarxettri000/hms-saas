import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface UpdateSettingDto {
  key: string;
  value: unknown;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(tenantId: string) {
    return this.prisma.tenantSetting.findMany({
      where: { tenantId },
      orderBy: { key: "asc" },
    });
  }

  async get(tenantId: string, key: string) {
    const setting = await this.prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (!setting) throw new NotFoundException(`Setting ${key} not found`);
    return setting;
  }

  async set(tenantId: string, key: string, value: unknown, userId?: string) {
    return this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value: value as any, updatedBy: userId },
      update: { value: value as any, updatedBy: userId },
    });
  }

  async setMany(
    tenantId: string,
    settings: Array<{ key: string; value: unknown }>,
    userId?: string,
  ) {
    const results = [];
    for (const setting of settings) {
      results.push(
        await this.prisma.tenantSetting.upsert({
          where: { tenantId_key: { tenantId, key: setting.key } },
          create: {
            tenantId,
            key: setting.key,
            value: setting.value as any,
            updatedBy: userId,
          },
          update: { value: setting.value as any, updatedBy: userId },
        }),
      );
    }
    return results;
  }

  async getFeatureFlags(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const [flags, tenantFlags] = await Promise.all([
      this.prisma.featureFlag.findMany({
        orderBy: { name: "asc" },
      }),
      this.prisma.tenantFeatureFlag.findMany({
        where: { tenantId },
        include: { flag: true },
      }),
    ]);

    const effective = new Map(tenantFlags.map((f) => [f.flag.key, f.enabled]));

    return flags.map((f) => ({
      key: f.key,
      name: f.name,
      description: f.description,
      enabled: effective.has(f.key) ? effective.get(f.key) : f.defaultEnabled,
    }));
  }

  async setFeatureFlag(
    tenantId: string,
    key: string,
    enabled: boolean,
    userId?: string,
  ) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundException(`Feature flag ${key} not found`);

    return this.prisma.tenantFeatureFlag.upsert({
      where: {
        tenantId_flagId: { tenantId, flagId: flag.id },
      },
      create: { tenantId, flagId: flag.id, enabled, updatedBy: userId },
      update: { enabled, updatedBy: userId },
    });
  }

  async getIntegrations(tenantId: string) {
    return this.prisma.integrationSetting.findMany({
      where: { tenantId },
      orderBy: { provider: "asc" },
    });
  }

  async setIntegration(
    tenantId: string,
    provider: string,
    config: unknown,
    enabled: boolean,
    userId?: string,
  ) {
    return this.prisma.integrationSetting.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, config: config as any, enabled },
      update: { config: config as any, enabled },
    });
  }
}
