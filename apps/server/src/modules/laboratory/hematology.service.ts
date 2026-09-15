import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LaboratoryService } from "./laboratory.service";
import { buildLabReportPdf } from "./lab-report-pdf";
import {
  HEMATOLOGY_BY_CODE,
  HEMATOLOGY_CATALOG,
  HEMATOLOGY_PANEL,
  HematologyRange,
  rangeDisplay,
  resolveReferenceRange,
  evaluateFlag,
  ResolvedRange,
} from "./hematology-catalog";

export interface CreateHematologyOrderDto {
  patientId: string;
  encounterId?: string;
  admissionId?: string;
  doctorId?: string;
  isStat?: boolean;
  isEmergency?: boolean;
  clinicalNote?: string;
}

export interface EnterHematologyResultDto {
  resultValue?: number | null;
  result?: string | null;
  unit?: string;
  notes?: string;
}

export interface HematologyListParams {
  status?: string;
  patientId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

const IMMUTABLE_STATUSES = ["VERIFIED", "APPROVED", "REPORTED"];
const BLOCKED_STATUSES = ["REJECTED", "CANCELLED"];

@Injectable()
export class HematologyService {
  private readonly logger = new Logger(HematologyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly laboratory: LaboratoryService,
  ) {}

  // ---------- Catalog ----------

  async ensureCatalog(tenantId: string) {
    const existing = await this.prisma.labTest.findMany({
      where: { tenantId, discipline: "HEMATOLOGY", code: { in: HEMATOLOGY_CATALOG.map((t) => t.code) } },
      select: { code: true },
    });
    const have = new Set(existing.map((t) => t.code));

    await this.prisma.$transaction(async (tx) => {
      for (const def of HEMATOLOGY_CATALOG) {
        if (have.has(def.code)) continue;
        await tx.labTest.create({
          data: {
            tenantId,
            name: def.name,
            code: def.code,
            category: def.category,
            specimenType: def.specimenType,
            container: def.container,
            unit: def.unit,
            price: 0,
            discipline: def.discipline,
            method: def.method,
            precision: def.precision,
            resultType: def.resultType,
            referenceRanges: def.ranges as unknown as Prisma.InputJsonValue,
            sortOrder: HEMATOLOGY_CATALOG.indexOf(def),
            turnaroundTime: def.turnaroundTime,
            status: "ACTIVE",
            isActive: true,
          } as any,
        });
      }

      const panel = await tx.labTestPanel.findFirst({ where: { tenantId, code: HEMATOLOGY_PANEL.code } });
      if (!panel) {
        await tx.labTestPanel.create({
          data: {
            tenantId,
            name: HEMATOLOGY_PANEL.name,
            code: HEMATOLOGY_PANEL.code,
            category: HEMATOLOGY_PANEL.category,
            specimenType: HEMATOLOGY_PANEL.specimenType,
            container: HEMATOLOGY_PANEL.container,
            description: HEMATOLOGY_PANEL.description,
            price: 0,
            isActive: true,
          } as any,
        });
      }
    });

    return this.findCatalog(tenantId);
  }

async findCatalog(tenantId: string) {
    const tests = tenantId
      ? await this.prisma.labTest.findMany({
          where: { tenantId, discipline: "HEMATOLOGY", isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        })
      : [];

    const panel = tenantId
      ? await this.prisma.labTestPanel.findFirst({
          where: { tenantId, code: HEMATOLOGY_PANEL.code, isActive: true },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
              include: { labTest: true },
            },
          },
        })
      : null;

    return {
      panel: panel
        ? { id: panel.id, name: panel.name, code: panel.code, price: Number(panel.price) }
        : null,
      tests: tests.map((t) => this.serializeTest(t)),
    };
  }

