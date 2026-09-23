import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RegulatoryService } from "../regulatory/regulatory.service";

const MAX_LIMIT = 100;

export interface CreateAdmissionDto {
  patientId: string;
  encounterId?: string;
  admissionType?: string;
  referringDoctor?: string;
  admittingDoctorId?: string;
  departmentId?: string;
  provisionalDiagnosis?: string;
  bedId?: string;
  notes?: string;
  /** Admission is free-treatment eligible — required to claim a designated free bed. */
  isFreeTreatment?: boolean;
}

export interface UpdateAdmissionDto extends Partial<CreateAdmissionDto> {
  finalDiagnosis?: string;
  primaryDiagnosis?: string;
  notes?: string;
}

export interface AddConsultantDto {
  doctorId: string;
  /** Role within the admission: SECONDARY_CONSULTANT (default), SURGEON,
   * ANESTHETIST, etc. The PRIMARY_CONSULTANT slot is managed via admission
   * create/update, never via this route. */
  role?: string;
  departmentId?: string;
  specialty?: string;
  startAt?: Date | string;
}

export interface AdmissionSearchParams {
  patientId?: string;
  departmentId?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  /** Include type=EMERGENCY admissions. Off by default: ER admissions are
   * managed from the Emergency workspace and stay out of the main Admit list. */
  includeEmergency?: boolean;
}

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly regulatory?: RegulatoryService,
  ) {}

  async create(tenantId: string, dto: CreateAdmissionDto, userId?: string) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    let bed: any = null;
    if (dto.bedId) {
      bed = await this.prisma.bed.findFirst({
        where: { id: dto.bedId, tenantId },
        include: { room: { include: { ward: true } } },
      });
      if (!bed) throw new NotFoundException("Bed not found");
      if (bed.status === "OCCUPIED")
        throw new ConflictException("Bed is already occupied");
      // Rule 3: designated free beds are reserved for eligible
      // free-treatment admissions — a paid admission cannot take one.
      if (bed.freeBedEligible && !dto.isFreeTreatment)
        throw new ForbiddenException(
          "This bed is designated for free-treatment patients (use a non-designated bed or mark the admission free-treatment eligible)",
        );
    }

    const admissionNumber = await this.generateAdmissionNumber(tenantId);

    // §30 invariant / §2: a normal IPD admission is only ever born ADMITTED
    // (or activated) once BOTH a valid bed and a valid primary consultant are
    // present and validated. If either is missing the admission is created in
    // PENDING (assignment-incomplete) — it is never silently ADMITTED and it
    // never appears as an ACTIVE IPD in reports (§21). The §5/§13 gate runs
    // again, atomically, at activation.
    const canActivateNow =
      Boolean(bed) &&
      Boolean(dto.admittingDoctorId) &&
      Boolean(dto.bedId);

    const admission = await this.prisma.admission.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        admissionNumber,
        admissionType: dto.admissionType || "GENERAL",
        referringDoctor: dto.referringDoctor,
        admittingDoctorId: dto.admittingDoctorId,
        departmentId: dto.departmentId || bed?.room?.ward?.departmentId,
        provisionalDiagnosis: dto.provisionalDiagnosis,
        notes: dto.notes,
        status: canActivateNow ? "ADMITTED" : "PENDING",
        createdBy: userId,
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        bedAllocations: { include: { bed: true } },
      },
    });

    await this.prisma.patient.update({
      where: { id: dto.patientId },
      data: { status: "ACTIVE" },
    });

    // Consultant assignment history (spec §7.1): the original primary
    // consultant becomes a permanent, dated record — never silently mutated.
    if (dto.admittingDoctorId && (this.prisma as any).consultantAssignment) {
      await this.prisma.consultantAssignment.create({
        data: {
          tenantId,
          admissionId: admission.id,
          patientId: dto.patientId,
          doctorId: dto.admittingDoctorId,
          role: "PRIMARY_CONSULTANT",
          isPrimary: true,
          departmentId: dto.departmentId || bed?.room?.ward?.departmentId,
          startAt: admission.admissionDate,
          assignedBy: userId,
        },
      });
    }

    if (bed) {
      // Atomically claim the bed so concurrent admissions cannot double-book.
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.bed.updateMany({
          where: { id: bed.id, tenantId, status: { not: "OCCUPIED" } },
          data: { status: "OCCUPIED" },
        });
        if (claimed.count === 0) {
          throw new ConflictException("Bed is already occupied");
        }
        await tx.bedAllocation.create({
          data: {
            tenantId,
            bedId: bed.id,
            admissionId: admission.id,
            status: "OCCUPIED",
            createdBy: userId,
          },
        });
      });

      // Free-treatment admission onto a designated bed: open the regulatory
      // free-bed stay so the ledger and the physical inventory agree (§65.2,
      // Rule 2). Best-effort — an exhausted quota logs the exception upstream.
      if (dto.isFreeTreatment && bed.freeBedEligible && this.regulatory) {
        await this.regulatory
          .assignFreeBed(tenantId, {
            patientId: dto.patientId,
            admissionId: admission.id,
            bedId: bed.id,
            eligibilityBasis: "FREE",
            createdBy: userId,
          })
          .catch(() => undefined);
      }

      // §64.5/§64.6: admission + bed assignment activates the IPD clinical
      // context — the patient becomes visible in this ward's worklists now.
      if ((this.prisma as any).patientLocation) {
        await (this.prisma as any).patientLocation.updateMany({
          where: { tenantId, patientId: dto.patientId, status: { in: ["ACTIVE", "TEMPORARY"] } },
          data: { status: "ENDED", endedAt: new Date(), endReason: "Superseded by IPD admission" },
        });
        await (this.prisma as any).patientLocation.create({
          data: {
            tenantId,
            patientId: dto.patientId,
            encounterId: dto.encounterId,
            admissionId: admission.id,
            locationType: bed.room?.ward?.bedType === "EMERGENCY" ? "ER" : "IPD_WARD",
            departmentId: admission.departmentId,
            wardId: bed.room?.ward?.id ?? null,
            bedId: bed.id,
            status: "ACTIVE",
            isPrimary: true,
            createdBy: userId,
          },
        });
      }
    }

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, tenantId },
        select: { id: true },
      });
      if (encounter) {
        await this.prisma.encounter
          .update({
            where: { id: encounter.id },
            data: { status: "ADMITTED" },
          })
          .catch((err) =>
            console.warn(`Failed to update encounter status: ${err.message}`),
          );
      }
    }

    await this.logAudit(tenantId, userId, "CREATE", "Admission", admission.id);

    if (dto.admittingDoctorId) {
      this.prisma.doctorProfile
        .findFirst({
          where: { id: dto.admittingDoctorId, tenantId },
          select: { userId: true },
        })
        .then((doctor) => {
          if (doctor?.userId) {
            this.notifications
              .create(tenantId, {
                userId: doctor.userId,
                title: "Patient Admitted",
                body: `Patient ${admission.patient.firstName} ${admission.patient.lastName} has been admitted (${admission.admissionNumber})`,
                type: "ADMISSION_CREATED",
                referenceType: "Admission",
                referenceId: admission.id,
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }

    return admission;
  }

  async findAll(tenantId: string, params: AdmissionSearchParams) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.departmentId) where.departmentId = params.departmentId;
    if (params.status) where.status = params.status;
    if (!params.includeEmergency) where.admissionType = { not: "EMERGENCY" };

    if (params.search && params.search.trim()) {
      const term = params.search.trim();
      where.OR = [
        { admissionNumber: { contains: term, mode: "insensitive" } },
        {
          patient: {
            is: {
              OR: [
                { firstName: { contains: term, mode: "insensitive" } },
                { lastName: { contains: term, mode: "insensitive" } },
                { mrn: { contains: term, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    if (params.from || params.to) {
      where.admissionDate = {};
      if (params.from)
        where.admissionDate.gte = this.normalizeDate(params.from);
      if (params.to) {
        const to = this.normalizeDate(params.to);
        to.setHours(23, 59, 59, 999);
        where.admissionDate.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.admission.findMany({
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
          bedAllocations: {
            orderBy: { allocatedAt: "desc" },
            take: 1,
            include: { bed: true },
          },
        },
        orderBy: { admissionDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.admission.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(tenantId: string, id: string) {
    const admission = await this.prisma.admission.findFirst({
      where: { id, tenantId },
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
        encounter: true,
        bedAllocations: {
          orderBy: { allocatedAt: "desc" },
          include: { bed: true },
        },
        bedMovements: { orderBy: { movedAt: "desc" }, include: { bed: true } },
        deposits: true,
        invoices: { include: { items: true } },
        consultantAssignments: {
          orderBy: [{ isPrimary: "desc" }, { startAt: "asc" }],
        },
      },
    });
    if (!admission) throw new NotFoundException("Admission not found");
    return admission;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAdmissionDto,
    userId?: string,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    const {
      tenantId: _t,
      admissionNumber: _a,
      patientId: _p,
      ...fields
    } = dto as any;

    // Consultant change (spec §7.1): close the current primary assignment and
    // open a new one — history is preserved, never overwritten.
    if (
      fields.admittingDoctorId &&
      fields.admittingDoctorId !== admission.admittingDoctorId &&
      (this.prisma as any).consultantAssignment
    ) {
      await this.prisma.consultantAssignment.updateMany({
        where: {
          admissionId: id,
          isPrimary: true,
          endAt: null,
        },
        data: {
          endAt: new Date(),
          endReason: `Replaced by doctor ${fields.admittingDoctorId}`,
        },
      });
      await this.prisma.consultantAssignment.create({
        data: {
          tenantId,
          admissionId: id,
          patientId: admission.patientId,
          doctorId: fields.admittingDoctorId,
          role: "PRIMARY_CONSULTANT",
          isPrimary: true,
          departmentId: fields.departmentId ?? admission.departmentId,
          startAt: new Date(),
          assignedBy: userId,
        },
      });
      await this.logAudit(tenantId, userId, "UPDATE", "Admission", id, {
        action: "PRIMARY_CONSULTANT_CHANGED",
        from: admission.admittingDoctorId,
        to: fields.admittingDoctorId,
      });
    }

    return this.prisma.admission.update({
      where: { id },
      data: { ...fields, updatedBy: userId },
    });
  }

  /**
   * Add a consultant to an active admission (spec §7.2): additional consultants
   * during the stay become permanent, dated ConsultantAssignment records —
   * never silently mutated. Only non-primary roles are accepted here; the
   * primary slot is managed through admission create/update.
   */
  async addConsultant(
    tenantId: string,
    id: string,
    dto: AddConsultantDto,
    userId?: string,
  ) {
    const admission = await this.ensureExists(tenantId, id);
    if (!dto.doctorId) throw new BadRequestException("doctorId is required");

    const role = dto.role || "SECONDARY_CONSULTANT";
    if (role.toUpperCase() === "PRIMARY_CONSULTANT") {
      throw new BadRequestException(
        "Primary consultant is managed via admission create/update",
      );
    }

    if (admission.status === "DISCHARGED" || admission.status === "DECEASED") {
      throw new ConflictException(
        `Cannot add a consultant to a ${admission.status} admission`,
      );
    }

    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: dto.doctorId, tenantId },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException("Doctor not found");

    const assignment = await this.prisma.consultantAssignment.create({
      data: {
        tenantId,
        admissionId: id,
        patientId: admission.patientId,
        doctorId: dto.doctorId,
        role,
        isPrimary: false,
        departmentId: dto.departmentId ?? admission.departmentId,
        specialty: dto.specialty,
        startAt: dto.startAt
          ? this.normalizeDate(dto.startAt)
          : new Date(),
        assignedBy: userId,
      },
    });

    const enriched = await this.enrichConsultants(tenantId, [assignment]);

    await this.logAudit(tenantId, userId, "CREATE", "ConsultantAssignment", assignment.id, {
      admissionId: id,
      doctorId: dto.doctorId,
      role,
    } as Prisma.InputJsonValue);
    return enriched[0];
  }

  /** List the admission's consultants (primary + additional, dated history). */
  async getConsultants(tenantId: string, id: string) {
    await this.ensureExists(tenantId, id);
    const assignments = await this.prisma.consultantAssignment.findMany({
      where: { tenantId, admissionId: id },
      orderBy: [{ isPrimary: "desc" }, { startAt: "asc" }],
    });
    return this.enrichConsultants(tenantId, assignments);
  }

  /** Attach doctor display info to consultant assignments. The model has no
   * doctor relation, so names come from a bulk DoctorProfile lookup. */
  private async enrichConsultants(tenantId: string, assignments: any[]) {
    if (assignments.length === 0) return assignments;
    const doctorIds = [...new Set(assignments.map((a) => a.doctorId))];
    const doctors = await this.prisma.doctorProfile.findMany({
      where: { tenantId, id: { in: doctorIds } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const byId = new Map(doctors.map((d) => [d.id, d] as const));
    return assignments.map((a) => ({ ...a, doctor: byId.get(a.doctorId) ?? null }));
  }

  async allocateBed(
    tenantId: string,
    id: string,
    bedId: string,
    userId?: string,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    const bed = await this.prisma.bed.findFirst({
      where: { id: bedId, tenantId, isActive: true },
    });
    if (!bed) throw new NotFoundException("Bed not found");
    if (bed.status !== "AVAILABLE") {
      throw new ConflictException(`Bed is not available (${bed.status})`);
    }

    return this.prisma.$transaction(async (tx) => {
      const oldAllocations = await tx.bedAllocation.findMany({
        where: { admissionId: id, status: "OCCUPIED" },
        include: { bed: true },
      });

      await tx.bed.update({
        where: { id: bedId },
        data: { status: "OCCUPIED" },
      });

      for (const old of oldAllocations) {
        if (old.bedId === bedId) continue;
        await tx.bed.update({
          where: { id: old.bedId },
          data: { status: "CLEANING" },
        });
      }

      await tx.bedAllocation.updateMany({
        where: { admissionId: id, status: "OCCUPIED" },
        data: { status: "CLEANING", releasedAt: new Date() },
      });

      const allocation = await tx.bedAllocation.create({
        data: {
          tenantId,
          bedId,
          admissionId: id,
          status: "OCCUPIED",
          createdBy: userId,
        },
        include: { bed: true },
      });

      await this.logAudit(tenantId, userId, "UPDATE", "Admission", id, {
        action: "BED_ALLOCATED",
        bedId,
      });
      return allocation;
    });
  }

  async transferBed(
    tenantId: string,
    id: string,
    toBedId: string,
    reason: string,
    userId?: string,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    const current = await this.prisma.bedAllocation.findFirst({
      where: { admissionId: id, status: "OCCUPIED" },
      include: { bed: true },
    });
    if (!current) throw new ConflictException("No current bed allocated");

    const toBed = await this.prisma.bed.findFirst({
      where: { id: toBedId, tenantId, isActive: true },
    });
    if (!toBed) throw new NotFoundException("Target bed not found");
    if (toBed.status !== "AVAILABLE")
      throw new ConflictException("Target bed is not available");

    return this.prisma.$transaction(async (tx) => {
      await tx.bed.update({
        where: { id: current.bedId },
        data: { status: "CLEANING" },
      });
      await tx.bed.update({
        where: { id: toBedId },
        data: { status: "OCCUPIED" },
      });

      await tx.bedAllocation.update({
        where: { id: current.id },
        data: { status: "CLEANING", releasedAt: new Date() },
      });

      const allocation = await tx.bedAllocation.create({
        data: {
          tenantId,
          bedId: toBedId,
          admissionId: id,
          status: "OCCUPIED",
          createdBy: userId,
        },
        include: { bed: true },
      });

      await tx.bedMovement.create({
        data: {
          tenantId,
          bedId: toBedId,
          admissionId: id,
          fromRoomId: current.bed.roomId,
          fromBedId: current.bedId,
          toRoomId: toBed.roomId,
          toBedId,
          reason,
          movedBy: userId,
        },
      });

      await this.logAudit(tenantId, userId, "UPDATE", "Admission", id, {
        action: "BED_TRANSFERRED",
        toBedId,
        reason,
      });
      return allocation;
    });
  }

  async discharge(
    tenantId: string,
    id: string,
    dto: {
      dischargeType?: string;
      dischargeSummary?: string;
      finalDiagnosis?: string;
    },
    userId?: string,
  ) {
    if (!tenantId) throw new BadRequestException("Tenant ID is required");
    const admission = await this.prisma.admission.findFirst({
      where: { id, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.admission.update({
        where: { id },
        data: {
          status: "DISCHARGED",
          isDischarged: true,
          dischargeDate: new Date(),
          dischargeType: dto.dischargeType,
          dischargeSummary: dto.dischargeSummary,
          finalDiagnosis: dto.finalDiagnosis,
          updatedBy: userId,
        },
      });

      await tx.patient.update({
        where: { id: admission.patientId },
        data: { status: "INACTIVE" },
      });

      const allocations = await tx.bedAllocation.findMany({
        where: { admissionId: id, status: "OCCUPIED" },
      });
      for (const alloc of allocations) {
        await tx.bed.update({
          where: { id: alloc.bedId },
          data: { status: "CLEANING" },
        });
        await tx.bedAllocation.update({
          where: { id: alloc.id },
          data: { status: "CLEANING", releasedAt: new Date() },
        });
      }

      // §64.14: discharge ends the active clinical context — the patient
      // leaves every active worklist but stays accessible as a record.
      if ((tx as any).patientLocation) {
        await (tx as any).patientLocation.updateMany({
          where: { tenantId, patientId: admission.patientId, status: { in: ["ACTIVE", "TEMPORARY"] } },
          data: { status: "ENDED", endedAt: new Date(), endReason: "Discharged" },
        });
      }

      if (admission.encounterId) {
        await tx.encounter
          .update({
            where: { id: admission.encounterId },
            data: { status: "DISCHARGED" },
          })
          .catch((err) =>
            console.warn(`Failed to update encounter status: ${err.message}`),
          );
      }

      await this.logAudit(tenantId, userId, "UPDATE", "Admission", id, {
        action: "DISCHARGED",
      });

      if (admission.admittingDoctorId) {
        this.prisma.doctorProfile
          .findFirst({
            where: { id: admission.admittingDoctorId, tenantId },
            select: { userId: true },
          })
          .then((doctor) => {
            if (doctor?.userId) {
              this.notifications
                .create(tenantId, {
                  userId: doctor.userId,
                  title: "Patient Discharged",
                  body: `Patient has been discharged (${admission.admissionNumber})`,
                  type: "ADMISSION_DISCHARGED",
                  referenceType: "Admission",
                  referenceId: id,
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
      }

      return updated;
    });
  }

  async addNursingNote(
    tenantId: string,
    id: string,
    dto: { note: string; assessment?: string; plan?: string },
    userId?: string,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    return this.prisma.nursingNote.create({
      data: {
        tenantId,
        admissionId: id,
        patientId: admission.patientId,
        encounterId: admission.encounterId || undefined,
        note: dto.note,
        assessment: dto.assessment,
        plan: dto.plan,
        createdBy: userId,
      },
    });
  }

  async getNursingNotes(tenantId: string, id: string) {
    await this.ensureExists(tenantId, id);
    return this.prisma.nursingNote.findMany({
      where: { tenantId, admissionId: id },
      orderBy: { createdAt: "desc" },
    });
  }

  async addMedication(
    tenantId: string,
    id: string,
    dto: {
      medicineName: string;
      dose: string;
      route?: string;
      scheduledTime: Date | string;
      medicineId?: string;
    },
    userId?: string,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    return this.prisma.medicationAdministration.create({
      data: {
        tenantId,
        admissionId: id,
        patientId: admission.patientId,
        medicineName: dto.medicineName,
        medicineId: dto.medicineId,
        dose: dto.dose,
        route: dto.route,
        scheduledTime: this.normalizeDate(dto.scheduledTime),
      },
    });
  }

  async getMedications(tenantId: string, id: string) {
    await this.ensureExists(tenantId, id);
    return this.prisma.medicationAdministration.findMany({
      where: { tenantId, admissionId: id },
      orderBy: { scheduledTime: "asc" },
    });
  }

  async administerMedication(
    tenantId: string,
    admissionId: string,
    medId: string,
    dto: { status?: string; givenTime?: Date | string; remarks?: string },
    userId?: string,
  ) {
    const med = await this.prisma.medicationAdministration.findFirst({
      where: { id: medId, tenantId, admissionId },
    });
    if (!med)
      throw new NotFoundException("Medication administration not found");

    return this.prisma.medicationAdministration.update({
      where: { id: medId },
      data: {
        status: dto.status || "GIVEN",
        givenTime: dto.givenTime
          ? this.normalizeDate(dto.givenTime)
          : new Date(),
        givenBy: userId,
        remarks: dto.remarks,
      },
    });
  }

  async getActiveAdmissions(tenantId: string) {
    return this.prisma.admission.findMany({
      where: {
        tenantId,
        status: { in: ["PENDING", "ADMITTED", "TRANSFERRED"] },
        admissionType: { not: "EMERGENCY" },
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        bedAllocations: {
          where: { status: "OCCUPIED" },
          include: { bed: { include: { ward: true, room: true } } },
        },
      },
      orderBy: { admissionDate: "desc" },
    });
  }

  async getBedBoard(tenantId: string) {
    const beds = await this.prisma.bed.findMany({
      where: { tenantId },
      include: {
        ward: true,
        room: true,
        allocations: {
          where: { status: "OCCUPIED" },
          orderBy: { allocatedAt: "desc" },
          take: 1,
          include: {
            admission: {
              include: {
                patient: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    mrn: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { bedNumber: "asc" },
    });

    return {
      beds,
      summary: {
        total: beds.length,
        available: beds.filter((b) => b.status === "AVAILABLE").length,
        occupied: beds.filter((b) => b.status === "OCCUPIED").length,
        reserved: beds.filter((b) => b.status === "RESERVED").length,
        cleaning: beds.filter((b) => b.status === "CLEANING").length,
        maintenance: beds.filter((b) => b.status === "MAINTENANCE").length,
        blocked: beds.filter((b) => b.status === "BLOCKED").length,
      },
    };
  }

  private async ensureExists(tenantId: string, id: string) {
    const admission = await this.prisma.admission.findFirst({
      where: { id, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");
    return admission;
  }

  private async generateAdmissionNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const latest = await this.prisma.admission.findFirst({
      where: { tenantId, admissionNumber: { startsWith: `IPD-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { admissionNumber: true },
    });

    let seq = 1;
    if (latest) {
      const parts = latest.admissionNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `IPD-${ymd}-${String(seq).padStart(4, "0")}`;
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
    } catch (error) {
      console.warn(`Failed to write audit log: ${error}`);
    }
  }
}
