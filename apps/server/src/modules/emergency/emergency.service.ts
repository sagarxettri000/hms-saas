import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateEmergencyCaseDto {
  patientId: string;
  arrivalMode?: string;
  triageLevel?: string;
  chiefComplaint?: string;
  triageNotes?: string;
  isMLC?: boolean;
  mlcNumber?: string;
  policeCase?: boolean;
  vitals?: any;
  examination?: string;
  history?: string;
}

@Injectable()
export class EmergencyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateEmergencyCaseDto, userId?: string) {
    if (!dto.patientId) throw new BadRequestException("Patient is required");
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    const caseNumber = await this.generateCaseNumber(tenantId);
    return this.prisma.emergencyCase.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        caseNumber,
        arrivalMode: dto.arrivalMode,
        triageLevel: dto.triageLevel,
        chiefComplaint: dto.chiefComplaint,
        triageNotes: dto.triageNotes,
        isMLC: dto.isMLC,
        mlcNumber: dto.mlcNumber,
        policeCase: dto.policeCase,
        vitals: dto.vitals,
        examination: dto.examination,
        history: dto.history,
        createdBy: userId,
      },
    });
  }

  async findAll(
    tenantId: string,
    query: {
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = { tenantId };
    if (query.status) {
      if (query.status === "ACTIVE") {
        where.admitted = false;
        where.dischargedAt = null;
      } else if (query.status === "ADMITTED") {
        where.admitted = true;
        where.dischargedAt = null;
      } else if (query.status === "DISCHARGED") {
        where.dischargedAt = { not: null };
      }
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.emergencyCase.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.emergencyCase.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(tenantId: string, id: string) {
    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
      include: { patient: true },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    return ec;
  }

  async update(
    tenantId: string,
    id: string,
    dto: Partial<CreateEmergencyCaseDto>,
  ) {
    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    const ALLOWED = [
      "arrivalMode",
      "triageLevel",
      "chiefComplaint",
      "triageNotes",
      "isMLC",
      "mlcNumber",
      "policeCase",
      "vitals",
      "examination",
      "history",
    ];
    const data: any = {};
    for (const field of ALLOWED) {
      if ((dto as any)[field] !== undefined) data[field] = (dto as any)[field];
    }
    return this.prisma.emergencyCase.update({
      where: { id },
      data,
    });
  }

  async admit(
    tenantId: string,
    id: string,
    body: { admittedTo?: string },
    userId?: string,
  ) {
    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    if (ec.dischargedAt)
      throw new BadRequestException("Cannot admit a discharged case");
    return this.prisma.emergencyCase.update({
      where: { id },
      data: {
        admitted: true,
        admittedTo: body.admittedTo,
        admittedAt: new Date(),
      },
    });
  }

  async discharge(
    tenantId: string,
    id: string,
    body: { dischargeSummary?: string },
  ) {
    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    if (ec.dischargedAt)
      throw new BadRequestException("Case is already discharged");
    return this.prisma.emergencyCase.update({
      where: { id },
      data: {
        admitted: false,
        dischargeSummary: body.dischargeSummary,
        dischargedAt: new Date(),
      },
    });
  }

  async getDashboard(tenantId: string) {
    const [total, today, admitted] = await Promise.all([
      this.prisma.emergencyCase.count({ where: { tenantId } }),
      this.prisma.emergencyCase.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.emergencyCase.count({
        where: { tenantId, admitted: true, dischargedAt: null },
      }),
    ]);

    return { total, today, currentlyAdmitted: admitted };
  }

  private async generateCaseNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.emergencyCase.findFirst({
      where: { tenantId, caseNumber: { startsWith: `ER-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { caseNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.caseNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `ER-${ymd}-${String(seq).padStart(4, "0")}`;
  }
}
