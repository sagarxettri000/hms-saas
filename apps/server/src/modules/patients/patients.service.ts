import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreatePatientDto {
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth?: Date;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  nationality?: string;
  religion?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyContactMobile?: string;
  guardianName?: string;
  guardianRelationship?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianIdType?: string;
  guardianIdNumber?: string;
  occupation?: string;
  education?: string;
  maritalStatus?: string;
  nationalId?: string;
  passportNumber?: string;
  patientType?: string;
  isForeign?: boolean;
  isStaff?: boolean;
  allergies?: Array<{
    allergen: string;
    reaction?: string;
    severity?: string;
    notes?: string;
  }>;
  chronicConditions?: Array<{
    name: string;
    icd10Code?: string;
    notes?: string;
  }>;
  consentGiven?: boolean;
  consentNotes?: string;
}

export interface UpdatePatientDto extends Partial<CreatePatientDto> {}

export interface PatientSearchParams {
  query?: string;
  search?: string;
  mrn?: string;
  uid?: string;
  name?: string;
  mobile?: string;
  dateOfBirth?: Date;
  patientType?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreatePatientDto, userId?: string) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    const dateOfBirth = dto.dateOfBirth
      ? this.normalizeDate(dto.dateOfBirth)
      : undefined;

    // Duplicate detection: check by mobile + name or national ID
    const duplicates = await this.findDuplicates(tenantId, {
      ...dto,
      dateOfBirth,
    });
    if (duplicates.length > 0) {
      return {
        duplicateDetected: true,
        duplicates: duplicates.map((d) => ({
          id: d.id,
          mrn: d.mrn,
          firstName: d.firstName,
          lastName: d.lastName,
          mobile: d.mobile,
        })),
        message: "Potential duplicate patient found",
      };
    }

    const mrn = await this.generateMrn(tenantId);
    const uid = this.generateUid();

    const data: any = {
      tenantId,
      mrn,
      uid,
      firstName: dto.firstName,
      middleName: dto.middleName,
      lastName: dto.lastName,
      dateOfBirth: dateOfBirth,
      age: dto.age,
      gender: dto.gender as any,
      bloodGroup: dto.bloodGroup as any,
      nationality: dto.nationality || "Nepali",
      religion: dto.religion,
      phone: dto.phone,
      mobile: dto.mobile,
      email: dto.email?.toLowerCase(),
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2,
      city: dto.city,
      district: dto.district,
      province: dto.province,
      country: dto.country || "Nepal",
      postalCode: dto.postalCode,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactRelationship: dto.emergencyContactRelationship,
      emergencyContactPhone: dto.emergencyContactPhone,
      emergencyContactMobile: dto.emergencyContactMobile,
      guardianName: dto.guardianName,
      guardianRelationship: dto.guardianRelationship,
      guardianPhone: dto.guardianPhone,
      guardianEmail: dto.guardianEmail,
      guardianIdType: dto.guardianIdType,
      guardianIdNumber: dto.guardianIdNumber,
      occupation: dto.occupation,
      education: dto.education,
      maritalStatus: dto.maritalStatus as any,
      nationalId: dto.nationalId,
      passportNumber: dto.passportNumber,
      patientType: (dto.patientType as any) || "GENERAL",
      isForeign: dto.isForeign || false,
      isStaff: dto.isStaff || false,
      consentGiven: dto.consentGiven || false,
      consentDate: dto.consentGiven ? new Date() : undefined,
      consentNotes: dto.consentNotes,
      createdBy: userId,
    };

    const patient = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patient.create({ data });

      if (dto.allergies && dto.allergies.length > 0) {
        for (const allergy of dto.allergies) {
          await tx.patientAllergy.create({
            data: {
              tenantId,
              patientId: created.id,
              allergen: allergy.allergen,
              reaction: allergy.reaction,
              severity: allergy.severity,
              notes: allergy.notes,
            },
          });
        }
      }

      if (dto.chronicConditions && dto.chronicConditions.length > 0) {
        for (const condition of dto.chronicConditions) {
          await tx.patientCondition.create({
            data: {
              tenantId,
              patientId: created.id,
              name: condition.name,
              icd10Code: condition.icd10Code,
              notes: condition.notes,
            },
          });
        }
      }

      return created;
    });

    await this.logAudit(tenantId, userId, "CREATE", "Patient", patient.id);

    return patient;
  }

  async findDuplicates(tenantId: string, dto: Partial<CreatePatientDto>) {
    const orConditions: any[] = [];

    if (dto.mobile) {
      orConditions.push({ mobile: dto.mobile });
    }
    if (dto.nationalId) {
      orConditions.push({ nationalId: dto.nationalId });
    }
    if (dto.passportNumber) {
      orConditions.push({ passportNumber: dto.passportNumber });
    }
    if (dto.firstName && dto.lastName && dto.dateOfBirth) {
      orConditions.push({
        AND: [
          { firstName: { equals: dto.firstName, mode: "insensitive" } },
          { lastName: { equals: dto.lastName, mode: "insensitive" } },
          { dateOfBirth: this.normalizeDate(dto.dateOfBirth) },
        ],
      });
    }
    if (dto.email) {
      orConditions.push({ email: dto.email.toLowerCase() });
    }

    if (orConditions.length === 0) return [];

    return this.prisma.patient.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: orConditions,
      },
      take: 10,
    });
  }

  async findAll(tenantId: string, params: PatientSearchParams) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { tenantId, deletedAt: null };

    if (params.patientType) where.patientType = params.patientType;
    if (params.dateOfBirth)
      where.dateOfBirth = this.normalizeDate(params.dateOfBirth);
    if (params.mrn) where.mrn = { contains: params.mrn, mode: "insensitive" };

    const query = params.query || params.search || params.name || params.mobile;
    if (query) {
      where.OR = [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { middleName: { contains: query, mode: "insensitive" } },
        { mrn: { contains: query, mode: "insensitive" } },
        { uid: { contains: query, mode: "insensitive" } },
        { mobile: { contains: query } },
        { phone: { contains: query } },
        { email: { contains: query, mode: "insensitive" } },
        { nationalId: { contains: query } },
        { passportNumber: { contains: query } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        include: {
          _count: {
            select: {
              appointments: true,
              encounters: true,
              admissions: true,
              invoices: true,
            },
          },
        },
        orderBy: params.sortBy
          ? { [params.sortBy]: params.sortOrder || "desc" }
          : { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  maskPatientPhi(role: string | undefined, data: any[]) {
    if (!data || data.length === 0) return data;
    const fullAccessRoles = new Set([
      "PLATFORM_SUPER_ADMIN",
      "HOSPITAL_ADMIN",
      "HOSPITAL_OWNER",
      "DEPARTMENT_HEAD",
      "FINANCE_MANAGER",
      "AUDITOR",
      "QUALITY_MANAGER",
      "IT_ADMIN",
      "DOCTOR",
      "NURSE",
      "WARD_INCHARGE",
      "RECEPTION_SUPERVISOR",
    ]);
    if (role && fullAccessRoles.has(role)) return data;
    const maskedFields = [
      "nationalId",
      "passportNumber",
      "email",
      "guardianName",
      "guardianRelationship",
      "guardianPhone",
      "guardianEmail",
      "guardianIdType",
      "guardianIdNumber",
      "emergencyContactName",
      "emergencyContactRelationship",
      "emergencyContactPhone",
      "emergencyContactMobile",
      "addressLine1",
      "addressLine2",
      "postalCode",
    ];
    return data.map((row) => {
      const copy = { ...row };
      for (const field of maskedFields) {
        if (copy[field] !== undefined && copy[field] !== null) {
          copy[field] = "••••••";
        }
      }
      return copy;
    });
  }

  async findById(tenantId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        allergies: true,
        conditions: true,
        documents: true,
        appointments: {
          take: 5,
          orderBy: { appointmentDate: "desc" },
          include: {
            doctor: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        encounters: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            doctor: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        admissions: { orderBy: { admissionDate: "desc" } },
        invoices: { orderBy: { issuedDate: "desc" } },
        insurancePolicies: { include: { provider: true } },
        memberships: true,
      },
    });

    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }

  async findByMrn(tenantId: string, mrn: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { tenantId, mrn, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePatientDto,
    userId?: string,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const { allergies, chronicConditions, ...updateData } = dto as any;
    if (updateData.dateOfBirth)
      updateData.dateOfBirth = this.normalizeDate(updateData.dateOfBirth);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.patient.update({
        where: { id },
        data: {
          ...updateData,
          email: updateData.email?.toLowerCase(),
          updatedBy: userId,
        },
      });

      if (allergies) {
        await tx.patientAllergy.deleteMany({ where: { patientId: id } });
        for (const allergy of allergies) {
          await tx.patientAllergy.create({
            data: {
              tenantId,
              patientId: id,
              allergen: allergy.allergen,
              reaction: allergy.reaction,
              severity: allergy.severity,
              notes: allergy.notes,
            },
          });
        }
      }

      if (chronicConditions) {
        await tx.patientCondition.deleteMany({ where: { patientId: id } });
        for (const condition of chronicConditions) {
          await tx.patientCondition.create({
            data: {
              tenantId,
              patientId: id,
              name: condition.name,
              icd10Code: condition.icd10Code,
              notes: condition.notes,
            },
          });
        }
      }

      return result;
    });

    await this.logAudit(tenantId, userId, "UPDATE", "Patient", id, {
      changedFields: Object.keys(updateData),
    });

    return updated;
  }

  async remove(tenantId: string, id: string, userId?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const result = await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });

    await this.logAudit(tenantId, userId, "DELETE", "Patient", id);
    return result;
  }

  async getTimeline(tenantId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const [
      appointments,
      encounters,
      admissions,
      invoices,
      labOrders,
      radiologyOrders,
      prescriptions,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { tenantId, patientId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.encounter.findMany({
        where: { tenantId, patientId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.admission.findMany({
        where: { tenantId, patientId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, patientId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.labOrder.findMany({
        where: { tenantId, patientId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.radiologyOrder.findMany({
        where: { tenantId, patientId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.prescription.findMany({
        where: { tenantId, patientId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const timeline: any[] = [];

    appointments.forEach((a) =>
      timeline.push({
        type: "APPOINTMENT",
        date: a.appointmentDate,
        status: a.status,
        data: a,
      }),
    );
    encounters.forEach((e) =>
      timeline.push({
        type: "ENCOUNTER",
        date: e.createdAt,
        status: e.status,
        data: e,
      }),
    );
    admissions.forEach((a) =>
      timeline.push({
        type: "ADMISSION",
        date: a.admissionDate,
        status: a.status,
        data: a,
      }),
    );
    invoices.forEach((i) =>
      timeline.push({
        type: "INVOICE",
        date: i.issuedDate,
        status: i.status,
        data: i,
      }),
    );
    labOrders.forEach((l) =>
      timeline.push({
        type: "LAB_ORDER",
        date: l.createdAt,
        status: l.status,
        data: l,
      }),
    );
    radiologyOrders.forEach((r) =>
      timeline.push({
        type: "RADIOLOGY_ORDER",
        date: r.createdAt,
        status: r.status,
        data: r,
      }),
    );
    prescriptions.forEach((p) =>
      timeline.push({
        type: "PRESCRIPTION",
        date: p.createdAt,
        status: p.status,
        data: p,
      }),
    );

    timeline.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return timeline;
  }

  async importPatients(
    tenantId: string,
    rows: CreatePatientDto[],
    userId: string,
  ): Promise<{ imported: number; errors: { row: number; error: string }[] }> {
    if (!rows || rows.length === 0) {
      throw new BadRequestException("No rows to import");
    }
    const errors: { row: number; error: string }[] = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const dto = rows[i];
      try {
        if (!dto.firstName || !dto.lastName) {
          errors.push({ row: i + 1, error: "firstName and lastName are required" });
          continue;
        }

        const dateOfBirth = dto.dateOfBirth
          ? this.normalizeDate(dto.dateOfBirth)
          : undefined;

        const mrn = await this.generateMrn(tenantId);
        const uid = this.generateUid();

        await this.prisma.patient.create({
          data: {
            tenantId,
            mrn,
            uid,
            firstName: dto.firstName,
            middleName: dto.middleName,
            lastName: dto.lastName,
            dateOfBirth,
            age: dto.age,
            gender: dto.gender as any,
            bloodGroup: dto.bloodGroup as any,
            nationality: dto.nationality || "Nepali",
            religion: dto.religion,
            phone: dto.phone,
            mobile: dto.mobile,
            email: dto.email?.toLowerCase(),
            addressLine1: dto.addressLine1,
            addressLine2: dto.addressLine2,
            city: dto.city,
            district: dto.district,
            province: dto.province,
            country: dto.country || "Nepal",
            postalCode: dto.postalCode,
            emergencyContactName: dto.emergencyContactName,
            emergencyContactRelationship: dto.emergencyContactRelationship,
            emergencyContactPhone: dto.emergencyContactPhone,
            emergencyContactMobile: dto.emergencyContactMobile,
            guardianName: dto.guardianName,
            guardianRelationship: dto.guardianRelationship,
            guardianPhone: dto.guardianPhone,
            guardianEmail: dto.guardianEmail,
            guardianIdType: dto.guardianIdType,
            guardianIdNumber: dto.guardianIdNumber,
            occupation: dto.occupation,
            education: dto.education,
            maritalStatus: dto.maritalStatus as any,
            nationalId: dto.nationalId,
            passportNumber: dto.passportNumber,
            patientType: (dto.patientType as any) || "GENERAL",
            isForeign: dto.isForeign || false,
            isStaff: dto.isStaff || false,
            consentGiven: dto.consentGiven || false,
            status: "ACTIVE",
            createdBy: userId,
          },
        });
        imported++;
      } catch (e: any) {
        errors.push({ row: i + 1, error: e.message || "Unknown error" });
      }
    }

    return { imported, errors };
  }

  private async generateMrn(tenantId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");

    // Find latest MRN for this tenant this month
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

  private normalizeDate(input: Date | string): Date {
    if (input instanceof Date) return input;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(input);
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
