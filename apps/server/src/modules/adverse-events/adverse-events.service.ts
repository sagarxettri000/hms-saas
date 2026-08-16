import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateAdverseEventDto {
  patientId?: string;
  encounterId?: string;
  type: string;
  severity?: string;
  category?: string;
  description: string;
  occurredAt?: Date;
}

export interface UpdateAdverseEventDto {
  severity?: string;
  category?: string;
  description?: string;
  status?: string;
  rootCause?: string;
  actionsTaken?: string;
}

@Injectable()
export class AdverseEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: CreateAdverseEventDto,
    userId?: string,
  ) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    if (!dto.type) throw new BadRequestException("Event type is required");
    if (!dto.description) throw new BadRequestException("Description is required");

    if (dto.patientId) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, tenantId, deletedAt: null },
      });
      if (!patient) throw new NotFoundException("Patient not found");
    }

    const event = await this.prisma.adverseEvent.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        type: dto.type,
        severity: dto.severity || "MODERATE",
        category: dto.category,
        description: dto.description,
        occurredAt: dto.occurredAt || new Date(),
        reportedBy: userId,
      },
    });

    await this.logAudit(tenantId, userId, "CREATE", "AdverseEvent", event.id);
    return event;
  }

  async findAll(
    tenantId: string,
    query: { patientId?: string; status?: string; type?: string; severity?: string; page?: number; limit?: number } = {},
  ) {
    const where: Prisma.AdverseEventWhereInput = { tenantId };
    if (query.patientId) where.patientId = query.patientId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.severity) where.severity = query.severity;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const [items, total] = await Promise.all([
      this.prisma.adverseEvent.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
        },
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.adverseEvent.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(tenantId: string, id: string) {
    const event = await this.prisma.adverseEvent.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
      },
    });
    if (!event) throw new NotFoundException("Adverse event not found");
    return event;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAdverseEventDto,
    userId?: string,
  ) {
    const existing = await this.prisma.adverseEvent.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Adverse event not found");

    const data: Prisma.AdverseEventUpdateInput = {};
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.rootCause !== undefined) data.rootCause = dto.rootCause;
    if (dto.actionsTaken !== undefined) data.actionsTaken = dto.actionsTaken;

    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === "CLOSED") {
        data.closedAt = new Date();
        data.closedBy = userId;
      }
    }

    const updated = await this.prisma.adverseEvent.update({
      where: { id },
      data,
    });

    await this.logAudit(tenantId, userId, "UPDATE", "AdverseEvent", id, {
      status: dto.status,
    });
    return updated;
  }

  async dashboard(tenantId: string) {
    const [open, severe, total, byType] = await Promise.all([
      this.prisma.adverseEvent.count({
        where: { tenantId, status: { notIn: ["CLOSED"] } },
      }),
      this.prisma.adverseEvent.count({
        where: { tenantId, severity: { in: ["SEVERE", "FATAL"] } },
      }),
      this.prisma.adverseEvent.count({ where: { tenantId } }),
      this.prisma.adverseEvent.groupBy({
        by: ["type"],
        where: { tenantId },
        _count: true,
      }),
    ]);

    return { open, severe, total, byType };
  }

  private async logAudit(
    tenantId: string,
    userId: string | undefined,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
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
}
