import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateHandoverDto {
  wardId?: string;
  wardName?: string;
  shiftDate?: string;
  notes?: string;
}

@Injectable()
export class NursingHandoversService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateHandoverDto, userId: string, userName?: string) {
    return this.prisma.shiftHandover.create({
      data: {
        tenantId,
        wardId: dto.wardId || null,
        wardName: dto.wardName || null,
        shiftDate: dto.shiftDate ? new Date(dto.shiftDate) : new Date(),
        notes: dto.notes || null,
        savedBy: userName || userId,
      },
    });
  }

  async findAll(
    tenantId: string,
    params: { wardId?: string; page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 100;
    const where: any = { tenantId };
    if (params.wardId) where.wardId = params.wardId;
    const [data, total] = await Promise.all([
      this.prisma.shiftHandover.findMany({
        where,
        orderBy: { shiftDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shiftHandover.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
