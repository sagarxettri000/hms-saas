import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { MailService } from "../auth/mail.service";

const MAX_LIMIT = 100;

export interface CreateDoctorDto {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone?: string;
  departmentId?: string;
  gender?: string;
  specialization?: string;
  qualification?: string;
  licenseNumber?: string;
  consultationFee?: number;
  experienceYears?: number;
  bio?: string;
  password?: string;
}

export interface UpdateDoctorDto extends Partial<CreateDoctorDto> {}

export interface CreateScheduleDto {
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration?: number;
  breakStart?: string;
  breakEnd?: string;
}

export interface CreateSlotDto {
  scheduleId: string;
  date: Date;
  startTime: string;
  endTime: string;
}

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async create(tenantId: string, dto: CreateDoctorDto) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    if (!dto.email || !String(dto.email).trim())
      throw new BadRequestException("Email is required");
    if (!dto.firstName || !String(dto.firstName).trim())
      throw new BadRequestException("First name is required");
    if (!dto.lastName || !String(dto.lastName).trim())
      throw new BadRequestException("Last name is required");

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

    // Onboarding: the admin either supplies a password to share directly, or we
    // email the doctor a set-your-password invitation link. We still hash an
    // unguessable placeholder credential so login never sees a null hash before
    // the invite is accepted; resetPassword() replaces it when the doctor
    // chooses their real password.
    const suppliedPassword = dto.password ? String(dto.password) : undefined;
    const password = suppliedPassword || this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: "DOCTOR",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
      },
    });

    const doctor = await this.prisma.doctorProfile.create({
      data: {
        tenantId,
        userId: user.id,
        departmentId: dto.departmentId,
        gender: dto.gender,
        specialization: dto.specialization,
        qualification: dto.qualification,
        licenseNumber: dto.licenseNumber,
        consultationFee: dto.consultationFee || 0,
        experienceYears: dto.experienceYears,
        bio: dto.bio,
      },
    });

    const doctorRecord = await this.prisma.doctorProfile.findUnique({
      where: { id: doctor.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
            phone: true,
          },
        },
        department: true,
      },
    });

    // Invite the doctor to set their own password (only when the admin did not
    // supply one). If the email cannot be delivered (SMTP unconfigured or a
    // send failure), fall back to returning the temporary password so the
    // creating admin can share it — onboarding should never dead-end.
    let temporaryPassword: string | undefined;
    let invitationSent = false;
    if (!suppliedPassword) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const fullName = [dto.firstName, dto.middleName, dto.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const setPasswordUrl = `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;
      const sent = await this.mailService.send({
        to: user.email,
        subject: `${fullName}, set your Swasthya HMS password`,
        text: `Welcome to Swasthya HMS. An account has been created for you. Open this link to set your password (valid for 24 hours):\n\n${setPasswordUrl}\n\nIf you were not expecting this invitation, you can ignore this email.`,
        html: `<p>Welcome to Swasthya HMS. An account has been created for you. Open this link to set your password (valid for 24 hours):</p><p><a href="${setPasswordUrl}">${setPasswordUrl}</a></p><p>If you were not expecting this invitation, you can ignore this email.</p>`,
      });
      if (sent) {
        invitationSent = true;
      } else {
        temporaryPassword = password;
      }
    }

    if (invitationSent) return { ...doctorRecord, invitationSent: true };
    if (temporaryPassword) return { ...doctorRecord, temporaryPassword };
    return doctorRecord;
  }

  async findAll(
    tenantId: string,
    params: {
      departmentId?: string;
      search?: string;
      page?: number;
      limit?: number;
      active?: boolean;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { tenantId, isActive: params.active !== false };
    if (params.departmentId) where.departmentId = params.departmentId;

    if (params.search) {
      where.OR = [
        {
          user: { firstName: { contains: params.search, mode: "insensitive" } },
        },
        {
          user: { lastName: { contains: params.search, mode: "insensitive" } },
        },
        { specialization: { contains: params.search, mode: "insensitive" } },
        { user: { email: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.doctorProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              middleName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
            },
          },
          department: { select: { id: true, name: true } },
          schedules: { where: { isActive: true } },
        },
        orderBy: { user: { firstName: "asc" } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.doctorProfile.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(tenantId: string, id: string) {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id, tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
          },
        },
        department: true,
        schedules: { include: { slots: true } },
        shareRules: true,
      },
    });

    if (!doctor) throw new NotFoundException("Doctor not found");
    return doctor;
  }

  async update(tenantId: string, id: string, dto: UpdateDoctorDto) {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id, tenantId },
    });
    if (!doctor) throw new NotFoundException("Doctor not found");

    const {
      firstName,
      middleName,
      lastName,
      email,
      phone,
      password,
      ...profileData
    } = dto;

    const userData: any = {};
    if (firstName) userData.firstName = firstName;
    if (middleName) userData.middleName = middleName;
    if (lastName) userData.lastName = lastName;
    if (email) userData.email = email.toLowerCase();
    if (phone) userData.phone = phone;
    if (password) userData.passwordHash = await bcrypt.hash(password, 12);

    if (Object.keys(userData).length > 0) {
      await this.prisma.user.update({
        where: { id: doctor.userId },
        data: userData,
      });
    }

    return this.prisma.doctorProfile.update({
      where: { id },
      data: profileData,
    });
  }

  // Schedules
  async getSchedules(tenantId: string, doctorId?: string) {
    return this.prisma.doctorSchedule.findMany({
      where: { tenantId, doctorId },
      include: {
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ doctorId: "asc" }, { dayOfWeek: "asc" }],
    });
  }

  async createSchedule(tenantId: string, dto: CreateScheduleDto) {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: dto.doctorId, tenantId },
    });
    if (!doctor) throw new NotFoundException("Doctor not found");

    const existing = await this.prisma.doctorSchedule.findFirst({
      where: {
        doctorId: dto.doctorId,
        dayOfWeek: dto.dayOfWeek,
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        "Schedule already exists for this doctor on this day",
      );
    }

    return this.prisma.doctorSchedule.create({
      data: {
        tenantId,
        doctorId: dto.doctorId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotDuration: dto.slotDuration || 15,
        breakStart: dto.breakStart,
        breakEnd: dto.breakEnd,
      },
    });
  }

  async updateSchedule(
    tenantId: string,
    scheduleId: string,
    dto: Partial<CreateScheduleDto>,
  ) {
    const schedule = await this.prisma.doctorSchedule.findFirst({
      where: { id: scheduleId, tenantId },
    });
    if (!schedule) throw new NotFoundException("Schedule not found");

    const { tenantId: _t, doctorId: _d, ...fields } = dto as any;
    return this.prisma.doctorSchedule.update({
      where: { id: scheduleId },
      data: fields,
    });
  }

  async getAvailability(tenantId: string, doctorId: string, date: Date) {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    const dayOfWeek = date.getDay();

    const schedule = await this.prisma.doctorSchedule.findFirst({
      where: {
        doctorId,
        tenantId,
        dayOfWeek,
        isActive: true,
      },
    });

    if (!schedule) return { available: false, slots: [], schedule: null };

    // Check for leave
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorId },
    });
    if (!doctor) return { available: false, slots: [], schedule };

    const onLeave = await this.prisma.leave.findFirst({
      where: {
        userId: doctor.userId,
        status: "APPROVED",
        startDate: { lte: dateEnd },
        endDate: { gte: dateStart },
      },
    });

    if (onLeave) {
      return {
        available: false,
        reason: "Doctor on leave",
        slots: [],
        schedule,
      };
    }

    // Generate slots from schedule
    const slots = await this.generateSlots(tenantId, schedule, dateStart);

    // Get booked appointments
    const booked = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        doctorId,
        appointmentDate: { gte: dateStart, lte: dateEnd },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      select: { startTime: true, endTime: true },
    });

    const bookedTimes = new Set(
      booked.flatMap((b) => {
        const times: string[] = [];
        let current = b.startTime;
        while (current < b.endTime) {
          times.push(current);
          current = this.addMinutes(current, schedule.slotDuration || 15);
        }
        return times;
      }),
    );

    const availableSlots = slots.filter(
      (slot) => !bookedTimes.has(slot.startTime),
    );

    return {
      available: true,
      slots: availableSlots,
      schedule,
      totalSlots: slots.length,
      availableCount: availableSlots.length,
    };
  }

  async getDoctorDashboard(tenantId: string, doctorId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: doctorId, tenantId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!doctor) throw new NotFoundException("Doctor not found");

    const [
      todayAppointments,
      upcomingAppointments,
      pendingLabOrders,
      activeIPDPatients,
      revenue,
      followUps,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          tenantId,
          doctorId,
          appointmentDate: { gte: today, lt: tomorrow },
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          doctorId,
          appointmentDate: { gte: tomorrow },
          status: "CONFIRMED",
        },
        take: 10,
        orderBy: { appointmentDate: "asc" },
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
        },
      }),
      this.prisma.labOrder.count({
        where: {
          tenantId,
          doctorId,
          status: { in: ["ORDERED", "RECEIVED", "PROCESSING"] },
        },
      }),
      this.prisma.admission.count({
        where: { tenantId, admittingDoctorId: doctorId, status: "ADMITTED" },
      }),
      this.prisma.invoiceItem.aggregate({
        _sum: { lineTotal: true },
        where: {
          doctorId,
          invoice: { tenantId, status: { not: "CANCELLED" } },
        },
      }),
      this.prisma.followUp.count({
        where: {
          tenantId,
          doctors: { some: { doctorId } },
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      }),
    ]);

    return {
      doctor,
      stats: {
        todayAppointments,
        upcomingAppointments,
        pendingLabOrders,
        activeIPDPatients,
        revenue: revenue._sum.lineTotal?.toNumber() || 0,
        followUps,
      },
      upcomingAppointments,
    };
  }

  private async generateSlots(
    tenantId: string,
    schedule: any,
    date: Date,
  ): Promise<Array<{ startTime: string; endTime: string }>> {
    const slots: Array<{ startTime: string; endTime: string }> = [];
    const duration = schedule.slotDuration || 15;
    let current = schedule.startTime;
    const breakStart = schedule.breakStart;
    const breakEnd = schedule.breakEnd;

    while (current < schedule.endTime) {
      const inBreak =
        breakStart && breakEnd && current >= breakStart && current < breakEnd;
      if (!inBreak) {
        const end = this.addMinutes(current, duration);
        if (end <= schedule.endTime) {
          slots.push({ startTime: current, endTime: end });
        }
      }
      current = this.addMinutes(current, duration);
    }

    return slots;
  }

  private addMinutes(time: string, minutes: number): string {
    const [hours, mins] = time.split(":").map(Number);
    const total = hours * 60 + mins + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  private generateTemporaryPassword(): string {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
    const buf = crypto.randomBytes(16);
    let password = "";
    for (let i = 0; i < 16; i++) {
      password += chars[buf[i] % chars.length];
    }
    return password;
  }
}
