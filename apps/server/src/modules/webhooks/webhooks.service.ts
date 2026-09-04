import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { PrismaService } from "../../prisma/prisma.service";

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x12700000, 0x127fffff], // 127.0.0.0/8 (loopback)
  [0x64400000, 0x647fffff], // 100.64.0.0/10 (CGNAT)
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 (link-local / cloud metadata)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc633ffff], // 198.18.0.0/15
  [0xe0000000, 0xefffffff], // 224.0.0.0/4 (multicast)
  [0xf0000000, 0xffffffff], // 240.0.0.0/4 (reserved)
];

function ipv4ToInt(parts: string): number | null {
  const octets = parts.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
    return null;
  }
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

function isBlockedIPv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true;
  return PRIVATE_IPV4_RANGES.some(
    ([start, end]) => value >= start && value <= end,
  );
}

function isBlockedIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  const normalized = lower.includes("%") ? lower.split("%")[0] : lower;
  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true; // link-local
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) {
    return true;
  }
  if (h === "metadata.google.internal" || h === "metadata" || h.endsWith(".internal")) {
    return true;
  }
  if (isIP(h)) {
    if (isIP(h) === 4) return isBlockedIPv4(h);
    return isBlockedIPv6(h);
  }
  return false;
}

async function assertSafeWebhookUrl(urlValue: string): Promise<void> {
  const parsed = new URL(urlValue);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestException("Webhook URL must use http or https");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new BadRequestException("Webhook URL resolves to a restricted address");
  }
  let addresses: string[];
  try {
    const result = await lookup(parsed.hostname, { all: true });
    addresses = result.map((r) => r.address);
  } catch {
    throw new BadRequestException("Webhook URL could not be resolved");
  }
  const blocked = addresses.some((addr) =>
    isIP(addr) === 4 ? isBlockedIPv4(addr) : isBlockedIPv6(addr),
  );
  if (blocked) {
    throw new BadRequestException("Webhook URL resolves to a restricted address");
  }
}

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
    await assertSafeWebhookUrl(dto.url);
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
    if (dto.url) await assertSafeWebhookUrl(dto.url);
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
