import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateControlledLogDto {
  drug?: string;
  quantity?: number;
  patient?: string;
  notes?: string;
  loggedAt?: string;
}

@Injectable()
export class ControlledSubstancesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateControlledLogDto, userId: string, userName?: string) {
    if (!dto.drug) throw new BadRequestException("Drug is required");
    const qty = Number(dto.quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      throw new BadRequestException("Valid quantity is required");
    }
    return this.prisma.controlledSubstanceLog.create({
      data: {
        tenantId,
        drug: dto.drug,
        quantity: qty,
        patient: dto.patient || null,
        notes: dto.notes || null,
        loggedAt: dto.loggedAt ? new Date(dto.loggedAt) : new Date(),
        loggedBy: userName || userId,
      },
    });
  }

  async findAll(
    tenantId: string,
    params: { drug?: string; page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 100;
    const where: any = { tenantId };
    if (params.drug) where.drug = { contains: params.drug, mode: "insensitive" };
    const [data, total] = await Promise.all([
      this.prisma.controlledSubstanceLog.findMany({
        where,
        orderBy: { loggedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.controlledSubstanceLog.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.controlledSubstanceLog.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Log entry not found");
    await this.prisma.controlledSubstanceLog.delete({ where: { id } });
    return { success: true };
  }
}
