import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { Hl7OutboundService } from "../hl7/hl7-outbound.service";
import { buildRadiologyReportPdf } from "./radiology-report-pdf";

export interface CreateRadiologyOrderDto {
  patientId: string;
  encounterId?: string;
  doctorId?: string;
  modality?: string;
  bodyPart?: string;
  isEmergency?: boolean;
  clinicalHistory?: string;
}

export interface RadiologyOrderSearchParams {
  patientId?: string;
  status?: string;
  modality?: string;
  query?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

const ORDER_FLOW: Record<string, string[]> = {
  ORDERED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["IMAGES_UPLOADED"],
  IMAGES_UPLOADED: ["REPORTED"],
  REPORTED: ["VERIFIED"],
  VERIFIED: ["APPROVED"],
  APPROVED: ["DELIVERED"],
  DELIVERED: [],
};

const RADIOLOGY_REPORTING_ROLES = new Set([
  "RADIOLOGIST",
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
  "PLATFORM_SUPER_ADMIN",
  "IT_ADMIN",
]);

@Injectable()
export class RadiologyService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly hl7Outbound?: Hl7OutboundService,
  ) {}

  private assertCanReport(role?: string) {
    if (role && !RADIOLOGY_REPORTING_ROLES.has(role)) {
      throw new ForbiddenException(
        "Only radiologists can write and verify radiology reports",
      );
    }
  }

  async create(
    tenantId: string,
    dto: CreateRadiologyOrderDto,
    userId?: string,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    if (dto.doctorId) {
      const doctor = await this.prisma.doctorProfile.findFirst({
        where: { id: dto.doctorId, tenantId },
        select: { id: true },
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

    const MODALITIES = [
      "XRAY",
      "CT",
      "MRI",
      "ULTRASOUND",
      "ECG",
      "ECHO",
      "OTHERS",
    ];
    const modality = dto.modality || "XRAY";
    if (!MODALITIES.includes(modality))
      throw new BadRequestException("Invalid radiology modality");

    const orderNumber = await this.generateOrderNumber(tenantId);

    const order = await this.prisma.radiologyOrder.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        doctorId: dto.doctorId,
        orderNumber,
        modality: modality as any,
        bodyPart: dto.bodyPart,
        isEmergency: dto.isEmergency || false,
        clinicalHistory: dto.clinicalHistory,
      },
    });

    await this.logAudit(tenantId, userId, "CREATE", "RadiologyOrder", order.id);
    return order;
  }

  async findAll(tenantId: string, params: RadiologyOrderSearchParams) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;
    if (params.modality) where.modality = params.modality;
    const q = params.query || params.search;
    if (q) {
      where.OR = [{ orderNumber: { contains: q, mode: "insensitive" } }];
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
      this.prisma.radiologyOrder.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          images: true,
        },
        orderBy: { orderedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.radiologyOrder.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(tenantId: string, id: string) {
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        encounter: true,
        images: true,
      },
    });
    if (!order) throw new NotFoundException("Radiology order not found");
    return order;
  }

  async transitionStatus(
    tenantId: string,
    id: string,
    toStatus: string,
    userId?: string,
    role?: string,
  ) {
    if (["REPORTED", "VERIFIED", "APPROVED"].includes(toStatus)) {
      this.assertCanReport(role);
    }
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Radiology order not found");

    const allowed = ORDER_FLOW[order.status] || [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(
        `Cannot transition ${order.status} -> ${toStatus}`,
      );
    }

    const data: any = { status: toStatus as any };
    switch (toStatus) {
      case "SCHEDULED":
        data.scheduledAt = new Date();
        break;
      case "IN_PROGRESS":
        data.performedAt = new Date();
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

    const updated = await this.prisma.radiologyOrder.update({
      where: { id },
      data,
    });
    await this.logAudit(tenantId, userId, "UPDATE", "RadiologyOrder", id, {
      status: toStatus,
    });
    if (["REPORTED", "VERIFIED"].includes(toStatus)) {
      void this.hl7Outbound?.sendRadiologyReportQuiet(tenantId, id, userId);
    }
    return updated;
  }

  async addImage(
    tenantId: string,
    id: string,
    dto: {
      fileName: string;
      filePath: string;
      mimeType: string;
      fileSize: number;
      description?: string;
    },
    userId?: string,
  ) {
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Radiology order not found");

    return this.prisma.radiologyImage.create({
      data: {
        radiologyOrderId: id,
        fileName: dto.fileName,
        filePath: dto.filePath,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        description: dto.description,
        uploadedBy: userId,
      },
    });
  }

  async writeReport(
    tenantId: string,
    id: string,
    dto: { findings?: string; impression?: string; report?: string },
    userId?: string,
    role?: string,
  ) {
    this.assertCanReport(role);
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Radiology order not found");

    const reportData: Record<string, unknown> = {};
    if (dto.findings !== undefined) reportData.findings = dto.findings;
    if (dto.impression !== undefined) reportData.impression = dto.impression;
    if (dto.report !== undefined) reportData.report = dto.report;

    const updated = await this.prisma.radiologyOrder.update({
      where: { id },
      data: { ...reportData, status: "REPORTED", reportedAt: new Date() },
    });

    await this.logAudit(tenantId, userId, "UPDATE", "RadiologyOrder", id, {
      action: "REPORT_WRITTEN",
    });
    void this.hl7Outbound?.sendRadiologyReportQuiet(tenantId, id, userId);
    return updated;
  }

  async getWorklist(tenantId: string) {
    return this.prisma.radiologyOrder.findMany({
      where: {
        tenantId,
        status: {
          in: [
            "ORDERED",
            "SCHEDULED",
            "IN_PROGRESS",
            "IMAGES_UPLOADED",
            "REPORTED",
            "VERIFIED",
          ],
        },
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        images: true,
      },
      orderBy: { orderedAt: "desc" },
    });
  }

  async getSummary(tenantId: string) {
    const [totalOrders, newOrders, inProgress, reported, completedToday] = await Promise.all([
      this.prisma.radiologyOrder.count({ where: { tenantId } }),
      this.prisma.radiologyOrder.count({ where: { tenantId, status: { in: ["ORDERED", "SCHEDULED"] } } }),
      this.prisma.radiologyOrder.count({ where: { tenantId, status: { in: ["IN_PROGRESS", "IMAGES_UPLOADED"] } } }),
      this.prisma.radiologyOrder.count({ where: { tenantId, status: { in: ["REPORTED", "VERIFIED", "APPROVED"] } } }),
      this.prisma.radiologyOrder.count({
        where: { tenantId, status: { in: ["REPORTED", "VERIFIED", "APPROVED", "DELIVERED"] }, updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
    ]);
    const totalImages = await this.prisma.radiologyImage.count({ where: { radiologyOrder: { tenantId } } });
    return { totalOrders, newOrders, inProgress, reported, completedToday, totalImages };
  }

  async generateReportPdf(tenantId: string, orderId: string, userId?: string): Promise<Buffer> {
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id: orderId, tenantId },
      include: {
        patient: { select: { id: true, firstName: true, middleName: true, lastName: true, mrn: true, gender: true, dateOfBirth: true } },
        images: true,
      },
    });
    if (!order) throw new NotFoundException("Radiology order not found");

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    let doctorName = "";
    if (order.doctorId) {
      const doc = await this.prisma.doctorProfile.findFirst({ where: { id: order.doctorId, tenantId }, include: { user: { select: { firstName: true, lastName: true } } } });
      if (doc?.user) doctorName = [doc.user.firstName, doc.user.lastName].filter(Boolean).join(" ");
    }

    let generatedBy = "";
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      if (user) generatedBy = [user.firstName, user.lastName].filter(Boolean).join(" ");
    }

    const patientName = [order.patient.firstName, order.patient.middleName, order.patient.lastName].filter(Boolean).join(" ");
    const addr = [(tenant as any).addressLine1, (tenant as any).addressLine2, (tenant as any).city, (tenant as any).province].filter(Boolean).join(", ");

    return buildRadiologyReportPdf({
      hospitalName: tenant.name || "Hospital",
      hospitalAddr: addr,
      hospitalContact: [tenant.phone, tenant.email].filter(Boolean).join(" | "),
      orderNumber: order.orderNumber,
      status: order.status.replace(/_/g, " "),
      modality: order.modality,
      bodyPart: order.bodyPart || "",
      isEmergency: order.isEmergency,
      orderedAt: order.orderedAt,
      scheduledAt: order.scheduledAt,
      performedAt: order.performedAt,
      reportedAt: order.reportedAt,
      verifiedAt: order.verifiedAt,
      approvedAt: order.approvedAt,
      patientName,
      patientMrn: order.patient.mrn || "",
      patientGender: order.patient.gender || "",
      patientDob: order.patient.dateOfBirth,
      doctorName,
      clinicalHistory: order.clinicalHistory || "",
      findings: order.findings || "",
      impression: order.impression || "",
      report: order.report || "",
      imageCount: order.images.length,
      generatedBy,
    });
  }

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.radiologyOrder.findFirst({
      where: { tenantId, orderNumber: { startsWith: `RAD-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { orderNumber: true },
    });

    let seq = 1;
    if (latest) {
      const parts = latest.orderNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `RAD-${ymd}-${String(seq).padStart(4, "0")}`;
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
