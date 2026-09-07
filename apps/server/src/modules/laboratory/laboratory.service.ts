import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { buildLabReportPdf } from "./lab-report-pdf";

export interface CreateLabTestDto {
  name: string;
  code?: string;
  category?: string;
  specimenType?: string;
  container?: string;
  quantity?: string;
  referenceRange?: string;
  unit?: string;
  price?: number;
  turnaroundTime?: number;
  discipline?: string;
}

export interface CreateLabOrderDto {
  patientId: string;
  encounterId?: string;
  doctorId?: string;
  isStat?: boolean;
  isEmergency?: boolean;
  clinicalNote?: string;
  items: Array<{
    labTestId?: string;
    testName: string;
    price?: number;
  }>;
}

export interface LabOrderSearchParams {
  patientId?: string;
  status?: string;
  from?: string;
  to?: string;
  query?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const ORDER_FLOW: Record<string, string[]> = {
  ORDERED: ["SAMPLE_COLLECTED", "CANCELLED", "REJECTED"],
  SAMPLE_COLLECTED: ["RECEIVED", "REJECTED"],
  RECEIVED: ["PROCESSING"],
  PROCESSING: ["RESULT_READY", "REJECTED"],
  RESULT_READY: ["VERIFIED"],
  VERIFIED: ["APPROVED"],
  APPROVED: ["REPORTED"],
  REPORTED: [],
  REJECTED: [],
};

@Injectable()
export class LaboratoryService {
  private readonly logger = new Logger(LaboratoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Lab Test Catalog ----------

  private static readonly TEST_FIELDS = [
    "name",
    "code",
    "category",
    "specimenType",
    "container",
    "quantity",
    "referenceRange",
    "unit",
    "price",
    "turnaroundTime",
    "discipline",
  ];

  private whitelistTest(dto: CreateLabTestDto): Record<string, any> {
    const data: Record<string, any> = {};
    for (const field of LaboratoryService.TEST_FIELDS) {
      if ((dto as any)[field] !== undefined) data[field] = (dto as any)[field];
    }
    return data;
  }

  async createTest(tenantId: string, dto: CreateLabTestDto) {
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Test name is required");
    const data = this.whitelistTest(dto);
    data.price = Number(dto.price) || 0;
    return this.prisma.labTest.create({
      data: { tenantId, ...data } as any,
    });
  }

  async findTests(
    tenantId: string,
    params: {
      category?: string;
      query?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 50;

    const where: any = { tenantId };
    if (params.category) where.category = params.category;
    const q = params.query || params.search;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.labTest.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.labTest.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findTestById(tenantId: string, id: string) {
    const test = await this.prisma.labTest.findFirst({
      where: { id, tenantId },
    });
    if (!test) throw new NotFoundException("Lab test not found");
    return test;
  }

  async updateTest(
    tenantId: string,
    id: string,
    dto: Partial<CreateLabTestDto>,
  ) {
    await this.findTestById(tenantId, id);
    const data = this.whitelistTest(dto as CreateLabTestDto);
    return this.prisma.labTest.update({ where: { id }, data: data as any });
  }

  // ---------- Lab Orders ----------

  async createOrder(tenantId: string, dto: CreateLabOrderDto, userId?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("At least one lab test is required");
    }

    let doctor: any = null;
    if (dto.doctorId) {
      doctor = await this.prisma.doctorProfile.findFirst({
        where: { id: dto.doctorId, tenantId },
      });
      if (!doctor) throw new NotFoundException("Doctor not found");
    }

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, tenantId },
        select: { id: true, patientId: true },
      });
      if (!encounter) throw new NotFoundException("Encounter not found");
      if (encounter.patientId !== dto.patientId)
        throw new BadRequestException(
          "Encounter does not belong to this patient",
        );
    }

    const catalog = await this.prisma.labTest.findMany({
      where: { tenantId, isActive: true },
    });
    const catalogById = new Map(catalog.map((t) => [t.id, t]));

