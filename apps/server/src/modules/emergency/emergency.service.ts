import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { BillingService } from "../billing/billing.service";

export interface CreateEmergencyCaseDto {
  patientId: string;
  arrivalMode?: string;
  triageLevel?: string;
  chiefComplaint?: string;
  triageNotes?: string;
  isMLC?: boolean;
  mlcNumber?: string;
  policeCase?: boolean;
  vitals?: any;
  examination?: string;
  history?: string;
  /** Attending ER doctor (DoctorProfile id). Creates an EMERGENCY encounter
   * so the case appears in that doctor's "My Patients" list. */
  doctorId?: string;
}

export interface CreateEmergencyInvoiceDto {
  patientId: string;
  emergencyCaseId?: string;
  items: Array<{
    serviceName: string;
    serviceCode?: string;
    serviceId?: string;
    quantity?: number;
    rate?: number;
    taxPercent?: number;
    discountPercent?: number;
    description?: string;
  }>;
  discountAmount?: number;
  discountReason?: string;
  taxPercent?: number;
  isCredit?: boolean;
  notes?: string;
}

// Charges commonly raised in the ER. Free-text line items are also accepted;
// these presets exist so the ER billing form offers one-tap typical services.
export const EMERGENCY_SERVICE_PRESETS: Array<{
  code: string;
  name: string;
  rate: number;
}> = [
  { code: "ER-TRIAGE", name: "Emergency triage & assessment", rate: 500 },
  { code: "ER-OBS-1H", name: "ER observation (per hour)", rate: 800 },
  { code: "ER-BED-DAY", name: "Emergency bed charge (per day)", rate: 1200 },
  { code: "ER-PROC-MINOR", name: "Minor procedure (ER)", rate: 1500 },
  { code: "ER-DRESSING", name: "Wound dressing", rate: 600 },
  { code: "ER-SUTURING", name: "Suturing", rate: 1200 },
  { code: "ER-NEB", name: "Nebulisation", rate: 400 },
  { code: "ER-IV-CANN", name: "IV cannulation", rate: 350 },
  { code: "ER-INJ-IM", name: "IM injection", rate: 200 },
  { code: "ER-INJ-IV", name: "IV injection", rate: 300 },
  { code: "ER-EKG", name: "ECG (ER)", rate: 500 },
  { code: "ER-AMB", name: "Ambulance transfer", rate: 2500 },
];

const TRIAGE_LEVELS = ["IMMEDIATE", "EMERGENT", "URGENT", "NON_URGENT"];

@Injectable()
export class EmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async create(tenantId: string, dto: CreateEmergencyCaseDto, userId?: string) {
    if (!dto.patientId) throw new BadRequestException("Patient is required");
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    // Optional attending doctor — validated against this tenant.
    let doctor: { id: string; userId: string | null } | null = null;
    if (dto.doctorId) {
      doctor = await this.prisma.doctorProfile.findFirst({
        where: { id: dto.doctorId, tenantId, isActive: true },
        select: { id: true, userId: true },
      });
      if (!doctor) throw new NotFoundException("Doctor not found");
    }

