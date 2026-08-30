import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { UserRole } from "@hms/shared";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateShiftDto {
  name: string;
  startTime: string;
  endTime: string;
  workingHours?: number;
}

export interface CreateRosterDto {
  userId: string;
  shiftId?: string;
  date: Date | string;
  notes?: string;
}

export interface CreateLeaveDto {
  userId: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string;
  days: number;
  reason?: string;
}

export interface CreateStaffDto {
  firstName: string;
  lastName?: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  employeeCode?: string;
  designation?: string;
  password?: string;
}

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Shifts ----------

  async findShifts(tenantId: string) {
    return this.prisma.shift.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  }

  async createShift(tenantId: string, dto: CreateShiftDto) {
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Shift name is required");
    if (!dto.startTime || !dto.endTime)
      throw new BadRequestException("Start and end time are required");
    const { tenantId: _t, ...clean } = dto as any;
    return this.prisma.shift.create({ data: { tenantId, ...clean } });
  }

  async updateShift(
    tenantId: string,
    id: string,
    dto: Partial<CreateShiftDto>,
  ) {
    const existing = await this.prisma.shift.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Shift not found");
    const { tenantId: _t, id: _id, ...clean } = dto as any;
    return this.prisma.shift.update({ where: { id }, data: clean });
  }

  // ---------- Rosters ----------

  async findRosters(tenantId: string, date?: string) {
    const where: any = { tenantId };
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.date = { gte: start, lt: end };
    }
    return this.prisma.roster.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        shift: true,
      },
      orderBy: { date: "desc" },
    });
  }

  async createRoster(tenantId: string, dto: CreateRosterDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId },
    });
    if (!user) throw new NotFoundException("User not found");
    return this.prisma.roster.create({
      data: {
        tenantId,
        userId: dto.userId,
        shiftId: dto.shiftId,
        date: new Date(dto.date),
        notes: dto.notes,
      },
    });
  }

  // ---------- Leaves ----------

  async findLeaves(tenantId: string, userId?: string) {
    return this.prisma.leave.findMany({
      where: { tenantId, ...(userId ? { userId } : {}) },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createLeave(tenantId: string, dto: CreateLeaveDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId },
    });
    if (!user) throw new NotFoundException("User not found");
    const LEAVE_TYPES = ["ANNUAL", "SICK", "CASUAL", "MATERNITY", "PATERNITY", "UNPAID", "COMPENSATORY", "OTHER"];
    if (!LEAVE_TYPES.includes(dto.type))
      throw new BadRequestException("Invalid leave type");

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      throw new BadRequestException("Invalid leave dates");
    if (end < start)
      throw new BadRequestException("End date cannot be before start date");
    const days =
      dto.days ?? Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (!Number.isFinite(days) || days <= 0)
      throw new BadRequestException("Leave days must be positive");
    return this.prisma.leave.create({
      data: {
        tenantId,
        userId: dto.userId,
        type: dto.type as any,
        startDate: start,
        endDate: end,
        days,
        reason: dto.reason,
      },
    });
  }

  async updateLeaveStatus(
    tenantId: string,
    id: string,
    body: { status: string; rejectionReason?: string },
    userId?: string,
  ) {
    const leave = await this.prisma.leave.findFirst({
      where: { id, tenantId },
    });
    if (!leave) throw new NotFoundException("Leave not found");
    if (!["APPROVED", "REJECTED", "CANCELLED"].includes(body.status))
      throw new BadRequestException("Invalid leave status");
    if (leave.status !== "PENDING" && leave.status !== body.status) {
      if (leave.status === "APPROVED" || leave.status === "REJECTED")
        throw new BadRequestException(
          `Leave already ${leave.status.toLowerCase()}`,
        );
    }

    const data: any = { status: body.status };
    if (body.status === "APPROVED") {
      data.approvedBy = userId;
      data.approvedAt = new Date();
    }
    if (body.status === "REJECTED") data.rejectionReason = body.rejectionReason;

    return this.prisma.leave.update({ where: { id }, data });
  }

  // ---------- Staff ----------

  async listStaff(
    tenantId: string,
    query: { search?: string; departmentId?: string; active?: string; page?: number; limit?: number },
  ) {
    const { search, departmentId, page = 1, limit = 50 } = query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);
    const where: any = { tenantId };
    if (departmentId) where.departmentId = departmentId;
    if (search)
      where.user = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };

    const [rows, total] = await Promise.all([
      this.prisma.staffProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              status: true,
            },
          },
          department: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.staffProfile.count({ where }),
    ]);

    const data = rows.map((s) => ({
      ...s,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      email: s.user.email,
      role: s.user.role,
      isActive: s.user.status !== "INACTIVE" && s.employmentStatus !== "TERMINATED",
    }));

    return { data, total, page: pageNum, limit: limitNum };
  }

  async createStaff(tenantId: string, dto: CreateStaffDto) {
    if (!dto.email || !String(dto.email).trim())
      throw new BadRequestException("Email is required");
    if (!dto.firstName || !String(dto.firstName).trim())
      throw new BadRequestException("First name is required");
    if (!dto.role) throw new BadRequestException("Role is required");
    const validRoles = Object.values(UserRole) as string[];
    if (!validRoles.includes(dto.role))
      throw new BadRequestException("Invalid role provided");

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId },
        select: { id: true },
      });
      if (!department)
        throw new BadRequestException("Invalid department for this tenant");
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) throw new ConflictException("Email already in use");

    const tempPassword = crypto.randomBytes(9).toString("base64url");

    const passwordHash = await bcrypt.hash(dto.password || tempPassword, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName || "",
        role: dto.role,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
      },
    });

    const staff = await this.prisma.staffProfile.create({
      data: {
        tenantId,
        userId: user.id,
        departmentId: dto.departmentId,
        employeeCode: dto.employeeCode,
        designation: dto.designation,
        employmentStatus: "ACTIVE",
      },
    });

      return {
        ...(await this.prisma.staffProfile.findUnique({
          where: { id: staff.id },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                status: true,
              },
            },
            department: { select: { id: true, name: true } },
          },
        })),
        tempPassword: dto.password ? undefined : tempPassword,
      };
    }
  }
