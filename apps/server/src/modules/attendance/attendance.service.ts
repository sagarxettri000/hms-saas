import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { AttendanceStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface ClockInDto {
  status?: "PRESENT" | "ABSENT";
}

export interface EnrollTrainingDto {
  staffName?: string;
  program?: string;
}

function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function toDayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------
  // Staff (self-service)
  // ---------------------------------------------------------------

  async meToday(tenantId: string, userId: string) {
    const now = new Date();
    const { start, end } = dayBounds(now);

    const record = await this.prisma.attendanceRecord.findFirst({
      where: { tenantId, userId, date: { gte: start, lte: end } },
      orderBy: { clockIn: "desc" },
    });

    const roster = await this.prisma.roster.findFirst({
      where: { tenantId, userId, date: { gte: start, lte: end }, isActive: true },
      include: { shift: true },
      orderBy: { date: "asc" },
    });

    let status: "NOT_CLOCKED_IN" | AttendanceStatus | "CLOCKED_OUT";
    if (!record) {
      status = "NOT_CLOCKED_IN";
    } else if (record.status === AttendanceStatus.ABSENT) {
      status = AttendanceStatus.ABSENT;
    } else if (record.clockOut) {
      status = "CLOCKED_OUT";
    } else {
      status = AttendanceStatus.PRESENT;
    }

    return {
      data: {
        status,
        record,
        shift: roster?.shift ?? null,
        serverTime: now.toISOString(),
      },
    };
  }

  async history(tenantId: string, userId: string, from?: string, to?: string, page = 1, limit = 30) {
    const where: Prisma.AttendanceRecordWhereInput = { tenantId, userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        where.date.lte = t;
      }
    }

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

  async clockIn(tenantId: string, dto: ClockInDto, userId: string, userName?: string) {
    const status = dto?.status === "ABSENT" ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
    const now = new Date(); // authoritative server time — never from the client
    const { start, end } = dayBounds(now);
    const day = new Date(start); // unique-key day bucket (local midnight)

    // Look up the staff member's rostered shift for today (used when a shift exists).
    const roster = await this.prisma.roster.findFirst({
      where: { tenantId, userId, date: { gte: start, lte: end }, isActive: true },
      include: { shift: true },
      orderBy: { date: "asc" },
    });

    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.attendanceRecord.findFirst({
          where: { tenantId, userId, date: { gte: start, lte: end } },
        });
        if (existing) {
          return existing; // idempotent — duplicate clock-ins return today's record
        }

        return tx.attendanceRecord.create({
          data: {
            tenantId,
            userId,
            staffName: userName ?? null,
            date: day,
            status,
            clockIn: now,
            rosterId: roster?.id ?? null,
            createdBy: userId,
          },
        });
      });

      await this.audit.log(tenantId, userId, "AttendanceRecord", record.id, "CREATE", {
        action: "CLOCK_IN",
        status,
        clockIn: record.clockIn,
        rosterId: record.rosterId,
        shift: roster?.shift?.name ?? null,
      });

      return { data: record, shift: roster?.shift ?? null };
    } catch (err) {
      // Concurrent duplicate clock-in: the unique constraint caught it —
      // return the record the other request created.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const record = await this.prisma.attendanceRecord.findFirst({
          where: { tenantId, userId, date: { gte: start, lte: end } },
        });
        if (record) {
          return { data: record, shift: roster?.shift ?? null };
        }
      }
      this.logger.warn(`clockIn failed for user ${userId}: ${err}`);
      throw new BadRequestException("Could not record attendance");
    }
  }

  async clockOut(tenantId: string, userId: string) {
    const now = new Date(); // authoritative server time
    const { start, end } = dayBounds(now);

    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const open = await tx.attendanceRecord.findFirst({
          where: { tenantId, userId, date: { gte: start, lte: end }, clockOut: null },
          orderBy: { clockIn: "desc" },
        });
        if (!open) {
          throw new BadRequestException("No open attendance session");
        }
        if (open.status === AttendanceStatus.ABSENT) {
          throw new BadRequestException("Attendance already recorded as ABSENT");
        }

        const ms = now.getTime() - open.clockIn.getTime();
        const hours = Math.max(0, Number((ms / 3600000).toFixed(2)));

        return tx.attendanceRecord.update({
          where: { id: open.id },
          data: { clockOut: now, hours },
        });
      });

      await this.audit.log(tenantId, userId, "AttendanceRecord", record.id, "UPDATE", {
        action: "CLOCK_OUT",
        clockOut: record.clockOut,
        hours: record.hours,
      });

      return { data: record };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`clockOut failed for user ${userId}: ${err}`);
      throw new BadRequestException("Could not record clock out");
    }
  }

  // ---------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------

  async adminList(
    tenantId: string,
    query: {
      from?: string;
      to?: string;
      status?: string;
      role?: string;
      departmentId?: string;
      userId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 50));
    const now = new Date();
    const { start: todayStart, end: todayEnd } = dayBounds(now);

    const from = query.from ? new Date(query.from) : todayStart;
    const to = query.to ? this.endOfDay(new Date(query.to)) : todayEnd;

    const userWhere: Prisma.UserWhereInput = {};
    if (query.role) userWhere.role = query.role as any;
    if (query.departmentId) userWhere.departmentId = query.departmentId;
    if (query.search) {
      userWhere.OR = [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { staffProfile: { is: { employeeCode: { contains: query.search, mode: "insensitive" } } } },
      ];
    }

    const statusFilter = query.status; // PRESENT | ABSENT (NOT_CLOCKED_IN is served by adminTodayRoster)

    const recordsWhere: Prisma.AttendanceRecordWhereInput = {
      tenantId,
      date: { gte: from, lte: to },
      ...(statusFilter === "PRESENT" || statusFilter === "ABSENT"
        ? { status: statusFilter as AttendanceStatus }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: recordsWhere,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              department: { select: { id: true, name: true } },
              staffProfile: { select: { employeeCode: true, designation: true } },
            },
          },
          roster: { include: { shift: true } },
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attendanceRecord.count({ where: recordsWhere }),
    ]);

    const rows = records;

    // Summary over the full filtered date range (not just this page)
    const rangeWhere: Prisma.AttendanceRecordWhereInput = {
      tenantId,
      date: { gte: from, lte: to },
      ...(userWhere && Object.keys(userWhere).length ? { user: { is: userWhere } } : {}),
    };
    const [present, absent] = await Promise.all([
      this.prisma.attendanceRecord.count({ where: { ...rangeWhere, status: AttendanceStatus.PRESENT } }),
      this.prisma.attendanceRecord.count({ where: { ...rangeWhere, status: AttendanceStatus.ABSENT } }),
    ]);

    // "Not clocked in" — active staff with no attendance record for today.
    const staffWhere: Prisma.UserWhereInput = { isActive: true, deletedAt: null };
    if (userWhere.role) staffWhere.role = userWhere.role;
    if (userWhere.departmentId) staffWhere.departmentId = userWhere.departmentId;
    if (userWhere.OR) staffWhere.OR = userWhere.OR;
    const [totalStaff, presentTodayStaff] = await Promise.all([
      this.prisma.user.count({ where: staffWhere }),
      this.prisma.attendanceRecord.count({
        where: {
          tenantId,
          date: { gte: todayStart, lte: todayEnd },
          status: AttendanceStatus.PRESENT,
          ...(userWhere && Object.keys(userWhere).length ? { user: { is: userWhere } } : {}),
        },
      }),
    ]);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        present,
        absent,
        totalStaff,
        notClockedIn: Math.max(0, totalStaff - presentTodayStaff),
      },
    };
  }

  private endOfDay(d: Date): Date {
    const t = new Date(d);
    t.setHours(23, 59, 59, 999);
    return t;
  }

  async adminUserHistory(
    tenantId: string,
    targetUserId: string,
    query: { from?: string; to?: string; page?: number; limit?: number },
  ) {
    // Tenant isolation: the target user must belong to the admin's tenant.
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        department: { select: { id: true, name: true } },
        staffProfile: { select: { employeeCode: true, designation: true } },
      },
    });
    if (!target) throw new ForbiddenException("Staff member not found in your organization");

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 31));
    return this.history(tenantId, targetUserId, query.from, query.to, page, limit);
  }

  async adminTodayRoster(tenantId: string, query: { role?: string; departmentId?: string }) {
    const now = new Date();
    const { start, end } = dayBounds(now);

    const userWhere: Prisma.UserWhereInput = { isActive: true, deletedAt: null };
    if (query.role) userWhere.role = query.role as any;
    if (query.departmentId) userWhere.departmentId = query.departmentId;

    const staff = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        department: { select: { id: true, name: true } },
        staffProfile: { select: { employeeCode: true, designation: true } },
        attendanceRecords: {
          where: { tenantId, date: { gte: start, lte: end } },
          orderBy: { clockIn: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            clockIn: true,
            clockOut: true,
            hours: true,
            roster: { select: { shift: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    const rows = staff.map((u) => {
      const rec = u.attendanceRecords[0] ?? null;
      return {
        id: rec?.id ?? null,
        userId: u.id,
        employeeCode: u.staffProfile?.employeeCode ?? null,
        name: [u.firstName, u.lastName].filter(Boolean).join(" "),
        email: u.email,
        role: u.role,
        department: u.department?.name ?? null,
        designation: u.staffProfile?.designation ?? null,
        status: !rec ? "NOT_CLOCKED_IN" : rec.status === AttendanceStatus.ABSENT ? "ABSENT" : rec.clockOut ? "CLOCKED_OUT" : "PRESENT",
        clockIn: rec?.clockIn ?? null,
        clockOut: rec?.clockOut ?? null,
        hours: rec?.hours ?? null,
        shift: rec?.roster?.shift?.name ?? null,
      };
    });

    const summary = {
      present: rows.filter((r) => r.status === "PRESENT").length,
      absent: rows.filter((r) => r.status === "ABSENT").length,
      notClockedIn: rows.filter((r) => r.status === "NOT_CLOCKED_IN").length,
    };

    return { data: rows, total: rows.length, summary };
  }

  // ---------------------------------------------------------------
  // Legacy training methods (unchanged)
  // ---------------------------------------------------------------

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

  async listTraining(tenantId: string, params: { page?: number; limit?: number }) {
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

  async listAttendance(tenantId: string, params: { page?: number; limit?: number }) {
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
}
