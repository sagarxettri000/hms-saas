import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsHub } from "./notifications.hub";
import { CommunicationsService } from "../communications/communications.service";

export interface CreateNotificationDto {
  userId?: string;
  title: string;
  body: string;
  channel?: string;
  type?: string;
  referenceType?: string;
  referenceId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: NotificationsHub,
    private readonly communications: CommunicationsService,
  ) {}

  async create(tenantId: string, dto: CreateNotificationDto) {
    if (!tenantId) return null;
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        userId: dto.userId,
        title: dto.title,
        body: dto.body,
        channel: (dto.channel || "IN_APP") as any,
        type: dto.type,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        status: "SENT" as any,
        sentAt: new Date(),
      },
    });

    if (dto.userId) {
      this.hub.emit({
        tenantId,
        userId: dto.userId,
        notification: {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          channel: notification.channel,
          referenceType: notification.referenceType,
          referenceId: notification.referenceId,
          createdAt: notification.createdAt,
        },
      });
    }

    this.dispatchExternal(tenantId, dto).catch(() => {});

    return notification;
  }

  private async dispatchExternal(tenantId: string, dto: CreateNotificationDto) {
    const channel = (dto.channel || "IN_APP").toUpperCase();

    if (channel === "EMAIL" || channel === "ALL") {
      const target = dto.userId
        ? await this.prisma.user.findFirst({
            where: { id: dto.userId, tenantId },
            select: { email: true, phone: true },
          })
        : null;
      if (target?.email) {
        await this.communications.sendEmail(tenantId, {
          to: target.email,
          subject: dto.title,
          html: `<p>${this.escapeHtml(String(dto.body ?? ""))}</p>`,
          text: dto.body,
        });
      }
    }

    if (channel === "SMS" || channel === "ALL") {
      const target = dto.userId
        ? await this.prisma.user.findFirst({
            where: { id: dto.userId, tenantId },
            select: { phone: true },
          })
        : null;
      if (target?.phone) {
        await this.communications.sendSms(tenantId, {
          to: target.phone,
          message: `${dto.title}: ${dto.body}`,
        });
      }
    }
  }

  async findMine(
    tenantId: string,
    userId: string,
    query: { unreadOnly?: string; page?: number; limit?: number },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = { tenantId, userId };
    if (query.unreadOnly === "true") where.readAt = null;

    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { tenantId, userId, readAt: null },
      }),
    ]);

    return {
      data,
      total,
      unread,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAsRead(tenantId: string, id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, tenantId, userId },
      data: { readAt: new Date(), status: "READ" as any },
    });
  }

  async markAllRead(tenantId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { tenantId, userId, readAt: null },
      data: { readAt: new Date(), status: "READ" as any },
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