    const caseNumber = await this.generateCaseNumber(tenantId);
    const created = await this.prisma.emergencyCase.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        caseNumber,
        arrivalMode: dto.arrivalMode,
        triageLevel: dto.triageLevel,
        chiefComplaint: dto.chiefComplaint,
        triageNotes: dto.triageNotes,
        isMLC: dto.isMLC,
        mlcNumber: dto.mlcNumber,
        policeCase: dto.policeCase,
        vitals: dto.vitals,
        examination: dto.examination,
        history: dto.history,
        createdBy: userId,
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
      },
    });

    // Record the doctor's EMERGENCY encounter (with the triage vitals if
    // provided) so the patient shows up in the doctor's "My Patients".
    let encounterId: string | null = null;
    if (doctor) {
      const encounter = await this.prisma.encounter.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          doctorId: doctor.id,
          doctorUserId: doctor.userId || undefined,
          type: "EMERGENCY",
          status: "ACTIVE",
          chiefComplaint: dto.chiefComplaint,
          symptoms: dto.chiefComplaint,
          examination: dto.examination,
          history: dto.history,
          clinicalNotes: `Emergency case ${caseNumber}`,
          createdBy: userId,
        },
      });
      encounterId = encounter.id;
    }

    // §64.1/§64.2: the ER case registers the patient's CURRENT clinical
    // context. From this point the patient is ER-visible and invisible to
    // other departments' worklists until a completed transfer moves them.
    // The location is stamped with the registering staff's department so
    // ER-department-scoped visibility resolves.
    if ((this.prisma as any).patientLocation) {
      const creatorDept = userId
        ? await this.prisma.staffProfile
            .findFirst({
              where: { userId, tenantId },
              select: { departmentId: true },
            })
            .catch(() => null)
        : null;
      await this.prisma.patientLocation.updateMany({
        where: { tenantId, patientId: dto.patientId, status: { in: ["ACTIVE", "TEMPORARY"] } },
        data: { status: "ENDED", endedAt: new Date(), endReason: "Superseded by new location" },
      });
      await this.prisma.patientLocation.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          encounterId,
          locationType: "ER",
          departmentId: creatorDept?.departmentId ?? undefined,
          status: "ACTIVE",
          isPrimary: true,
          createdBy: userId,
        },
      });
    }

    return created;
  }

  async findAll(tenantId: string, query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const where: any = { tenantId };
    if (query.patientId) where.patientId = query.patientId;
    if (query.search) {
      where.OR = [
        { caseNumber: { contains: query.search, mode: "insensitive" } },
        { chiefComplaint: { contains: query.search, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { mrn: { contains: query.search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }
    if (query.status === "ACTIVE") {
      where.admitted = false;
      where.dischargedAt = null;
    } else if (query.status === "ADMITTED") {
      where.admitted = true;
      where.dischargedAt = null;
    } else if (query.status === "DISCHARGED") {
      where.dischargedAt = { not: null };
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.emergencyCase.findMany({
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
          admission: {
            select: {
              id: true,
              admissionNumber: true,
              status: true,
              bedAllocations: {
                where: { releasedAt: null },
                include: { bed: { select: { bedNumber: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.emergencyCase.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(tenantId: string, id: string) {
    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
      include: {
        patient: true,
        admission: {
          include: {
            bedAllocations: {
              where: { releasedAt: null },
              include: {
                bed: { include: { room: { include: { ward: true } } } },
              },
            },
          },
        },
      },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    return ec;
  }

  async update(
    tenantId: string,
    id: string,
    dto: Partial<CreateEmergencyCaseDto>,
  ) {
    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    return this.prisma.emergencyCase.update({
      where: { id },
      data: {
        arrivalMode: dto.arrivalMode,
        triageLevel: dto.triageLevel,
        chiefComplaint: dto.chiefComplaint,
        triageNotes: dto.triageNotes,
        isMLC: dto.isMLC,
        mlcNumber: dto.mlcNumber,
        policeCase: dto.policeCase,
        vitals: dto.vitals,
        examination: dto.examination,
        history: dto.history,
      },
    });
  }

  /**
   * Admit an ER case: creates a REAL Admission (type EMERGENCY) so the patient
   * appears in IPD workflows, the bed board, transfers and discharge billing.
   * When `bedId` is provided it must be a free bed in the Emergency Ward; the
   * claim is atomic so concurrent admissions cannot double-book it.
   */
  async admit(
    tenantId: string,
    id: string,
    body: {
      admittedTo?: string;
      bedId?: string;
      notes?: string;
      doctorId?: string;
    },
    userId?: string,
  ) {
    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    if (ec.dischargedAt)
      throw new BadRequestException("Cannot admit a discharged case");
    if (ec.admitted)
      throw new BadRequestException("Case is already admitted");

    let bed: { id: string; wardId: string | null } | null = null;
    if (body.bedId) {
      bed = await this.prisma.bed.findFirst({
        where: { id: body.bedId, tenantId, isActive: true },
        select: { id: true, wardId: true },
      });
      if (!bed) throw new NotFoundException("Bed not found");
      // The ER ward (bedType EMERGENCY) is preferred but not enforced — ER can
      // hold a patient in ICU etc. via the generic admissions flow.
      const occupied = await this.prisma.bed.findFirst({
        where: { id: bed.id, status: "OCCUPIED" },
        select: { id: true },
      });
      if (occupied) throw new ConflictException("Bed is already occupied");
    }

    // Attending doctor for the admission (validated against this tenant).
    let doctorProfile: { id: string; userId: string | null } | null = null;
    if (body.doctorId) {
      doctorProfile = await this.prisma.doctorProfile.findFirst({
        where: { id: body.doctorId, tenantId, isActive: true },
        select: { id: true, userId: true },
      });
      if (!doctorProfile) throw new NotFoundException("Doctor not found");
    }

    const admission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.admission.create({
        data: {
          tenantId,
          patientId: ec.patientId,
          admissionNumber: await this.generateAdmissionNumber(tx, tenantId),
          admissionType: "EMERGENCY",
          provisionalDiagnosis: ec.chiefComplaint,
          notes: body.notes || `Admitted from ER case ${ec.caseNumber}`,
          status: "ADMITTED",
          ...(doctorProfile ? { admittingDoctorId: doctorProfile.id } : {}),
          createdBy: userId,
        },
      });
      await tx.emergencyCase.update({
        where: { id: ec.id },
        data: {
          admitted: true,
          admittedTo: body.admittedTo,
          admittedAt: new Date(),
          admissionId: created.id,
        },
      });
      if (bed) {
        const claimed = await tx.bed.updateMany({
          where: { id: bed.id, tenantId, status: { not: "OCCUPIED" } },
          data: { status: "OCCUPIED" },
        });
        if (claimed.count === 0)
          throw new ConflictException("Bed is already occupied");
        await tx.bedAllocation.create({
          data: {
            tenantId,
            bedId: bed.id,
            admissionId: created.id,
            status: "OCCUPIED",
            createdBy: userId,
          },
        });
      }

      // §64.6: attach the bed to the patient's active location so bed-based
      // visibility (ER bed board / ward lists) resolves through one record.
      if ((tx as any).patientLocation) {
        const active = await (tx as any).patientLocation.findFirst({
          where: { tenantId, patientId: ec.patientId, status: "ACTIVE" },
          select: { id: true },
        });
        if (active) {
          await (tx as any).patientLocation.update({
            where: { id: active.id },
            data: { bedId: bed?.id ?? null, admissionId: created.id },
          });
        }
      }
      return created;
    });

    return this.prisma.emergencyCase.findUnique({
      where: { id: ec.id },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        admission: {
          include: {
            bedAllocations: {
              where: { releasedAt: null },
              include: { bed: true },
            },
          },
        },
      },
    });
  }

  /**
   * Discharge an ER case: closes the case, discharges the linked admission and
   * releases its bed so the board stays consistent.
   */
  async discharge(
    tenantId: string,
    id: string,
    body: { dischargeSummary?: string },
    userId?: string,
  ) {
    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
      include: {
        admission: {
          include: { bedAllocations: { where: { releasedAt: null } } },
        },
      },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    if (ec.dischargedAt)
      throw new BadRequestException("Case is already discharged");

    await this.prisma.$transaction(async (tx) => {
      await tx.emergencyCase.update({
        where: { id: ec.id },
        data: {
          admitted: false,
          dischargeSummary: body.dischargeSummary,
          dischargedAt: new Date(),
        },
      });
      if (ec.admission && !ec.admission.isDischarged) {
        await tx.admission.update({
          where: { id: ec.admission.id },
          data: {
            isDischarged: true,
            status: "DISCHARGED",
            dischargeDate: new Date(),
            dischargeSummary:
              body.dischargeSummary || ec.admission.dischargeSummary,
            updatedBy: userId,
          },
        });
      }
      for (const alloc of ec.admission?.bedAllocations || []) {
        await tx.bedAllocation.update({
          where: { id: alloc.id },
          data: { releasedAt: new Date(), status: "AVAILABLE" },
        });
        await tx.bed.update({
          where: { id: alloc.bedId },
          data: { status: "AVAILABLE" },
        });
      }

      // §64.14: discharged patients leave the active ER worklist. The
      // clinical record remains accessible to authorized users (§64.18).
      if ((tx as any).patientLocation) {
        await (tx as any).patientLocation.updateMany({
          where: { tenantId, patientId: ec.patientId, status: { in: ["ACTIVE", "TEMPORARY"] } },
          data: { status: "ENDED", endedAt: new Date(), endReason: "Discharged from ER" },
        });
      }
    });

    return { success: true };
  }

  /**
   * Transfer an admitted ER patient to another bed, or out of the ER into a
   * ward. The linked Admission (visible to IPD/ward flows) is kept in sync:
   * a ward transfer re-homes it to the ward's department and re-assigns the
   * admitting doctor, and the ER case is flagged TRANSFERRED_OUT so the ER
   * board stops managing it. Bed allocation/movement bookkeeping matches the
   * shared bed-management transfer exactly.
   */
  async transfer(
    tenantId: string,
    id: string,
    body: {
      toBedId?: string;
      reason?: string;
      toWardId?: string;
      doctorId?: string;
      notes?: string;
    },
    userId?: string,
  ) {
    if (!body.toBedId && !body.toWardId)
      throw new BadRequestException(
        "Provide a destination bed or a destination ward",
      );
    if (body.toBedId && body.toWardId)
      throw new BadRequestException(
        "Choose either a bed transfer or a ward transfer, not both",
      );

    const ec = await this.prisma.emergencyCase.findFirst({
      where: { id, tenantId },
      include: {
        admission: {
          include: { bedAllocations: { where: { releasedAt: null } } },
        },
      },
    });
    if (!ec) throw new NotFoundException("Emergency case not found");
    if (ec.dischargedAt)
      throw new BadRequestException("Cannot transfer a discharged case");
    if (!ec.admitted || !ec.admission)
      throw new BadRequestException(
        "Case is not admitted — admit it to a bed before transferring",
      );

    const currentAlloc = ec.admission.bedAllocations[0];
    if (!currentAlloc)
      throw new ConflictException(
        "No active bed allocation found for this case",
      );

    let ward = null as
      | { id: string; name: string; departmentId: string | null }
      | null;
    if (body.toWardId) {
      ward = await this.prisma.ward.findFirst({
        where: { id: body.toWardId, tenantId, isActive: true },
        select: { id: true, name: true, departmentId: true },
      });
      if (!ward) throw new NotFoundException("Destination ward not found");
    }

    let doctorProfile = null as { id: string; userId: string | null } | null;
    if (body.doctorId) {
      doctorProfile = await this.prisma.doctorProfile.findFirst({
        where: { id: body.doctorId, tenantId, isActive: true },
        select: { id: true, userId: true },
      });
      if (!doctorProfile)
        throw new NotFoundException("Doctor not found");
    }

    const toBedId = body.toBedId || null;
    if (toBedId) {
      const newBed = await this.prisma.bed.findFirst({
        where: { id: toBedId, tenantId, isActive: true },
      });
      if (!newBed) throw new NotFoundException("Target bed not found");
      if (newBed.status !== "AVAILABLE")
        throw new ConflictException(
          `Target bed is not available (status: ${newBed.status})`,
        );
      if (newBed.id === currentAlloc.bedId)
        throw new ConflictException("Patient is already in this bed");
    }

    const admissionId = ec.admission.id;
    const result = await this.prisma.$transaction(async (tx) => {
      // Free the current bed (same convention as bed-management transfers:
      // the vacated bed goes to CLEANING, not straight to AVAILABLE).
      await tx.bedAllocation.update({
        where: { id: currentAlloc.id },
        data: { status: "AVAILABLE", releasedAt: new Date() },
      });
      await tx.bed.update({
        where: { id: currentAlloc.bedId },
        data: { status: "CLEANING" },
      });

      // Claim the destination bed (bed transfer, or the first free bed in the
      // destination ward when transferring out of the ER).
      let claimedBedId = toBedId;
      if (ward && !claimedBedId) {
        const freeBed = await tx.bed.findFirst({
          where: { tenantId, wardId: ward.id, isActive: true, status: "AVAILABLE" },
          orderBy: { bedNumber: "asc" },
        });
        if (!freeBed)
          throw new ConflictException(
            `No free bed in ward "${ward.name}" — pick one manually via bed transfer`,
          );
        claimedBedId = freeBed.id;
      }
      if (claimedBedId) {
        const claimed = await tx.bed.updateMany({
          where: { id: claimedBedId, tenantId, status: { not: "OCCUPIED" } },
          data: { status: "OCCUPIED" },
        });
        if (claimed.count === 0)
          throw new ConflictException("Target bed was just taken — retry");
        await tx.bedAllocation.create({
          data: {
            tenantId,
            bedId: claimedBedId,
            admissionId,
            status: "OCCUPIED",
            createdBy: userId,
          },
        });
      }

      await tx.bedMovement.create({
        data: {
          tenantId,
          bedId: currentAlloc.bedId,
          admissionId,
          fromBedId: currentAlloc.bedId,
          toBedId: claimedBedId,
          reason:
            body.reason ||
            (ward
              ? `ER → ward transfer to ${ward.name}`
              : "ER bed transfer"),
          movedBy: userId,
        },
      });

      // Keep the shared Admission record authoritative for IPD flows.
      await tx.admission.update({
        where: { id: admissionId },
        data: {
          ...(ward
            ? {
                departmentId: ward.departmentId || undefined,
                admissionType: "TRANSFER",
                notes: body.notes || `Transferred from ER to ${ward.name}`,
              }
            : {}),
          ...(doctorProfile ? { admittingDoctorId: doctorProfile.id } : {}),
          updatedBy: userId,
        },
      });

      if (ward) {
        // The ER board keeps showing the case but with its new location; the
        // linked admission carries on in the ward under the receiving doctor.
        await tx.emergencyCase.update({
          where: { id: ec.id },
          data: {
            admittedTo: ward.name,
            triageNotes: body.notes || ec.triageNotes,
          },
        });
        // Re-point the linked encounter (if any) at the receiving doctor so
        // "my patients" and ward follow-ups follow the transfer.
        if (doctorProfile) {
          await tx.encounter.updateMany({
            where: { patientId: ec.patientId, tenantId, type: "EMERGENCY" },
            data: {
              doctorId: doctorProfile.id,
              doctorUserId: doctorProfile.userId || undefined,
            },
          },
          );
        }
      }

      // §64.7/§64.8: the clinical context follows the physical location.
      // Ward move → the ER location ends and the WARD location activates in
      // this same transaction (§64.25 — never active in both). Bed move
      // inside the ER → the active location's bed pointer updates.
      if ((tx as any).patientLocation) {
        if (ward) {
          await (tx as any).patientLocation.updateMany({
            where: { tenantId, patientId: ec.patientId, status: { in: ["ACTIVE", "TEMPORARY"] } },
            data: { status: "ENDED", endedAt: new Date(), endReason: body.reason || `ER → ${ward.name}` },
          });
          await (tx as any).patientLocation.create({
            data: {
              tenantId,
              patientId: ec.patientId,
              admissionId,
              locationType: "IPD_WARD",
              departmentId: ward.departmentId || undefined,
              wardId: ward.id,
              bedId: claimedBedId,
              status: "ACTIVE",
              isPrimary: true,
              createdBy: userId,
            },
          });
        } else if (claimedBedId) {
          const active = await (tx as any).patientLocation.findFirst({
            where: { tenantId, patientId: ec.patientId, status: "ACTIVE" },
            select: { id: true },
          });
          if (active) {
            await (tx as any).patientLocation.update({
              where: { id: active.id },
              data: { bedId: claimedBedId },
            });
          }
        }
      }

      return { claimedBedId, ward: ward?.name || null };
    });

    return {
      success: true,
      admissionId,
      movedToBedId: result.claimedBedId,
      transferredToWard: result.ward,
    };
  }

  /** ER-scoped billing: only EMERGENCY invoices, tenant-isolated. */
  async listInvoices(tenantId: string, query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const where: any = { tenantId, type: "EMERGENCY" as any };
    if (query.status) where.status = query.status;
    if (query.patientId) where.patientId = query.patientId;
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { mrn: { contains: query.search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          items: true,
        },
        orderBy: { issuedDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * ER billing patient picker: only patients who have an emergency case,
   * tenant-scoped and searchable by name/MRN/mobile.
   */
  async listErPatients(tenantId: string, query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
    const where: any = {
      tenantId,
      deletedAt: null,
      emergencyCases: { some: {} },
    };
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { mrn: { contains: query.search, mode: "insensitive" } },
        { mobile: { contains: query.search } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          mrn: true,
          mobile: true,
          patientType: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.patient.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Resolve a single ER patient (AsyncSearchSelect label lookup). */
  async getErPatient(tenantId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        mrn: true,
        mobile: true,
        patientType: true,
      },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }

  /** Create an EMERGENCY invoice through the shared billing engine. */
  async createInvoice(
    tenantId: string,
    dto: CreateEmergencyInvoiceDto,
    userId?: string,
  ) {
    if (!dto.patientId) throw new BadRequestException("Patient is required");
    if (!dto.items?.length)
      throw new BadRequestException("At least one service item is required");
    for (const item of dto.items) {
      if (!item.serviceName?.trim())
        throw new BadRequestException("Every item needs a service name");
      const qty = Number(item.quantity ?? 1);
      const rate = Number(item.rate ?? 0);
      if (!Number.isFinite(qty) || qty <= 0)
        throw new BadRequestException("Item quantity must be a positive number");
      if (!Number.isFinite(rate) || rate < 0)
        throw new BadRequestException("Item rate must be zero or greater");
    }
    // ER billing is scoped to patients with an emergency case: the picker
    // only offers them, and the rule is enforced here as well.
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    let admissionId: string | undefined;
    if (dto.emergencyCaseId) {
      const ec = await this.prisma.emergencyCase.findFirst({
        where: { id: dto.emergencyCaseId, tenantId },
        select: { id: true, patientId: true, admissionId: true },
      });
      if (!ec) throw new NotFoundException("Emergency case not found");
      if (ec.patientId !== dto.patientId)
        throw new BadRequestException(
          "Emergency case does not belong to the patient",
        );
      admissionId = ec.admissionId || undefined;
    } else {
      const erCase = await this.prisma.emergencyCase.findFirst({
        where: { tenantId, patientId: dto.patientId },
        select: { id: true },
      });
      if (!erCase)
        throw new BadRequestException("Patient has no emergency case");
    }

    const invoice = await this.billing.createInvoice(
      tenantId,
      {
        patientId: dto.patientId,
        type: "EMERGENCY" as any,
        admissionId,
        items: dto.items,
        discountAmount: dto.discountAmount,
        discountReason: dto.discountReason,
        taxPercent: dto.taxPercent,
        isCredit: dto.isCredit,
        notes: dto.notes || "Emergency services",
      } as any,
      userId,
    );

    return this.prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { items: true, payments: true },
    });
  }

  /** ER finance summary — the ONLY surface carrying ER revenue besides reports. */
  async billingSummary(tenantId: string) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const last30 = new Date(dayStart);
    last30.setDate(last30.getDate() - 29);

    const [todayAgg, monthAgg, methodGroups, byTriage, admitted, open] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: {
            tenantId,
            type: "EMERGENCY" as any,
            issuedDate: { gte: dayStart },
            status: { not: "CANCELLED" as any },
          },
          _sum: { totalAmount: true, paidAmount: true },
          _count: true,
        }),
        this.prisma.invoice.aggregate({
          where: {
            tenantId,
            type: "EMERGENCY" as any,
            issuedDate: { gte: last30 },
            status: { not: "CANCELLED" as any },
          },
          _sum: { totalAmount: true, paidAmount: true, dueAmount: true },
        }),
        this.prisma.payment.groupBy({
          by: ["method"],
          _sum: { amount: true },
          where: {
            tenantId,
            paidAt: { gte: last30 },
            invoice: { type: "EMERGENCY" as any },
          },
        }),
        this.prisma.emergencyCase.groupBy({
          by: ["triageLevel"],
          _count: true,
          where: { tenantId, createdAt: { gte: last30 } },
        }),
        this.prisma.emergencyCase.count({
          where: { tenantId, admitted: true, dischargedAt: null },
        }),
        this.prisma.emergencyCase.count({
          where: { tenantId, dischargedAt: null },
        }),
      ]);

    const num = (v: unknown) => Number(v) || 0;
    const collectionByMethod: Record<string, number> = {};
    for (const g of methodGroups) collectionByMethod[g.method] = num(g._sum.amount);

    return {
      today: {
        bills: todayAgg._count,
        billed: num(todayAgg._sum.totalAmount),
        collected: num(todayAgg._sum.paidAmount),
      },
      last30Days: {
        billed: num(monthAgg._sum.totalAmount),
        collected: num(monthAgg._sum.paidAmount),
        outstanding: num(monthAgg._sum.dueAmount),
      },
      collectionByMethod,
      casesByTriage: byTriage.map((g) => ({
        triage: g.triageLevel || "UNSET",
        count: g._count,
      })),
      activeCases: open,
      admittedNow: admitted,
    };
  }

  /** Extended ER dashboard for the dedicated role workspace. */
  async getDashboard(tenantId: string) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const erWard = await this.prisma.ward.findFirst({
      where: { tenantId, name: { contains: "Emergency", mode: "insensitive" } },
      select: { id: true, name: true },
    });

    const [total, today, admitted, dischargedToday, triageGroups, revenueToday, beds] =
      await Promise.all([
        this.prisma.emergencyCase.count({ where: { tenantId } }),
        this.prisma.emergencyCase.count({
          where: { tenantId, createdAt: { gte: dayStart } },
        }),
        this.prisma.emergencyCase.count({
          where: { tenantId, admitted: true, dischargedAt: null },
        }),
        this.prisma.emergencyCase.count({
          where: { tenantId, dischargedAt: { gte: dayStart } },
        }),
        this.prisma.emergencyCase.groupBy({
          by: ["triageLevel"],
          _count: true,
          where: {
            tenantId,
            dischargedAt: null,
            triageLevel: { not: null },
          },
        }),
        this.prisma.invoice.aggregate({
          where: {
            tenantId,
            type: "EMERGENCY" as any,
            issuedDate: { gte: dayStart },
            status: { not: "CANCELLED" as any },
          },
          _sum: { totalAmount: true, paidAmount: true },
          _count: true,
        }),
        erWard
          ? this.prisma.bed.findMany({
              where: { tenantId, wardId: erWard.id, isActive: true },
              select: { id: true, status: true, bedNumber: true },
            })
          : Promise.resolve([] as Array<{
              id: string;
              status: string;
              bedNumber: string;
            }>),
      ]);

    const bedsFree = beds.filter((b) => b.status !== "OCCUPIED").length;
    const num = (v: unknown) => Number(v) || 0;

    return {
      total,
      today,
      currentlyAdmitted: admitted,
      dischargedToday,
      byTriage: triageGroups.map((g) => ({
        triage: g.triageLevel as string,
        count: g._count,
      })),
      revenueToday: {
        billed: num(revenueToday._sum.totalAmount),
        collected: num(revenueToday._sum.paidAmount),
        bills: revenueToday._count,
      },
      beds: {
        wardId: erWard?.id ?? null,
        wardName: erWard?.name ?? null,
        total: beds.length,
        free: bedsFree,
      },
    };
  }

  servicePresets() {
    return EMERGENCY_SERVICE_PRESETS;
  }

  private async generateCaseNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.emergencyCase.findFirst({
      where: { tenantId, caseNumber: { startsWith: `ER-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { caseNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.caseNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `ER-${ymd}-${String(seq).padStart(4, "0")}`;
  }

  private async generateAdmissionNumber(
    tx: { admission: { findFirst: (args: any) => Promise<any> } },
    tenantId: string,
  ): Promise<string> {
    const today = new Date();
    const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const latest = await tx.admission.findFirst({
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
}
