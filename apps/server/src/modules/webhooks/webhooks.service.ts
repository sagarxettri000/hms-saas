import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateWebhookDto {
  url: string;
  secret?: string;
  events: string[];
}

export interface CreateApiKeyDto {
  name: string;
  expiresAt?: Date | string;
}

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async findWebhooks(tenantId: string) {
    return this.prisma.webhook.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createWebhook(tenantId: string, dto: CreateWebhookDto) {
    return this.prisma.webhook.create({
      data: {
        tenantId,
        url: dto.url,
        secret: dto.secret,
        events: dto.events as any,
      },
    });
  }

  async updateWebhook(
    tenantId: string,
    id: string,
    dto: Partial<CreateWebhookDto>,
  ) {
    const hook = await this.prisma.webhook.findFirst({
      where: { id, tenantId },
    });
    if (!hook) throw new NotFoundException("Webhook not found");
    const { tenantId: _omitted, ...fields } = dto as any;
    return this.prisma.webhook.update({
      where: { id },
      data: { ...fields, events: dto.events as any },
    });
  }

  async deleteWebhook(tenantId: string, id: string) {
    const hook = await this.prisma.webhook.findFirst({
      where: { id, tenantId },
    });
    if (!hook) throw new NotFoundException("Webhook not found");
    return this.prisma.webhook.delete({ where: { id } });
  }

  async findDeliveries(tenantId: string, webhookId?: string) {
    return this.prisma.webhookDelivery.findMany({
      where: { webhook: { tenantId }, ...(webhookId ? { webhookId } : {}) },
      include: { webhook: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  // ---------- API Keys ----------

  async findApiKeys(tenantId: string) {
    return this.prisma.apiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createApiKey(tenantId: string, dto: CreateApiKeyDto, userId?: string) {
    const raw = `hms_${randomBytes(24).toString("hex")}`;
    const prefix = raw.slice(0, 12);

    const created = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: dto.name,
        key: this.hashToken(raw),
        prefix,
        createdBy: userId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return { ...created, key: raw };
  }

  async revokeApiKey(tenantId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!key) throw new NotFoundException("API key not found");
    return this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
