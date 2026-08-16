import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    tenantId: string,
    userId: string | undefined,
    entity: string,
    entityId: string | undefined,
    action: string,
    metadata?: any,
  ) {
    if (!userId) return;
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          entity,
          entityId,
          action: action as any,
          metadata,
        },
      });
    } catch {}
  }

  async find(
    tenantId: string,
    query: {
      entity?: string;
      userId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 30;

    const where: any = { tenantId };
    if (query.entity) where.entity = query.entity;
    if (query.userId) where.userId = query.userId;
    if (query.from || query.to) {
      where.timestamp = {};
      if (query.from) where.timestamp.gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        where.timestamp.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
        },
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