  private serializeTest(t: any) {
    let ranges: HematologyRange[] = [];
    if (t.referenceRanges) {
      try {
        ranges = Array.isArray(t.referenceRanges) ? (t.referenceRanges as HematologyRange[]) : [];
      } catch {
        ranges = [];
      }
    }
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      category: t.category,
      specimenType: t.specimenType,
      container: t.container,
      unit: t.unit,
      method: t.method,
      precision: t.precision,
      resultType: t.resultType,
      referenceRange: t.referenceRange || undefined,
      ranges,
      sortOrder: t.sortOrder ?? undefined,
      turnaroundTime: t.turnaroundTime ?? undefined,
    };
  }

  // ---------- Orders ----------

  async createOrder(tenantId: string, dto: CreateHematologyOrderDto, userId?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, tenantId },
        select: { id: true, patientId: true },
      });
      if (!encounter) throw new NotFoundException("Encounter not found");
      if (encounter.patientId !== dto.patientId) {
        throw new BadRequestException("Encounter does not belong to this patient");
      }
    }

    if (dto.doctorId) {
      const doctor = await this.prisma.doctorProfile.findFirst({ where: { id: dto.doctorId, tenantId } });
      if (!doctor) throw new NotFoundException("Doctor not found");
    }

    const catalog = await this.ensureCatalog(tenantId);
    const memberIds = new Map<string, string>();
    for (const t of catalog.tests) {
      if (HEMATOLOGY_PANEL.memberCodes.includes(t.code ?? "")) memberIds.set(t.code!, t.id);
    }
    const missing = HEMATOLOGY_PANEL.memberCodes.filter((c) => !memberIds.has(c));
    if (missing.length > 0) {
      throw new BadRequestException(`Hematology catalog incomplete: ${missing.join(", ")}`);
    }

    const orderNumber = await this.generateOrderNumber(tenantId);

    const items = HEMATOLOGY_PANEL.memberCodes.map((code) => {
      const def = HEMATOLOGY_BY_CODE[code]!;
      return {
        tenantId,
        labTestId: memberIds.get(code)!,
        testName: def.name,
        price: 0,
        method: def.method,
        precision: def.precision,
        resultType: def.resultType,
      };
    });

    const order = await this.prisma.labOrder.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        admissionId: dto.admissionId,
        doctorId: dto.doctorId,
        orderNumber,
        isStat: dto.isStat || false,
        isEmergency: dto.isEmergency || false,
        clinicalNote: dto.clinicalNote,
        items: { create: items },
      } as any,
      include: { items: true },
    });

    await this.logAudit(tenantId, userId, "CREATE", "LabOrder", order.id, {
      module: "HEMATOLOGY",
      panel: HEMATOLOGY_PANEL.code,
    });
    return order;
  }

  async findOrders(tenantId: string, params: HematologyListParams) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;

    const hematologyItemsFilter: any = [
      { items: { some: { labTest: { discipline: "HEMATOLOGY" } } } },
      {
        items: {
          some: {
            OR: HEMATOLOGY_CATALOG.map((t) => ({ testName: t.name })),
          },
        },
      },
    ];

    const andClauses: any[] = [{ OR: hematologyItemsFilter }];
    if (params.search) {
      andClauses.push({ orderNumber: { contains: params.search, mode: "insensitive" } });
    }
    if (params.from || params.to) {
      const range: any = {};
      if (params.from) range.gte = new Date(params.from);
      if (params.to) {
        const to = new Date(params.to);
        to.setHours(23, 59, 59, 999);
        range.lte = to;
      }
      andClauses.push({ orderedAt: range });
    }

    where.AND = andClauses;

    const [data, total] = await Promise.all([
      this.prisma.labOrder.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
          items: true,
        },
        orderBy: { orderedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.labOrder.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOrderById(tenantId: string, id: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
            hospitalNumber: true,
            gender: true,
            dateOfBirth: true,
            age: true,
          },
        },
        encounter: true,
        items: {
          include: { labTest: { select: { id: true, code: true, method: true, precision: true, referenceRanges: true } } },
        },
        samples: true,
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    const patientSex = (order.patient?.gender as string) || null;
    const items = order.items.map((it: any) => {
      const ranges = this.parseRanges(it.labTest?.referenceRanges);
      const resolved = resolveReferenceRange(
        { ranges, unit: it.unit ?? it.labTest?.unit ?? "", code: it.labTest?.code ?? undefined },
        patientSex,
      );
      return this.serializeItem(it, resolved);
    });

    return { ...order, items };
  }

  async getReport(tenantId: string, id: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
            hospitalNumber: true,
            gender: true,
            dateOfBirth: true,
            age: true,
          },
        },
        items: {
          include: { labTest: { select: { id: true, code: true, method: true, precision: true, referenceRanges: true, unit: true } } },
        },
        samples: true,
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    const patientSex = (order.patient?.gender as string) || null;
    const [verifiedBy, approvedBy, reportedBy] = await Promise.all([
      order.verifiedBy ? this.findUserName(order.verifiedBy) : null,
      order.approvedBy ? this.findUserName(order.approvedBy) : null,
      order.reportedAt && order.approvedBy ? this.findUserName(order.approvedBy) : null,
    ]);

    const items = order.items.map((it: any) => {
      const ranges = this.parseRanges(it.labTest?.referenceRanges);
      const resolved = resolveReferenceRange(
        { ranges, unit: it.unit ?? it.labTest?.unit ?? "", code: it.labTest?.code ?? undefined },
        patientSex,
      );
      return this.serializeItem(it, resolved);
    });

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      isStat: order.isStat,
      isEmergency: order.isEmergency,
      orderedAt: order.orderedAt,
      collectedAt: order.collectedAt,
      receivedAt: order.receivedAt,
      processedAt: order.processedAt,
      verifiedAt: order.verifiedAt,
      approvedAt: order.approvedAt,
      reportedAt: order.reportedAt,
      verifiedByName: verifiedBy,
      approvedByName: approvedBy,
      clinicalNote: order.clinicalNote,
      patient: {
        name: [order.patient?.firstName, order.patient?.middleName, order.patient?.lastName].filter(Boolean).join(" ") || "",
        mrn: order.patient?.mrn,
        hospitalNumber: order.patient?.hospitalNumber,
        gender: order.patient?.gender,
        age: order.patient?.age,
        dateOfBirth: order.patient?.dateOfBirth,
      },
      samples: (order.samples || []).map((s: any) => ({
        specimenType: s.specimenType,
        barcode: s.barcode,
        container: s.container,
        status: s.status,
        collectedAt: s.collectedAt,
      })),
      items,
    };
  }

  private serializeItem(item: any, resolved: ResolvedRange | null) {
    return {
      id: item.id,
      testName: item.testName,
      labTestCode: item.labTest?.code ?? null,
      resultValue: item.resultValue != null ? Number(item.resultValue) : null,
      result: item.result,
      unit: item.unit || "",
      precision: item.precision ?? item.labTest?.precision ?? 2,
      method: item.method || item.labTest?.method || "",
      referenceRange: item.referenceRange || rangeDisplay(resolved) || (resolved ? `${resolved.label}${resolved.note ? ` (${resolved.note})` : ""}` : ""),
      rangeLabel: item.rangeLabel || resolved?.label || "",
      flag: item.isCritical ? "CRITICAL" : item.isAbnormal ? "ABNORMAL" : "NORMAL",
      isAbnormal: Boolean(item.isAbnormal),
      isCritical: Boolean(item.isCritical),
      status: item.status,
      notes: item.notes,
      resultEnteredBy: item.resultEnteredBy,
      resultEnteredAt: item.resultEnteredAt,
    };
  }

  // ---------- Result entry ("perform") ----------

  async enterResult(
    tenantId: string,
    orderId: string,
    itemId: string,
    dto: EnterHematologyResultDto,
    userId?: string,
  ) {
    const item = await this.prisma.labOrderItem.findFirst({
      where: { id: itemId, labOrderId: orderId },
      include: {
        labOrder: { include: { patient: { select: { gender: true } } } },
        labTest: { select: { id: true, code: true, method: true, precision: true, unit: true, referenceRanges: true } },
      },
    });
    if (!item) throw new NotFoundException("Lab order item not found");
    if (item.labOrder.tenantId !== tenantId) throw new NotFoundException("Lab order not found");

    const orderStatus = item.labOrder.status as string;
    if (BLOCKED_STATUSES.includes(orderStatus)) {
      throw new BadRequestException(`Cannot enter results on a ${orderStatus.toLowerCase()} order`);
    }
    if (IMMUTABLE_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Results are finalized for this order and cannot be edited");
    }

    if (dto.resultValue !== undefined && dto.resultValue !== null && Number.isNaN(Number(dto.resultValue))) {
      throw new BadRequestException("Invalid numeric result value");
    }

    const patientSex = (item.labOrder.patient?.gender as string) || null;
    const ranges = this.parseRanges(item.labTest?.referenceRanges);
    const resolved = resolveReferenceRange(
      { ranges, unit: item.unit ?? item.labTest?.unit ?? "", code: item.labTest?.code ?? undefined },
      patientSex,
    );

    let isAbnormal = false;
    let isCritical = false;
    if (Number.isFinite(Number(dto.resultValue)) && dto.resultValue !== null && dto.resultValue !== undefined) {
      const flag = evaluateFlag(Number(dto.resultValue), resolved);
      isAbnormal = flag.isAbnormal;
      isCritical = flag.isCritical;
    }

    const data: any = {
      status: "RESULT_ENTERED",
      isAbnormal,
      isCritical,
      resultEnteredBy: userId || null,
      resultEnteredAt: new Date(),
    };

    if (dto.resultValue !== undefined) {
      data.resultValue = dto.resultValue;
    }
    if (dto.result !== undefined && dto.result !== null) {
      data.result = dto.result;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;

    const method = item.method || item.labTest?.method || null;
    const precision = item.precision ?? item.labTest?.precision ?? null;
    const unit = dto.unit || item.unit || item.labTest?.unit || null;

    if (method != null) data.method = method;
    if (precision != null) data.precision = precision;
    if (unit != null) data.unit = unit;
    if (resolved) {
      data.refLow = resolved.low;
      data.refHigh = resolved.high;
      data.rangeLabel = resolved.label;
      data.referenceRange =
        (resolved.label ? `${resolved.label}: ` : "") +
        rangeDisplay(resolved) +
        (resolved.unit ? ` ${resolved.unit}` : "");
    }

    const updated = await this.prisma.labOrderItem.update({ where: { id: itemId }, data });

    await this.prisma.labOrder.update({
      where: { id: orderId },
      data: { status: "RESULT_READY", processedAt: new Date() },
    }).catch((err) => this.logger.warn("lab order status update failed", err));

    if (isCritical) {
      await this.alertCriticalResult(tenantId, orderId, updated);
    }

    await this.logAudit(tenantId, userId, "UPDATE", "LabOrder", orderId, {
      action: "HEMATOLOGY_RESULT_ENTERED",
      itemId,
      isCritical,
      method: method || undefined,
    });

    return updated;
  }

  async verify(tenantId: string, id: string, userId?: string) {
    const incomplete = await this.prisma.labOrderItem.count({
      where: { labOrderId: id, status: { not: "RESULT_ENTERED" } },
    });
    if (incomplete > 0) {
      throw new BadRequestException("All panel results must be entered before verification");
    }
    return this.laboratory.transitionStatus(tenantId, id, "VERIFIED", userId);
  }

  async approve(tenantId: string, id: string, userId?: string) {
    return this.laboratory.transitionStatus(tenantId, id, "APPROVED", userId);
  }

  async report(tenantId: string, id: string, userId?: string) {
    return this.laboratory.transitionStatus(tenantId, id, "REPORTED", userId);
  }

  // ---------- PDF ----------

  async generateReportPdf(tenantId: string, id: string, userId?: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
      include: {
        patient: { select: { firstName: true, middleName: true, lastName: true, mrn: true, hospitalNumber: true, gender: true, dateOfBirth: true } },
        items: {
          include: { labTest: { select: { id: true, code: true, method: true, precision: true, referenceRanges: true, unit: true } } },
        },
        samples: true,
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const patientSex = (order.patient?.gender as string) || null;
    const [verifiedByName, approvedByName] = await Promise.all([
      order.verifiedBy ? this.findUserName(order.verifiedBy) : null,
      order.approvedBy ? this.findUserName(order.approvedBy) : null,
    ]);

    let generatedBy: string | undefined;
    if (userId) {
      generatedBy = await this.findUserName(userId) ?? undefined;
    }

    const items = order.items.map((it: any) => {
      const ranges = this.parseRanges(it.labTest?.referenceRanges);
      const resolved = resolveReferenceRange(
        { ranges, unit: it.unit ?? it.labTest?.unit ?? "", code: it.labTest?.code ?? undefined },
        patientSex,
      );
      return {
        ...it,
        precision: it.precision ?? it.labTest?.precision ?? 2,
        method: it.method || it.labTest?.method || "",
        referenceRange: it.referenceRange || rangeDisplay(resolved) || "",
      };
    });

    return buildLabReportPdf(
      {
        ...order,
        patient: {
          firstName: order.patient?.firstName || "",
          middleName: order.patient?.middleName,
          lastName: order.patient?.lastName || "",
          mrn: order.patient?.mrn,
          hospitalNumber: order.patient?.hospitalNumber,
          gender: order.patient?.gender,
          dateOfBirth: order.patient?.dateOfBirth,
        },
        items,
        reportTitle: "HEMATOLOGY REPORT",
        department: "Department of Pathology",
        verifiedByName: verifiedByName ?? undefined,
        approvedByName: approvedByName ?? undefined,
      } as any,
      {
        name: tenant.name || "Hospital",
        addressLine1: (tenant as any).addressLine1,
        addressLine2: (tenant as any).addressLine2,
        city: (tenant as any).city,
        district: (tenant as any).district,
        province: (tenant as any).province,
        country: (tenant as any).country,
        phone: tenant.phone ?? undefined,
        email: tenant.email ?? undefined,
        website: (tenant as any).website,
        panNumber: (tenant as any).panNumber,
        vatNumber: (tenant as any).vatNumber,
        registrationNumber: (tenant as any).registrationNumber,
      },
      generatedBy,
    );
  }

  // ---------- Internals ----------

  private parseRanges(json: unknown): HematologyRange[] {
    if (!json) return [];
    try {
      if (Array.isArray(json)) return json as HematologyRange[];
      return [];
    } catch {
      return [];
    }
  }

  private async findUserName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, middleName: true, lastName: true },
    });
    if (!user) return null;
    return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ");
  }

  private async alertCriticalResult(tenantId: string, orderId: string, item: any) {
    try {
      const order = await this.prisma.labOrder.findUnique({
        where: { id: orderId },
        include: { patient: { select: { firstName: true, lastName: true, mrn: true } } },
      });
      if (!order) return;
      const targets: string[] = [];
      if (order.doctorId) targets.push(order.doctorId);
      for (const userId of new Set(targets.filter(Boolean))) {
        this.notifications.create(tenantId, {
          userId,
          title: "CRITICAL Hematology Result",
          body: `Critical ${item.testName} result for ${order.patient?.firstName ?? ""} ${order.patient?.lastName ?? ""} (MRN ${order.patient?.mrn ?? "N/A"}). Value: ${item.resultValue ?? item.result ?? "N/A"} ${item.unit ?? ""}`,
          type: "CRITICAL_LAB_RESULT",
          referenceType: "LabOrder",
          referenceId: orderId,
        }).catch((err) => this.logger.warn("critical result notification failed", err));
      }
    } catch {}
  }

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.labOrder.findFirst({
      where: { tenantId, orderNumber: { startsWith: `LAB-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { orderNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.orderNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `LAB-${ymd}-${String(seq).padStart(4, "0")}`;
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
        data: { tenantId, userId, entity, entityId, action: action as any, metadata },
      });
    } catch (error) {
      this.logger.warn(`Failed to write audit log: ${error}`);
    }
  }
}