    const orderNumber = await this.generateOrderNumber(tenantId);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labOrder.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          encounterId: dto.encounterId,
          doctorId: doctor?.id || dto.doctorId,
          orderNumber,
          isStat: dto.isStat || false,
          isEmergency: dto.isEmergency || false,
          clinicalNote: dto.clinicalNote,
          items: {
            create: dto.items.map((item) => {
              if (!item.testName || !String(item.testName).trim()) {
                throw new BadRequestException(
                  "Every order item requires a test name",
                );
              }
              const catalogItem = item.labTestId
                ? catalogById.get(item.labTestId)
                : undefined;
              return {
                tenantId,
                labTestId: item.labTestId,
                testName: item.testName,
                price: catalogItem
                  ? Number(catalogItem.price)
                  : Number(item.price) || 0,
              };
            }),
          },
        },
        include: { items: true },
      });
      return created;
    });

    await this.logAudit(tenantId, userId, "CREATE", "LabOrder", order.id);
    return order;
  }

  async findOrders(tenantId: string, params: LabOrderSearchParams) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;
    const q = params.query || params.search;
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
      ];
    }
    if (params.from || params.to) {
      where.orderedAt = {};
      if (params.from) where.orderedAt.gte = this.normalizeDate(params.from);
      if (params.to) {
        const to = this.normalizeDate(params.to);
        to.setHours(23, 59, 59, 999);
        where.orderedAt.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.labOrder.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
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
            lastName: true,
            mrn: true,
            gender: true,
            dateOfBirth: true,
          },
        },
        encounter: true,
        items: true,
        samples: true,
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");
    return order;
  }

  async transitionStatus(
    tenantId: string,
    id: string,
    toStatus: string,
    userId?: string,
  ) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    const allowed = ORDER_FLOW[order.status] || [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(
        `Cannot transition ${order.status} -> ${toStatus}`,
      );
    }

    const data: any = { status: toStatus as any };
    switch (toStatus) {
      case "SAMPLE_COLLECTED":
        data.collectedAt = new Date();
        break;
      case "RECEIVED":
        data.receivedAt = new Date();
        break;
      case "PROCESSING":
        data.processedAt = new Date();
        break;
      case "REPORTED":
        data.reportedAt = new Date();
        break;
      case "VERIFIED":
        data.verifiedAt = new Date();
        data.verifiedBy = userId;
        break;
      case "APPROVED":
        data.approvedAt = new Date();
        data.approvedBy = userId;
        break;
    }

    const updated = await this.prisma.labOrder.update({ where: { id }, data });

    if (toStatus === "SAMPLE_COLLECTED") {
      await this.prisma.labSample
        .create({
          data: {
            tenantId,
            labOrderId: id,
            patientId: order.patientId,
            specimenType: "BLOOD",
            collectedAt: new Date(),
            collectedBy: userId,
            status: "COLLECTED",
          },
        })
        .catch((err) =>
          this.logger.warn("labSample create failed", err),
        );
    }

    await this.logAudit(tenantId, userId, "UPDATE", "LabOrder", id, {
      status: toStatus,
    });
    return updated;
  }

  async addSample(
    tenantId: string,
    id: string,
    dto: { specimenType: string; container?: string; quantity?: string },
    userId?: string,
  ) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    return this.prisma.labSample.create({
      data: {
        tenantId,
        labOrderId: id,
        patientId: order.patientId,
        specimenType: dto.specimenType,
        container: dto.container,
        quantity: dto.quantity,
        status: "COLLECTED",
        collectedAt: new Date(),
        collectedBy: userId,
      },
    });
  }

  async enterResult(
    tenantId: string,
    orderId: string,
    itemId: string,
    dto: {
      result?: string;
      resultValue?: number;
      unit?: string;
      referenceRange?: string;
      isAbnormal?: boolean;
      isCritical?: boolean;
      notes?: string;
    },
    userId?: string,
  ) {
    const item = await this.prisma.labOrderItem.findFirst({
      where: { id: itemId, labOrderId: orderId },
      include: { labOrder: true },
    });
    if (!item) throw new NotFoundException("Lab order item not found");
    if (item.labOrder.tenantId !== tenantId)
      throw new NotFoundException("Lab order not found");
    if (["CANCELLED", "REJECTED"].includes(item.labOrder.status)) {
      throw new BadRequestException(
        `Cannot enter results on a ${item.labOrder.status.toLowerCase()} order`,
      );
    }

    const data: any = { ...dto };
    if (dto.resultValue !== undefined && dto.resultValue !== null) {
      data.resultValue = dto.resultValue;
    }

    if (
      dto.resultValue !== undefined &&
      dto.resultValue !== null &&
      dto.referenceRange
    ) {
      const flags = this.evaluateReferenceRange(
        dto.resultValue,
        dto.referenceRange,
      );
      if (flags.isCritical) {
        data.isCritical = true;
        data.isAbnormal = true;
      } else if (flags.isAbnormal && dto.isAbnormal === undefined) {
        data.isAbnormal = true;
      }
    }

    data.status = "RESULT_ENTERED";

    const updated = await this.prisma.labOrderItem.update({
      where: { id: itemId },
      data,
    });

    const isCritical =
      updated.isCritical === true ||
      (dto.resultValue !== undefined &&
        dto.resultValue !== null &&
        dto.referenceRange !== undefined &&
        this.evaluateReferenceRange(dto.resultValue, dto.referenceRange)
          .isCritical);

    if (isCritical) {
      await this.alertCriticalResult(tenantId, itemId, orderId, updated);
    }

    await this.prisma.labOrder
      .update({
        where: { id: orderId },
        data: { status: "RESULT_READY", processedAt: new Date() },
      })
      .catch((err) =>
        this.logger.warn("labOrder status update after result failed", err),
      );

    await this.logAudit(tenantId, userId, "UPDATE", "LabOrder", orderId, {
      action: "RESULT_ENTERED",
      itemId,
      isCritical: isCritical ?? false,
    });
    return updated;
  }

  private evaluateReferenceRange(
    value: number,
    range: string,
  ): { isCritical: boolean; isAbnormal: boolean } {
    const criticalMatch = range.match(/^critical[:\s]+(.+)$/i);
    const normalRange = criticalMatch ? criticalMatch[1] : range;

    const parseBounds = (r: string) => {
      const m = r.match(/(?:<|<=)?\s*(\d+\.?\d*)\s*[-–—]\s*(?:>|>=)?\s*(\d+\.?\d*)/);
      if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) };
      const low = r.match(/(?:>=?)\s*(\d+\.?\d*)/);
      const high = r.match(/<=\s*(\d+\.?\d*)/);
      return {
        low: low ? parseFloat(low[1]) : undefined,
        high: high ? parseFloat(high[1]) : undefined,
      };
    };

    const bounds = parseBounds(normalRange);
    if (bounds.low !== undefined && bounds.high !== undefined) {
      return {
        isCritical: value < bounds.low * 0.5 || value > bounds.high * 2,
        isAbnormal: value < bounds.low || value > bounds.high,
      };
    }
    if (bounds.low !== undefined) {
      return {
        isCritical: value < bounds.low * 0.5,
        isAbnormal: value < bounds.low,
      };
    }
    if (bounds.high !== undefined) {
      return {
        isCritical: value > bounds.high * 2,
        isAbnormal: value > bounds.high,
      };
    }
    return { isCritical: false, isAbnormal: false };
  }

  private async alertCriticalResult(
    tenantId: string,
    itemId: string,
    orderId: string,
    item: any,
  ) {
    try {
      const order = await this.prisma.labOrder.findUnique({
        where: { id: orderId },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        },
      });
      if (!order) return;

      const targetUserIds: string[] = [];
      if (order.doctorId) targetUserIds.push(order.doctorId);
      if (order.patientId) {
        const admissions = await this.prisma.admission.findFirst({
          where: { tenantId, patientId: order.patientId, status: "ADMITTED" },
          select: { admittingDoctorId: true },
        });
        if (admissions?.admittingDoctorId) {
          targetUserIds.push(admissions.admittingDoctorId);
        }
      }

      const unique = [...new Set(targetUserIds.filter(Boolean))];
      const testName = item.testName || "Lab test";
      for (const userId of unique) {
        this.notifications
          .create(tenantId, {
            userId,
            title: "CRITICAL Lab Result",
            body: `Critical ${testName} result for ${order.patient?.firstName ?? ""} ${order.patient?.lastName ?? ""} (MRN ${order.patient?.mrn ?? "N/A"}). Value: ${item.resultValue ?? item.result ?? "N/A"} ${item.unit ?? ""}`,
            type: "CRITICAL_LAB_RESULT",
            referenceType: "LabOrder",
            referenceId: orderId,
          })
          .catch((err) =>
            this.logger.warn("critical lab result notification failed", err),
          );
      }
    } catch {}
  }

  async getPendingResultOrders(tenantId: string) {
    return this.prisma.labOrder.findMany({
      where: { tenantId, status: { in: ["PROCESSING", "RESULT_READY"] } },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        items: true,
      },
      orderBy: { orderedAt: "desc" },
    });
  }

  async generateReportPdf(tenantId: string, orderId: string, userId?: string): Promise<Buffer> {
    const order = await this.prisma.labOrder.findFirst({
      where: { id: orderId, tenantId },
      include: {
        patient: { select: { id: true, firstName: true, middleName: true, lastName: true, mrn: true, phone: true, gender: true, dateOfBirth: true } },
        items: true,
        samples: true,
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const doctor = order.doctorId
      ? await this.prisma.doctorProfile.findFirst({ where: { id: order.doctorId, tenantId }, include: { user: { select: { firstName: true, middleName: true, lastName: true } } } })
      : null;

    let generatedBy: string | undefined;
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      if (user) generatedBy = [user.firstName, user.lastName].filter(Boolean).join(" ");
    }

    return buildLabReportPdf(
      {
        ...order,
        doctor: doctor as any,
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
      },
      generatedBy,
    );
  }

  async rejectSample(tenantId: string, orderId: string, sampleId: string, reason: string, note?: string, userId?: string) {
    const order = await this.prisma.labOrder.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException("Lab order not found");

    const sample = await this.prisma.labSample.findFirst({ where: { id: sampleId, labOrderId: orderId, tenantId } });
    if (!sample) throw new NotFoundException("Sample not found");

    const updated = await this.prisma.labSample.update({
      where: { id: sampleId },
      data: { status: "REJECTED", rejectionReason: reason as any, rejectionNote: note },
    });

    await this.logAudit(tenantId, userId, "REJECT", "LabSample", sampleId, { reason, note } as any);
    return updated;
  }

  async getLabSummary(tenantId: string) {
    const [totalTests, totalOrders, pendingOrders, completedToday, sampleCollected] =
      await Promise.all([
        this.prisma.labTest.count({ where: { tenantId, isActive: true } }),
        this.prisma.labOrder.count({ where: { tenantId } }),
        this.prisma.labOrder.count({ where: { tenantId, status: { in: ["ORDERED", "SAMPLE_COLLECTED", "RECEIVED", "PROCESSING"] } } }),
        this.prisma.labOrder.count({ where: { tenantId, status: { in: ["VERIFIED", "APPROVED", "REPORTED"] }, updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
        this.prisma.labSample.count({ where: { tenantId, status: "COLLECTED" } }),
      ]);
    return { totalTests, totalOrders, pendingOrders, completedToday, sampleCollected };
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
