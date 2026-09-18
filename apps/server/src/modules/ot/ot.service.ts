import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateOtCaseDto {
  patientId: string;
  encounterId?: string;
  admissionId?: string;
  procedureName: string;
  procedureCode?: string;
  otType?: string;
  anesthesiaType?: string;
  surgeonId?: string;
  assistantId?: string;
  anesthetistId?: string;
  nurses?: string[] | Array<{ id?: string; name: string }>;
  otRoom?: string;
  scheduledDate?: Date | string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

@Injectable()
export class OtService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateOtCaseDto, userId?: string) {
    if (!dto.patientId) throw new BadRequestException("Patient is required");
    if (!dto.procedureName || !String(dto.procedureName).trim())
      throw new BadRequestException("Procedure name is required");
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const staffIds = [dto.surgeonId, dto.assistantId, dto.anesthetistId].filter(
      Boolean,
    ) as string[];
    if (staffIds.length > 0) {
      const staff = await this.prisma.doctorProfile.findMany({
        where: { id: { in: staffIds }, tenantId },
        select: { id: true },
      });
      if (staff.length !== staffIds.length)
        throw new BadRequestException(
          "Surgical staff not found in this tenant",
        );
    }

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, tenantId },
        select: { id: true, patientId: true },
      });
      if (!encounter) throw new NotFoundException("Encounter not found");
      if (encounter.patientId !== dto.patientId)
        throw new BadRequestException(
          "Encounter does not belong to this patient",
        );
    }

    if (dto.admissionId) {
      const admission = await this.prisma.admission.findFirst({
        where: { id: dto.admissionId, tenantId },
        select: { id: true, patientId: true },
      });
      if (!admission) throw new NotFoundException("Admission not found");
      if (admission.patientId !== dto.patientId)
        throw new BadRequestException(
          "Admission does not belong to this patient",
        );
    }

    const otNumber = await this.generateOtNumber(tenantId);
    return this.prisma.oTCase.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        admissionId: dto.admissionId,
        otNumber,
        procedureName: dto.procedureName,
        procedureCode: dto.procedureCode,
        otType: (dto.otType || "ELECTIVE") as any,
        anesthesiaType: dto.anesthesiaType as any,
        surgeonId: dto.surgeonId,
        assistantId: dto.assistantId,
        anesthetistId: dto.anesthetistId,
        nurses: Array.isArray(dto.nurses) ? dto.nurses : undefined,
        otRoom: dto.otRoom,
        scheduledDate: dto.scheduledDate
          ? new Date(dto.scheduledDate)
          : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        notes: dto.notes,
        requestedBy: userId,
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
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.scheduledDate = {};
      if (query.from) where.scheduledDate.gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        where.scheduledDate.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.oTCase.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          surgeon: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          assistant: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          anesthetist: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { scheduledDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.oTCase.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(tenantId: string, id: string) {
    const ot = await this.prisma.oTCase.findFirst({
      where: { id, tenantId },
      include: {
        patient: true,
        surgeon: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        assistant: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        anesthetist: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!ot) throw new NotFoundException("OT case not found");
    return ot;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    body: {
      status: string;
      otRoom?: string;
      startTime?: string;
      endTime?: string;
    },
    userId?: string,
  ) {
    const ot = await this.prisma.oTCase.findFirst({ where: { id, tenantId } });
    if (!ot) throw new NotFoundException("OT case not found");

    const VALID = [
      "REQUESTED",
      "APPROVED",
      "SCHEDULED",
      "PREPARED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];
    if (!VALID.includes(body.status))
      throw new BadRequestException("Invalid OT case status");

    const data: any = {
      status: body.status,
      otRoom: body.otRoom,
      startTime: body.startTime,
      endTime: body.endTime,
    };
    if (body.status === "APPROVED") {
      data.approvedBy = userId;
      data.approvedAt = new Date();
    }
    if (body.status === "SCHEDULED")
      data.scheduledDate = ot.scheduledDate || new Date();

    return this.prisma.oTCase.update({ where: { id }, data });
  }

  async saveChecklist(tenantId: string, id: string, checklist: any) {
    const ot = await this.prisma.oTCase.findFirst({ where: { id, tenantId } });
    if (!ot) throw new NotFoundException("OT case not found");
    return this.prisma.oTCase.update({ where: { id }, data: { checklist } });
  }

  async updateFindings(tenantId: string, id: string, findings: string) {
    const ot = await this.prisma.oTCase.findFirst({ where: { id, tenantId } });
    if (!ot) throw new NotFoundException("OT case not found");
    return this.prisma.oTCase.update({
      where: { id },
      data: { findings, status: "COMPLETED" },
    });
  }

  async getSchedule(tenantId: string, date?: string) {
    const where: any = { tenantId };
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.scheduledDate = { gte: start, lt: end };
    } else {
      where.status = { in: ["APPROVED", "SCHEDULED", "IN_PROGRESS"] };
    }
    return this.prisma.oTCase.findMany({
      where,
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        surgeon: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        assistant: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        anesthetist: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });
  }

  private async generateOtNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.oTCase.findFirst({
      where: { tenantId, otNumber: { startsWith: `OT-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { otNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.otNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `OT-${ymd}-${String(seq).padStart(4, "0")}`;
  }
}
