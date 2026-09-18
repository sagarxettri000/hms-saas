import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreatePreauthDto {
  patientId?: string;
  patientName?: string;
  providerName?: string;
  policyNumber?: string;
  treatment?: string;
  estimatedCost?: number;
  notes?: string;
}

export interface UpdatePreauthDto {
  treatment?: string;
  estimatedCost?: number;
  notes?: string;
}

const ALLOWED_STATUSES = ["PENDING", "APPROVED", "DENIED", "EXPIRED"];

@Injectable()
export class PreauthorizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreatePreauthDto, userId: string) {
    if (!dto.treatment) throw new BadRequestException("Treatment is required");
    const cost = Number(dto.estimatedCost);
    if (!Number.isFinite(cost) || cost < 0) {
      throw new BadRequestException("Valid estimated cost is required");
    }
    return this.prisma.insurancePreauthorization.create({
      data: {
        tenantId,
        patientId: dto.patientId || null,
        patientName: dto.patientName || null,
        providerName: dto.providerName || null,
        policyNumber: dto.policyNumber || null,
        treatment: dto.treatment,
        estimatedCost: cost,
        notes: dto.notes || null,
        createdBy: userId,
      },
    });
  }

  async findAll(
    tenantId: string,
    params: {
      status?: string;
      patientId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 50;
    const where: any = { tenantId };
    if (params.status) where.status = params.status;
    if (params.patientId) where.patientId = params.patientId;

    const [data, total] = await Promise.all([
      this.prisma.insurancePreauthorization.findMany({
        where,
        orderBy: { requestedDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.insurancePreauthorization.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(tenantId: string, id: string) {
    const record = await this.prisma.insurancePreauthorization.findFirst({
      where: { id, tenantId },
    });
    if (!record) throw new NotFoundException("Pre-authorization not found");
    return record;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePreauthDto,
    userId: string,
  ) {
    const existing = await this.findById(tenantId, id);
    const data: any = {};
    if (dto.treatment !== undefined) data.treatment = dto.treatment;
    if (dto.estimatedCost !== undefined) {
      const cost = Number(dto.estimatedCost);
      if (!Number.isFinite(cost) || cost < 0) {
        throw new BadRequestException("Invalid estimated cost");
      }
      data.estimatedCost = cost;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;
    data.updatedBy = userId;
    await this.prisma.insurancePreauthorization.update({ where: { id }, data });
    return this.findById(tenantId, existing.id);
  }

  async decide(
    tenantId: string,
    id: string,
    decision: string,
    approvedAmount?: number,
  ) {
    const existing = await this.findById(tenantId, id);
    const status = decision.toUpperCase();
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new BadRequestException("Invalid decision");
    }
    const data: any = { status, decisionDate: new Date() };
    if (status === "APPROVED") {
      data.approvedAmount =
        approvedAmount != null
          ? Number(approvedAmount)
          : existing.estimatedCost;
    } else if (status === "DENIED") {
      data.approvedAmount = null;
    }
    await this.prisma.insurancePreauthorization.update({ where: { id }, data });
    return this.findById(tenantId, id);
  }
}
