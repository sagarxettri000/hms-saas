import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

export interface CreateAppointmentDto {
  patientId?: string;
  // Auto-register fields: used when no patientId is provided
  patientFirstName?: string;
  patientMiddleName?: string;
  patientLastName?: string;
  patientMobile?: string;
  patientPhone?: string;
  patientEmail?: string;
  patientGender?: string;
  patientDateOfBirth?: Date;
  patientAge?: number;
  patientNationalId?: string;
  patientBloodGroup?: string;
  doctorId: string;
  departmentId?: string;
  appointmentDate: Date;
  startTime: string;
  endTime?: string;
  type?: string;
  reason?: string;
  notes?: string;
  isWalkIn?: boolean;
  source?: string;
  scheduleId?: string;
}

export interface UpdateAppointmentDto extends Partial<CreateAppointmentDto> {
  status?: string;
  checkInAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
}

export interface AppointmentSearchParams {
  patientId?: string;
  doctorId?: string;
  departmentId?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  type?: string;
  query?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(tenantId: string, dto: CreateAppointmentDto, userId?: string) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    const patientId = await this.resolvePatientId(tenantId, dto, userId);

    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: dto.doctorId, tenantId },
    });
    if (!doctor) throw new NotFoundException("Doctor not found");

    const date = this.normalizeDate(dto.appointmentDate);
    const endTime = dto.endTime || this.calculateEndTime(dto.startTime, doctor);
    if (!dto.startTime) throw new BadRequestException("Start time is required");
    if (endTime <= dto.startTime)
      throw new BadRequestException("End time must be after start time");

    // Check for double booking (standard interval overlap)
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        doctorId: dto.doctorId,
        appointmentDate: date,
        status: {
          in: ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_CONSULTATION"],
        },
        OR: [
          { startTime: { lt: endTime }, endTime: { gt: dto.startTime } },
          { startTime: { lte: dto.startTime }, endTime: { gte: dto.startTime } },
        ],
      },
    });

    if (conflict) {
      throw new ConflictException(
        "Doctor already has an appointment at this time",
      );
    }

    const tokenNumber = await this.generateToken(tenantId, dto.doctorId, date);

    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId,
        patientId,
        doctorId: dto.doctorId,
        doctorUserId: doctor.userId,
        departmentId: dto.departmentId || doctor.departmentId,
        scheduleId: dto.scheduleId,
        appointmentDate: date,
        startTime: dto.startTime,
        endTime,
        type: (dto.type as any) || "OPD",
        source: (dto.source as any) || "WALKIN",
        isWalkIn: dto.isWalkIn || false,
        reason: dto.reason,
        notes: dto.notes,
        status: dto.isWalkIn ? "CHECKED_IN" : "CONFIRMED",
        tokenNumber,
        createdBy: userId,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            mobile: true,
          },
        },
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        department: { select: { id: true, name: true } },
      },
    });

    // Mark slot as booked if schedule slot exists
    if (dto.scheduleId) {
      const schedule = await this.prisma.doctorSchedule.findFirst({
        where: { id: dto.scheduleId, tenantId },
        select: { id: true },
      });
      if (!schedule) throw new NotFoundException("Schedule not found");
      await this.prisma.availabilitySlot
        .updateMany({
          where: {
            scheduleId: dto.scheduleId,
            tenantId,
            date,
            startTime: dto.startTime,
            isBooked: false,
          },
          data: { isBooked: true, appointmentId: appointment.id },
        })
        .catch(() => {});
    }

    await this.logAudit(
      tenantId,
      userId,
      "CREATE",
      "Appointment",
      appointment.id,
    );

    this.notifications.create(tenantId, {
      userId: doctor.userId,
      title: "New Appointment Booked",
      body: `Patient ${appointment.patient?.firstName || ""} ${appointment.patient?.lastName || ""} has an appointment on ${date.toISOString().split("T")[0]} at ${dto.startTime}`,
      type: "APPOINTMENT_BOOKED",
      referenceType: "Appointment",
      referenceId: appointment.id,
    }).catch(() => {});

    return appointment;
  }

  async findAll(tenantId: string, params: AppointmentSearchParams) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { tenantId };

    if (params.patientId) where.patientId = params.patientId;
    if (params.doctorId) where.doctorId = params.doctorId;
    if (params.departmentId) where.departmentId = params.departmentId;
    if (params.status) {
      const statuses = params.status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (params.type) where.type = params.type;

    const query = params.query || params.search;
    if (query) {
      where.OR = [
        { patient: { firstName: { contains: query, mode: "insensitive" } } },
        { patient: { lastName: { contains: query, mode: "insensitive" } } },
        { patient: { mrn: { contains: query, mode: "insensitive" } } },
        { patient: { mobile: { contains: query } } },
      ];
    }

    if (params.date) {
      const date = new Date(params.date);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      where.appointmentDate = { gte: date, lt: next };
    } else if (params.dateFrom || params.dateTo) {
      where.appointmentDate = {};
      if (params.dateFrom)
        where.appointmentDate.gte = new Date(params.dateFrom);
      if (params.dateTo) where.appointmentDate.lte = new Date(params.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
              mobile: true,
              gender: true,
              dateOfBirth: true,
            },
          },
          doctor: {
            include: {
              user: { select: { firstName: true, lastName: true } },
              department: { select: { name: true } },
            },
          },
          department: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getToday(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        appointmentDate: { gte: today, lt: tomorrow },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            mobile: true,
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ startTime: "asc" }],
    });

    const summary = {
      total: appointments.length,
      confirmed: appointments.filter((a) => a.status === "CONFIRMED").length,
      checkedIn: appointments.filter((a) => a.status === "CHECKED_IN").length,
      waiting: appointments.filter((a) => a.status === "WAITING").length,
      inConsultation: appointments.filter((a) => a.status === "IN_CONSULTATION")
        .length,
      completed: appointments.filter((a) => a.status === "COMPLETED").length,
      cancelled: appointments.filter((a) => a.status === "CANCELLED").length,
      noShow: appointments.filter((a) => a.status === "NO_SHOW").length,
    };

    return { appointments, summary };
  }

  async getQueue(tenantId: string, departmentId?: string, doctorId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where: any = {
      tenantId,
      appointmentDate: { gte: today, lt: tomorrow },
      status: { in: ["CHECKED_IN", "WAITING", "IN_CONSULTATION", "CONFIRMED"] },
    };
    if (departmentId) where.departmentId = departmentId;
    if (doctorId) where.doctorId = doctorId;

    const queue = await this.prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            mobile: true,
          },
        },
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        department: { select: { name: true } },
      },
      orderBy: [{ tokenNumber: "asc" }],
    });

    const current = queue.find((a) => a.status === "IN_CONSULTATION") || null;
    const next =
      queue.find((a) => a.status === "WAITING" || a.status === "CHECKED_IN") ||
      null;

    return {
      queue,
      current,
      next,
      totalWaiting: queue.filter((a) =>
        ["WAITING", "CHECKED_IN"].includes(a.status),
      ).length,
    };
  }

  async findById(tenantId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            mobile: true,
            email: true,
            dateOfBirth: true,
            gender: true,
            bloodGroup: true,
            addressLine1: true,
            city: true,
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            department: { select: { name: true } },
          },
        },
        department: true,
        encounter: true,
      },
    });

    if (!appointment) throw new NotFoundException("Appointment not found");
    return appointment;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: string,
    userId?: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
    });
    if (!appointment) throw new NotFoundException("Appointment not found");

    const data: any = { status: status as any, updatedBy: userId };

    switch (status) {
      case "CHECKED_IN":
        data.checkInAt = new Date();
        break;
      case "COMPLETED":
        data.completedAt = new Date();
        break;
      case "CANCELLED":
        data.cancelledAt = new Date();
        break;
    }

    const result = await this.prisma.appointment.update({
      where: { id },
      data,
    });

    await this.logAudit(tenantId, userId, "UPDATE", "Appointment", id, {
      status,
    });

    if (status === "CHECKED_IN" && appointment.doctorUserId) {
      this.notifications.create(tenantId, {
        userId: appointment.doctorUserId,
        title: "Patient Checked In",
        body: `Patient has arrived for their appointment (Token #${appointment.tokenNumber})`,
        type: "APPOINTMENT_CHECKED_IN",
        referenceType: "Appointment",
        referenceId: id,
      }).catch(() => {});
    }

    return result;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAppointmentDto,
    userId?: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
    });
    if (!appointment) throw new NotFoundException("Appointment not found");

    const { status, ...rest } = dto;
    const { tenantId: _t, patientId: _p, doctorId: _doc, ...allowed } = rest as any;

    const result = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...allowed,
        status: status as any,
        updatedBy: userId,
      } as Prisma.AppointmentUncheckedUpdateInput,
    });

    await this.logAudit(tenantId, userId, "UPDATE", "Appointment", id, {
      status,
    });
    return result;
  }

  async reschedule(
    tenantId: string,
    id: string,
    newDate: Date,
    newStartTime: string,
    newEndTime?: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
    });
    if (!appointment) throw new NotFoundException("Appointment not found");

    // Check conflict (standard interval overlap)
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        doctorId: appointment.doctorId,
        appointmentDate: this.normalizeDate(newDate),
        id: { not: id },
        status: {
          in: ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_CONSULTATION"],
        },
        OR: [
          { startTime: { lt: newEndTime }, endTime: { gt: newStartTime } },
          {
            startTime: { lte: newStartTime },
            endTime: { gte: newStartTime },
          },
        ],
      },
    });

    if (conflict)
      throw new ConflictException(
        "Doctor already has an appointment at this time",
      );

    return this.prisma.appointment.update({
      where: { id },
      data: {
        appointmentDate: this.normalizeDate(newDate),
        startTime: newStartTime,
        endTime: newEndTime,
        status: "RESCHEDULED",
      },
    });
  }

  async cancel(tenantId: string, id: string, reason: string, userId?: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
    });
    if (!appointment) throw new NotFoundException("Appointment not found");

    const result = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    await this.logAudit(tenantId, userId, "UPDATE", "Appointment", id, {
      status: "CANCELLED",
      reason,
    });

    if (appointment.doctorUserId) {
      this.notifications.create(tenantId, {
        userId: appointment.doctorUserId,
        title: "Appointment Cancelled",
        body: `Appointment has been cancelled. Reason: ${reason || "N/A"}`,
        type: "APPOINTMENT_CANCELLED",
        referenceType: "Appointment",
        referenceId: id,
      }).catch(() => {});
    }

    return result;
  }

  async markNoShow(tenantId: string, id: string, userId?: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
    });
    if (!appointment) throw new NotFoundException("Appointment not found");

    return this.prisma.appointment.update({
      where: { id },
      data: { status: "NO_SHOW" },
    });
  }

  private calculateEndTime(startTime: string, doctor: any): string {
    const slotDuration = doctor.scheduleSlotDuration || 15;
    const [hours, minutes] = startTime.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes + slotDuration;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
  }

  private async generateToken(
    tenantId: string,
    doctorId: string,
    date: Date,
  ): Promise<string> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await this.prisma.appointment.count({
      where: {
        tenantId,
        doctorId,
        appointmentDate: { gte: startOfDay, lte: endOfDay },
      },
    });

    return String(count + 1).padStart(2, "0");
  }

  private normalizeDate(input: Date | string): Date {
    if (input instanceof Date) return input;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(input);
  }

  private async resolvePatientId(
    tenantId: string,
    dto: CreateAppointmentDto,
    userId?: string,
  ): Promise<string> {
    if (dto.patientId) {
      const existing = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException("Patient not found");
      return existing.id;
    }

    const firstName = dto.patientFirstName?.trim();
    const lastName = dto.patientLastName?.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException(
        "Select a patient or provide first & last name to auto-register",
      );
    }

    const mobile = dto.patientMobile?.trim();
    const email = dto.patientEmail?.trim().toLowerCase();
    if (mobile || email) {
      const match = await this.prisma.patient.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: [...(mobile ? [{ mobile }] : []), ...(email ? [{ email }] : [])],
        },
        select: { id: true },
      });
      if (match) return match.id;
    }

    const mrn = await this.generateMrn(tenantId);
    const uid = this.generateUid();
    const created = await this.prisma.patient.create({
      data: {
        tenantId,
        mrn,
        uid,
        firstName,
        middleName: dto.patientMiddleName?.trim() || undefined,
        lastName,
        mobile,
        phone: dto.patientPhone?.trim() || undefined,
        email,
        gender: dto.patientGender as any,
        dateOfBirth: dto.patientDateOfBirth
          ? this.normalizeDate(dto.patientDateOfBirth)
          : undefined,
        age: dto.patientAge,
        nationalId: dto.patientNationalId?.trim() || undefined,
        bloodGroup: dto.patientBloodGroup as any,
        patientType: "GENERAL",
        createdBy: userId,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async generateMrn(tenantId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");

    const latest = await this.prisma.patient.findFirst({
      where: {
        tenantId,
        mrn: { startsWith: `NBM-${year}${month}` },
      },
      orderBy: { createdAt: "desc" },
      select: { mrn: true },
    });

    let sequence = 1;
    if (latest) {
      const parts = latest.mrn.split("-");
      sequence = parseInt(parts[parts.length - 1], 10) + 1;
    }

    return `NBM-${year}${month}-${String(sequence).padStart(4, "0")}`;
  }

  private generateUid(): string {
    return `UID-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
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
