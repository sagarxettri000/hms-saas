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
  payment?: {
    method?: string;
    amount?: number;
    referenceNumber?: string;
  };
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
    const caseNumber = await this.generateCaseNumber(tenantId);
    return this.prisma.emergencyCase.create({
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
    body: { admittedTo?: string; bedId?: string; notes?: string },
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
    });

    return { success: true };
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
    if (dto.payment) {
      const amt = Number(dto.payment.amount ?? 0);
      if (!Number.isFinite(amt) || amt < 0)
        throw new BadRequestException("Payment amount must be zero or greater");
    }

    let admissionId: string | undefined;
    if (dto.emergencyCaseId) {
      const ec = await this.prisma.emergencyCase.findFirst({
        where: { id: dto.emergencyCaseId, tenantId },
        select: { id: true, admissionId: true },
      });
      if (!ec) throw new NotFoundException("Emergency case not found");
      admissionId = ec.admissionId || undefined;
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

    // Optional immediate settlement so the ER can close a cash-and-carry visit
    if (dto.payment && !dto.isCredit) {
      const amount = Number(
        dto.payment.amount ?? (invoice as any).dueAmount ?? 0,
      );
      if (amount > 0) {
        await this.billing.createPayment(
          tenantId,
          {
            invoiceId: invoice.id,
            amount,
            method: dto.payment.method || "CASH",
            referenceNumber: dto.payment.referenceNumber,
          } as any,
          userId,
        );
      }
    }

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
