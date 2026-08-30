import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface ClockInDto {
  staffName?: string;
}

export interface EnrollTrainingDto {
  staffName?: string;
  program?: string;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async clockIn(tenantId: string, dto: ClockInDto, userId: string, userName?: string) {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const open = await this.prisma.attendanceRecord.findFirst({
      where: { tenantId, date: { gte: dayStart, lte: dayEnd }, clockOut: null },
    });
    if (open) return open;

    return this.prisma.attendanceRecord.create({
      data: {
        tenantId,
        staffName: dto.staffName || userName || null,
        date: now,
        clockIn: now,
        createdBy: userId,
      },
    });
  }

  async clockOut(tenantId: string, userId: string) {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const open = await this.prisma.attendanceRecord.findFirst({
      where: { tenantId, date: { gte: dayStart, lte: dayEnd }, clockOut: null },
    });
    if (!open) throw new BadRequestException("No open attendance session");

    const hours = Number(((now.getTime() - open.clockIn.getTime()) / 3600000).toFixed(2));
    return this.prisma.attendanceRecord.update({
      where: { id: open.id },
      data: { clockOut: now, hours },
    });
  }

  async listAttendance(
    tenantId: string,
    params: { page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 100;
    const where: any = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async enroll(tenantId: string, dto: EnrollTrainingDto, userId: string, userName?: string) {
    if (!dto.program) throw new BadRequestException("Program is required");
    return this.prisma.staffTraining.create({
      data: {
        tenantId,
        staffName: dto.staffName || userName || null,
        program: dto.program,
        enrolledAt: new Date(),
        createdBy: userId,
      },
    });
  }

  async toggleTraining(tenantId: string, id: string) {
    const t = await this.prisma.staffTraining.findFirst({ where: { id, tenantId } });
    if (!t) throw new BadRequestException("Training record not found");
    const completed = t.completedAt == null;
    return this.prisma.staffTraining.update({
      where: { id },
      data: { completedAt: completed ? new Date() : null },
    });
  }

  async setCertificateDate(tenantId: string, id: string, certificateDate?: string) {
    const t = await this.prisma.staffTraining.findFirst({ where: { id, tenantId } });
    if (!t) throw new BadRequestException("Training record not found");
    return this.prisma.staffTraining.update({
      where: { id },
      data: { certificateDate: certificateDate ? new Date(certificateDate) : null },
    });
  }

  async listTraining(
    tenantId: string,
    params: { page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 100;
    const where: any = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.staffTraining.findMany({
        where,
        orderBy: { enrolledAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.staffTraining.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
