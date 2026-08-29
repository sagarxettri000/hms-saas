import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateFollowUpDto {
  patientId: string;
  doctorIds?: string[];
  assignedDoctorId?: string;
  encounterId?: string;
  notes?: string;
}

export interface UpdateFollowUpDto {
  doctorIds?: string[];
  status?: string;
  notes?: string;
}

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyDoctors(tenantId: string, doctorIds: string[]) {
    if (!doctorIds.length) return [];
    const doctors = await this.prisma.doctorProfile.findMany({
      where: { tenantId, id: { in: doctorIds }, isActive: true },
      select: { id: true },
    });
    if (doctors.length !== new Set(doctorIds).size) {
      throw new BadRequestException(
        "One or more doctors are invalid or inactive",
      );
    }
    return doctors;
  }

  async listActiveDoctors(tenantId: string) {
    return this.prisma.doctorProfile.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        specialization: true,
        departmentId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
          },
        },
        department: { select: { id: true, name: true } },
      },
      orderBy: { user: { firstName: "asc" } },
    });
  }

  async create(tenantId: string, dto: CreateFollowUpDto, userId: string) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    if (!dto.patientId) {
      throw new BadRequestException("Patient is required");
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId },
      select: { id: true },
    });
    if (!patient) throw new BadRequestException("Patient not found");

    const doctorIds = [
      ...new Set(
        [
          ...(dto.doctorIds || []),
          ...(dto.assignedDoctorId ? [dto.assignedDoctorId] : []),
        ].filter(Boolean),
      ),
    ];
    const doctors = await this.verifyDoctors(tenantId, doctorIds);

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, tenantId },
        select: { id: true },
      });
      if (!encounter) throw new BadRequestException("Encounter not found");
    }

    const followUp = await this.prisma.followUp.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId: dto.encounterId || null,
        assignedDoctorId:
          dto.assignedDoctorId || doctors[0]?.id || null,
        notes: dto.notes || null,
        createdBy: userId,
        updatedBy: userId,
        doctors: {
          create: doctors.map((d, i) => ({
            tenantId,
            doctorId: d.id,
            isPrimary: i === 0,
          })),
        },
      },
    });

    return this.findById(tenantId, followUp.id);
  }

  async findAll(
    tenantId: string,
    params: {
      patientId?: string;
      doctorId?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 50;

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;
    if (params.doctorId) {
      where.doctors = { some: { doctorId: params.doctorId } };
    }

    const [data, total] = await Promise.all([
      this.prisma.followUp.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              mrn: true,
              firstName: true,
              middleName: true,
              lastName: true,
              age: true,
              gender: true,
            },
          },
          doctors: {
            include: {
              doctor: {
                select: {
                  id: true,
                  specialization: true,
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      middleName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
          assignedDoctor: {
            select: {
              id: true,
              specialization: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  middleName: true,
                  lastName: true,
                },
              },
            },
          },
          encounter: {
            select: { id: true, type: true, diagnosis: true, doctorId: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.followUp.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(tenantId: string, id: string) {
    const followUp = await this.prisma.followUp.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            mrn: true,
            firstName: true,
            middleName: true,
            lastName: true,
            age: true,
            gender: true,
          },
        },
        doctors: {
          include: {
            doctor: {
              select: {
                id: true,
                specialization: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    middleName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        assignedDoctor: {
          select: {
            id: true,
            specialization: true,
            user: {
              select: {
                id: true,
                firstName: true,
                middleName: true,
                lastName: true,
              },
            },
          },
        },
        encounter: {
          select: { id: true, type: true, diagnosis: true, doctorId: true },
        },
      },
    });
    if (!followUp) throw new NotFoundException("Follow-up not found");
    return followUp;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateFollowUpDto,
    userId: string,
  ) {
    const existing = await this.prisma.followUp.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Follow-up not found");

    if (dto.doctorIds) {
      const doctors = await this.verifyDoctors(tenantId, dto.doctorIds);
      await this.prisma.followUpDoctor.deleteMany({
        where: { followUpId: id },
      });
      await this.prisma.followUpDoctor.createMany({
        data: doctors.map((d, i) => ({
          tenantId,
          followUpId: id,
          doctorId: d.id,
          isPrimary: i === 0,
        })),
      });
      await this.prisma.followUp.update({
        where: { id },
        data: { assignedDoctorId: doctors[0]?.id || null, updatedBy: userId },
      });
    }

    const data: any = { updatedBy: userId };
    if (dto.status) {
      const allowed = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException("Invalid follow-up status");
      }
      data.status = dto.status;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;

    await this.prisma.followUp.update({ where: { id }, data });
    return this.findById(tenantId, id);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: string,
    userId: string,
  ) {
    const allowed = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
    if (!allowed.includes(status)) {
      throw new BadRequestException("Invalid follow-up status");
    }
    const existing = await this.prisma.followUp.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Follow-up not found");
    await this.prisma.followUp.update({
      where: { id },
      data: { status: status as any, updatedBy: userId },
    });
    return this.findById(tenantId, id);
  }
}
