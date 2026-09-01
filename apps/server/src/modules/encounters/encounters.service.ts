import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

export interface CreateEncounterDto {
  patientId: string;
  appointmentId?: string;
  doctorId?: string;
  departmentId?: string;
  type?: string;
  symptoms?: string;
  history?: string;
  examination?: string;
  diagnosis?: string;
  icd10Code?: string;
  clinicalNotes?: string;
  treatment?: string;
  advice?: string;
  chiefComplaint?: string;
  followUpDate?: Date;
  followUpNotes?: string;
  vitals?: {
    temperature?: number;
    pulse?: number;
    respiratoryRate?: number;
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    oxygenSaturation?: number;
    height?: number;
    weight?: number;
    bmi?: number;
    painScore?: number;
    bloodGlucose?: number;
  };
}

export interface UpdateEncounterDto extends Partial<CreateEncounterDto> {}

export interface CreateVitalDto {
  patientId: string;
  encounterId?: string;
  admissionId?: string;
  temperature?: number;
  pulse?: number;
  respiratoryRate?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  oxygenSaturation?: number;
  height?: number;
  weight?: number;
  painScore?: number;
  bloodGlucose?: number;
  notes?: string;
}

export interface CreatePrescriptionDto {
  patientId: string;
  encounterId?: string;
  items: Array<{
    medicineName: string;
    genericName?: string;
    brandName?: string;
    medicineId?: string;
    dosage?: string;
    frequency?: string;
    route?: string;
    duration?: string;
    quantity?: number;
    instructions?: string;
  }>;
  advice?: string;
  followUp?: string;
  status?: string;
  overrideAllergyWarning?: boolean;
}

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(tenantId: string, dto: CreateEncounterDto, userId?: string) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    // If appointment provided, get doctor from appointment
    let doctorId = dto.doctorId;
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, tenantId },
      });
      if (!appointment)
        throw new NotFoundException("Appointment not found");
      if (appointment.patientId !== dto.patientId)
        throw new BadRequestException(
          "Appointment does not belong to this patient",
        );
      const existing = await this.prisma.encounter.findFirst({
        where: { appointmentId: dto.appointmentId, tenantId },
      });
      if (existing)
        throw new ConflictException(
          "An encounter already exists for this appointment",
        );
      if (!doctorId) doctorId = appointment.doctorId;
    }

    const encounter = await this.prisma.$transaction(async (tx) => {
      const created = await tx.encounter.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          appointmentId: dto.appointmentId,
          doctorId,
          doctorUserId: doctorId
            ? (await tx.doctorProfile.findUnique({ where: { id: doctorId } }))
                ?.userId
            : userId,
          departmentId: dto.departmentId,
          type: (dto.type as any) || "OPD",
          symptoms: dto.symptoms,
          history: dto.history,
          examination: dto.examination,
          diagnosis: dto.diagnosis,
          icd10Code: dto.icd10Code,
          clinicalNotes: dto.clinicalNotes,
          treatment: dto.treatment,
          advice: dto.advice,
          chiefComplaint: dto.chiefComplaint,
          followUpDate: dto.followUpDate
            ? this.normalizeDate(dto.followUpDate)
            : undefined,
          followUpNotes: dto.followUpNotes,
          consultationStartedAt: new Date(),
          createdBy: userId,
        },
      });

      if (dto.vitals) {
        await tx.vital.create({
          data: {
            tenantId,
            patientId: dto.patientId,
            encounterId: created.id,
            temperature: dto.vitals.temperature,
            pulse: dto.vitals.pulse,
            respiratoryRate: dto.vitals.respiratoryRate,
            bloodPressureSystolic: dto.vitals.bloodPressureSystolic,
            bloodPressureDiastolic: dto.vitals.bloodPressureDiastolic,
            oxygenSaturation: dto.vitals.oxygenSaturation,
            height: dto.vitals.height,
            weight: dto.vitals.weight,
            bmi: dto.vitals.bmi,
            painScore: dto.vitals.painScore,
            bloodGlucose: dto.vitals.bloodGlucose,
            recordedBy: userId,
          },
        });
      }

      if (dto.diagnosis) {
        await tx.diagnosis.create({
          data: {
            tenantId,
            encounterId: created.id,
            patientId: dto.patientId,
            name: dto.diagnosis,
            icd10Code: dto.icd10Code,
            isPrimary: true,
            confirmedBy: userId,
            confirmedAt: new Date(),
          },
        });
      }

      return created;
    });

    await this.logAudit(tenantId, userId, "CREATE", "Encounter", encounter.id);

    if (encounter.doctorUserId) {
      this.notifications.create(tenantId, {
        userId: encounter.doctorUserId,
        title: "New Encounter Started",
        body: `Consultation started for patient ${patient.firstName} ${patient.lastName}`,
        type: "ENCOUNTER_STARTED",
        referenceType: "Encounter",
        referenceId: encounter.id,
      }).catch(() => {});
    }

    return encounter;
  }

  async findAll(
    tenantId: string,
    params: {
      patientId?: string;
      doctorId?: string;
      departmentId?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.doctorId) where.doctorId = params.doctorId;
    if (params.departmentId) where.departmentId = params.departmentId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.encounter.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
              gender: true,
              dateOfBirth: true,
            },
          },
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          department: { select: { id: true, name: true } },
          vitals: { take: 1, orderBy: { recordedAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.encounter.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listFollowUps(
    tenantId: string,
    params: { status?: string; doctorId?: string; search?: string; limit?: number } = {},
  ) {
    const limit = Math.min(200, Number(params.limit) || 50);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const patientSelect = {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      mrn: true,
      mobile: true,
      gender: true,
    };
    const doctorInclude = {
      include: { user: { select: { firstName: true, lastName: true } } },
    };

    const term = params.search?.trim();

    if (term) {
      const patientWhere: any = {
        tenantId,
        OR: [
          { firstName: { contains: term, mode: "insensitive" } },
          { middleName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
          { mrn: { contains: term, mode: "insensitive" } },
          { mobile: { contains: term, mode: "insensitive" } },
        ],
      };
      const patients = await this.prisma.patient.findMany({
        where: patientWhere,
        select: { id: true },
        take: limit,
      });
      const patientIds = patients.map((p) => p.id);
      if (patientIds.length === 0) return [];

      const encounterWhere: any = {
        tenantId,
        patientId: { in: patientIds },
      };
      if (params.status === "upcoming") {
        encounterWhere.followUpDate = { gte: tomorrow };
      } else if (params.status === "today") {
        encounterWhere.followUpDate = { gte: today, lt: tomorrow };
      } else if (params.status === "overdue") {
        encounterWhere.followUpDate = { lt: today };
      }

      return this.prisma.encounter.findMany({
        where: encounterWhere,
        include: {
          patient: { select: patientSelect },
          doctor: doctorInclude,
        },
        orderBy: { followUpDate: "asc" },
        take: limit,
      });
    }

    const where: any = { tenantId, followUpDate: { not: null } };
    if (params.doctorId) where.doctorId = params.doctorId;
    if (params.status === "upcoming") {
      where.followUpDate = { gte: tomorrow };
    } else if (params.status === "today") {
      where.followUpDate = { gte: today, lt: tomorrow };
    } else if (params.status === "overdue") {
      where.followUpDate = { lt: today };
    }

    return this.prisma.encounter.findMany({
      where,
      include: {
        patient: { select: patientSelect },
        doctor: doctorInclude,
      },
      orderBy: { followUpDate: "asc" },
      take: limit,
    });
  }

  async findById(tenantId: string, id: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
            gender: true,
            dateOfBirth: true,
            bloodGroup: true,
            mobile: true,
            addressLine1: true,
            city: true,
            allergies: true,
            conditions: true,
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            department: true,
          },
        },
        department: true,
        vitals: { orderBy: { recordedAt: "desc" } },
        diagnoses: true,
        prescriptions: { include: { items: true } },
        labOrders: { include: { items: { include: { labTest: true } } } },
        radiologyOrders: true,
        procedures: true,
        nursingNotes: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!encounter) throw new NotFoundException("Encounter not found");
    return encounter;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateEncounterDto,
    userId?: string,
  ) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id, tenantId },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");

    const { vitals, ...updateData } = dto as any;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.encounter.update({
        where: { id },
        data: { ...updateData, updatedBy: userId },
      });

      if (vitals) {
        await tx.vital.create({
          data: {
            tenantId,
            patientId: encounter.patientId,
            encounterId: id,
            temperature: vitals.temperature,
            pulse: vitals.pulse,
            respiratoryRate: vitals.respiratoryRate,
            bloodPressureSystolic: vitals.bloodPressureSystolic,
            bloodPressureDiastolic: vitals.bloodPressureDiastolic,
            oxygenSaturation: vitals.oxygenSaturation,
            height: vitals.height,
            weight: vitals.weight,
            painScore: vitals.painScore,
            bloodGlucose: vitals.bloodGlucose,
            recordedBy: userId,
          },
        });
      }

      return updated;
    });

    await this.logAudit(tenantId, userId, "UPDATE", "Encounter", id, {
      fields: Object.keys(updateData),
    });
    return result;
  }

  async complete(tenantId: string, id: string, userId?: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id, tenantId },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");

    const result = await this.prisma.encounter.update({
      where: { id },
      data: {
        status: "COMPLETED",
        consultationEndedAt: new Date(),
        updatedBy: userId,
      },
    });

    // Complete linked appointment
    if (encounter.appointmentId) {
      await this.prisma.appointment
        .update({
          where: { id: encounter.appointmentId },
          data: { status: "COMPLETED", completedAt: new Date() },
        })
        .catch((err) => console.warn(`Failed to update appointment status: ${err.message}`));
    }

    return result;
  }

  // Vitals
  async recordVital(tenantId: string, dto: CreateVitalDto, userId?: string) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    if (!dto.patientId) throw new BadRequestException("Patient is required");

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const encounterId = dto.encounterId || undefined;
    const admissionId = dto.admissionId || undefined;

    if (encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: encounterId, tenantId },
        select: { id: true, patientId: true },
      });
      if (!encounter)
        throw new NotFoundException("Encounter not found");
      if (encounter.patientId !== dto.patientId)
        throw new BadRequestException(
          "Encounter does not belong to this patient",
        );
    }

    if (admissionId) {
      const admission = await this.prisma.admission.findFirst({
        where: { id: admissionId, tenantId },
        select: { id: true, patientId: true },
      });
      if (!admission) throw new NotFoundException("Admission not found");
      if (admission.patientId !== dto.patientId)
        throw new BadRequestException(
          "Admission does not belong to this patient",
        );
    }

    return this.prisma.vital.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId,
        admissionId,
        temperature: dto.temperature,
        pulse: dto.pulse,
        respiratoryRate: dto.respiratoryRate,
        bloodPressureSystolic: dto.bloodPressureSystolic,
        bloodPressureDiastolic: dto.bloodPressureDiastolic,
        oxygenSaturation: dto.oxygenSaturation,
        height: dto.height,
        weight: dto.weight,
        painScore: dto.painScore,
        bloodGlucose: dto.bloodGlucose,
        notes: dto.notes,
        recordedBy: userId,
      },
    }).then((vital) => {
      const critical: string[] = [];
      if (dto.temperature && dto.temperature > 103) critical.push(`High temperature (${dto.temperature}°F)`);
      if (dto.oxygenSaturation && dto.oxygenSaturation < 90) critical.push(`Low SpO2 (${dto.oxygenSaturation}%)`);
      if (dto.pulse && (dto.pulse < 50 || dto.pulse > 130)) critical.push(`Abnormal pulse (${dto.pulse} bpm)`);
      if (dto.bloodGlucose && dto.bloodGlucose > 300) critical.push(`High blood glucose (${dto.bloodGlucose} mg/dL)`);

      if (critical.length > 0 && encounterId) {
        const encounter = this.prisma.encounter.findFirst({
          where: { id: encounterId, tenantId },
          select: { doctorUserId: true, patient: { select: { firstName: true, lastName: true } } },
        });
        encounter.then((enc) => {
          if (enc?.doctorUserId) {
            this.notifications.create(tenantId, {
              userId: enc.doctorUserId,
              title: "Critical Vital Alert",
              body: `${enc.patient.firstName} ${enc.patient.lastName}: ${critical.join(", ")}`,
              type: "VITAL_ALERT",
              referenceType: "Vital",
              referenceId: vital.id,
            }).catch(() => {});
          }
        }).catch(() => {});
      }
      return vital;
    });
  }

  async getVitals(tenantId: string, patientId: string) {
    return this.prisma.vital.findMany({
      where: { tenantId, patientId },
      orderBy: { recordedAt: "desc" },
      take: 50,
    });
  }

  // Prescriptions
  async createPrescription(
    tenantId: string,
    dto: CreatePrescriptionDto,
    userId?: string,
  ) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    if (!dto.patientId) throw new BadRequestException("Patient is required");
    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException("At least one prescription item required");

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const allergyWarnings = await this.checkAllergies(
      tenantId,
      dto.patientId,
      dto.items,
    );
    if (allergyWarnings.length > 0 && !dto.overrideAllergyWarning) {
      throw new BadRequestException({
        message: "Prescription contains a medicine matching a documented patient allergy",
        code: "ALLERGY_INTERACTION",
        warnings: allergyWarnings,
      });
    }

    const prescription = await this.prisma.$transaction(async (tx) => {
      let doctorId = undefined as string | undefined;
      if (dto.encounterId) {
        const encounter = await tx.encounter.findFirst({
          where: { id: dto.encounterId, tenantId },
        });
        if (!encounter)
          throw new NotFoundException("Encounter not found");
        if (encounter.patientId !== dto.patientId)
          throw new BadRequestException(
            "Encounter does not belong to this patient",
          );
        doctorId = encounter.doctorId ?? undefined;
      }

      const created = await tx.prescription.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          encounterId: dto.encounterId,
          doctorId,
          status: dto.status || "DRAFT",
          advice: dto.advice,
          followUp: dto.followUp,
        },
      });

      for (const item of dto.items) {
        await tx.prescriptionItem.create({
          data: {
            tenantId,
            prescriptionId: created.id,
            medicineName: item.medicineName,
            genericName: item.genericName,
            brandName: item.brandName,
            medicineId: item.medicineId,
            dosage: item.dosage,
            frequency: item.frequency,
            route: item.route,
            duration: item.duration,
            quantity: item.quantity,
            instructions: item.instructions,
          },
        });
      }

      return created;
    });

    if (allergyWarnings.length > 0) {
      await this.logAudit(
        tenantId,
        userId,
        "CREATE",
        "Prescription",
        prescription.id,
        { allergyWarningOverridden: true, warnings: allergyWarnings },
      );
    }

    await this.logAudit(
      tenantId,
      userId,
      "CREATE",
      "Prescription",
      prescription.id,
    );

    this.prisma.user.findMany({
      where: { tenantId, role: { in: ["PHARMACIST", "PHARMACY_TECHNICIAN"] as any } },
      select: { id: true },
    }).then((pharmacists) => {
      for (const pharmacist of pharmacists) {
        this.notifications.create(tenantId, {
          userId: pharmacist.id,
          title: "New Prescription Pending",
          body: `A new prescription has been created and is pending approval`,
          type: "PRESCRIPTION_CREATED",
          referenceType: "Prescription",
          referenceId: prescription.id,
        }).catch(() => {});
      }
    }).catch(() => {});

    return this.prisma.prescription.findUnique({
      where: { id: prescription.id },
      include: { items: true },
    });
  }

  async approvePrescription(
    tenantId: string,
    id: string,
    userId?: string,
    signature?: { data?: string; consentText?: string; ipAddress?: string; userAgent?: string },
  ) {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, tenantId },
    });
    if (!prescription) throw new NotFoundException("Prescription not found");

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.prescription.update({
        where: { id },
        data: {
          status: "APPROVED",
          updatedBy: userId,
          signedBy: userId,
          signedAt: new Date(),
        },
      });

      if (userId) {
        const signer = await tx.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true, role: true },
        });

        if (signer) {
          await tx.documentSignature.create({
            data: {
              tenantId,
              patientId: prescription.patientId,
              documentType: "Prescription",
              documentId: id,
              signedBy: userId,
              signerName: `${signer.firstName} ${signer.lastName}`.trim(),
              signerRole: signer.role,
              signatureData: signature?.data,
              consentText: signature?.consentText,
              ipAddress: signature?.ipAddress,
              userAgent: signature?.userAgent,
            },
          });
        }
      }

      return updated;
    });

    await this.logAudit(tenantId, userId, "SIGN", "Prescription", id);
    return result;
  }

  async getPrescription(tenantId: string, id: string) {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, tenantId },
      include: {
        items: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!prescription) throw new NotFoundException("Prescription not found");
    return prescription;
  }

  async getPatientPrescriptions(tenantId: string, patientId: string) {
    return this.prisma.prescription.findMany({
      where: { tenantId, patientId },
      include: {
        items: true,
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getPrescriptions(
    tenantId: string,
    query: {
      patientId?: string;
      doctorId?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { patientId, doctorId, status, search, page = 1, limit = 50 } = query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);
    const where: any = { tenantId };
    if (patientId) where.patientId = patientId;
    if (doctorId) where.doctorId = doctorId;
    if (status)
      where.status = String(status).toUpperCase().replace(/\-/g, "_");
    if (search)
      where.OR = [
        { advice: { contains: search, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { mrn: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];

    const [rows, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        include: {
          items: true,
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
            },
          },
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return { data: rows, total, page: pageNum, limit: limitNum };
  }

  async getDoctorEncounters(tenantId: string, doctorId: string, date?: string) {
    const where: any = { tenantId, doctorId };
    if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.createdAt = { gte: d, lt: next };
    }

    return this.prisma.encounter.findMany({
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
          },
        },
        vitals: { take: 1, orderBy: { recordedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private normalizeDate(input: Date | string): Date {
    if (input instanceof Date) return input;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(input);
  }

  private async checkAllergies(
    tenantId: string,
    patientId: string,
    items: CreatePrescriptionDto["items"],
  ): Promise<Array<{ allergen: string; severity: string | null; matchedMedicine: string }>> {
    const allergies = await this.prisma.patientAllergy.findMany({
      where: { tenantId, patientId },
    });
    if (allergies.length === 0) return [];

    const warnings: Array<{ allergen: string; severity: string | null; matchedMedicine: string }> = [];

    const normalize = (value?: string) => value?.toLowerCase().trim() ?? "";

    for (const allergy of allergies) {
      const allergen = normalize(allergy.allergen);
      if (!allergen) continue;

      for (const item of items) {
        const names = [item.medicineName, item.genericName, item.brandName].map(normalize);
        if (names.some((name) => name && name.includes(allergen))) {
          warnings.push({
            allergen: allergy.allergen,
            severity: allergy.severity ?? null,
            matchedMedicine: item.medicineName,
          });
          break;
        }
      }
    }

    return warnings;
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
    } catch (error) {
      console.warn(`Failed to write audit log: ${error}`);
    }
  }
}
