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
import { NotificationsService } from "../notifications/notifications.service";
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
  isCritical?: string;
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

const RADIOLOGY_ADMIN_ROLES = new Set([
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
  "PLATFORM_SUPER_ADMIN",
  "IT_ADMIN",
]);

const CRITICAL_KEYWORDS = [
  "hemorrhage",
  "haemorrhage",
  "intracranial bleed",
  "massive hemothorax",
  "pneumothorax",
  "aortic dissection",
  "acutely ruptured",
  "pulmonary embolism",
  "cardiac tamponade",
  "torsion",
  "perforation",
  "free air",
  "bowel ischemia",
  "necrotizing",
  "malignancy",
  "lytic lesion",
];

@Injectable()
export class RadiologyService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly hl7Outbound?: Hl7OutboundService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private assertCanReport(role?: string) {
    if (role && !RADIOLOGY_REPORTING_ROLES.has(role)) {
      throw new ForbiddenException(
        "Only radiologists can write and verify radiology reports",
      );
    }
  }

  private suggestCritical(text?: string | null): boolean {
    if (!text) return false;
    const normalized = text.toLowerCase();
    return CRITICAL_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  private async notifyReferringDoctor(
    tenantId: string,
    order: { id: string; doctorId?: string | null; orderNumber: string },
    title: string,
    body: string,
  ) {
    try {
      if (!order.doctorId || !this.notifications) return;
      const doctor = await this.prisma.doctorProfile.findFirst({
        where: { id: order.doctorId, tenantId },
        select: { userId: true },
      });
      if (!doctor?.userId) return;
      await this.notifications.create(tenantId, {
        userId: doctor.userId,
        title,
        body,
        type: "RADIOLOGY",
        referenceType: "RadiologyOrder",
        referenceId: order.id,
      });
    } catch (error) {
      console.warn(`Failed to notify referring doctor: ${error}`);
    }
  }

  private async autofillAssignee(tenantId: string, orderId: string) {
    try {
      const radiologists = await this.prisma.user.findMany({
        where: { tenantId, role: "RADIOLOGIST", status: "ACTIVE" },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (!radiologists.length) return;
      const last = await this.prisma.radiologyOrder.findFirst({
        where: { tenantId, assignedRadiologistId: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { assignedRadiologistId: true },
      });
      const lastIndex = radiologists.findIndex(
        (r) => r.id === last?.assignedRadiologistId,
      );
      const next =
        radiologists[(lastIndex + 1) % radiologists.length] ?? radiologists[0];
      await this.prisma.radiologyOrder.update({
        where: { id: orderId },
        data: { assignedRadiologistId: next.id },
      });
    } catch (error) {
      console.warn(`Failed to auto-assign radiologist: ${error}`);
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
    if (params.isCritical) where.isCritical = params.isCritical === "true";
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

    const radiologistIds = [
      ...new Set(
        data
          .map((o) => o.assignedRadiologistId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (radiologistIds.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: radiologistIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      const userById = new Map(users.map((u) => [u.id, u]));
      return {
        data: data.map((o) => {
          const u = o.assignedRadiologistId
            ? userById.get(o.assignedRadiologistId)
            : undefined;
          return u
            ? {
                ...o,
                assignedRadiologist: {
                  id: u.id,
                  firstName: u.firstName,
                  lastName: u.lastName,
                },
              }
            : o;
        }),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(tenantId: string, id: string) {
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        dicomStudies: {
          select: {
            id: true,
            studyInstanceUid: true,
            accessionNumber: true,
            modality: true,
            studyDate: true,
          },
        },
        encounter: true,
        images: true,
      },
    });
    if (!order) throw new NotFoundException("Radiology order not found");
    if (order.assignedRadiologistId) {
      const radiologist = await this.prisma.user.findUnique({
        where: { id: order.assignedRadiologistId },
        select: { id: true, firstName: true, lastName: true },
      });
      return { ...order, assignedRadiologist: radiologist ?? null };
    }
    return { ...order, assignedRadiologist: null };
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
    if (
      ["SCHEDULED", "IMAGES_UPLOADED"].includes(toStatus) &&
      !order.assignedRadiologistId
    ) {
      void this.autofillAssignee(tenantId, id);
    }
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

    const combined = [dto.findings, dto.impression, dto.report]
      .filter(Boolean)
      .join(" ");
    reportData.criticalSuggested = this.suggestCritical(combined);

    const updated = await this.prisma.radiologyOrder.update({
      where: { id },
      data: {
        ...reportData,
        status: "REPORTED",
        reportedAt: new Date(),
        reportedBy: userId,
      },
    });

    await this.logAudit(tenantId, userId, "UPDATE", "RadiologyOrder", id, {
      action: "REPORT_WRITTEN",
    });
    void this.hl7Outbound?.sendRadiologyReportQuiet(tenantId, id, userId);
    void this.notifyReferringDoctor(
      tenantId,
      order,
      "Radiology report available",
      `The radiology report for order ${order.orderNumber} is ready for review.`,
    );
    return updated;
  }

  async addRevision(
    tenantId: string,
    id: string,
    dto: {
      findings?: string;
      impression?: string;
      report?: string;
      reason?: string;
    },
    userId?: string,
    role?: string,
  ) {
    this.assertCanReport(role);
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Radiology order not found");
    if (!order.reportedAt) {
      throw new BadRequestException(
        "Cannot add a revision before the report is written",
      );
    }

    const nextVersion = (order.reportVersion ?? 1) + 1;
    const revision = await this.prisma.radiologyReportRevision.create({
      data: {
        tenantId,
        radiologyOrderId: id,
        version: nextVersion,
        findings: dto.findings ?? undefined,
        impression: dto.impression ?? undefined,
        report: dto.report ?? undefined,
        reason: dto.reason || "Addendum",
        authoredBy: userId,
      },
    });

    const updated = await this.prisma.radiologyOrder.update({
      where: { id },
      data: {
        reportVersion: nextVersion,
        ...(dto.findings !== undefined ? { findings: dto.findings } : {}),
        ...(dto.impression !== undefined ? { impression: dto.impression } : {}),
        ...(dto.report !== undefined ? { report: dto.report } : {}),
      },
    });

    await this.logAudit(tenantId, userId, "UPDATE", "RadiologyOrder", id, {
      action: "REPORT_REVISION",
      version: nextVersion,
    });
    return { revision, order: updated };
  }

  async listRevisions(tenantId: string, id: string) {
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
      select: { id: true, reportVersion: true },
    });
    if (!order) throw new NotFoundException("Radiology order not found");
    const revisions = await this.prisma.radiologyReportRevision.findMany({
      where: { radiologyOrderId: id, tenantId },
      orderBy: { version: "desc" },
    });
    return { reportVersion: order.reportVersion, revisions };
  }

  async setCriticalFlag(
    tenantId: string,
    id: string,
    dto: { isCritical: boolean; note?: string },
    userId?: string,
    role?: string,
  ) {
    this.assertCanReport(role);
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Radiology order not found");

    const updated = await this.prisma.radiologyOrder.update({
      where: { id },
      data: {
        isCritical: dto.isCritical,
        criticalFlaggedBy: dto.isCritical ? userId : null,
        criticalFlaggedAt: dto.isCritical ? new Date() : null,
      },
    });
    await this.logAudit(tenantId, userId, "UPDATE", "RadiologyOrder", id, {
      action: dto.isCritical ? "CRITICAL_FLAGGED" : "CRITICAL_CLEARED",
    });

    if (dto.isCritical) {
      await this.notifyReferringDoctor(
        tenantId,
        order,
        `Critical finding on ${order.orderNumber}`,
        dto.note ||
          "A critical radiological finding has been flagged. Please review urgently.",
      );
    }
    return updated;
  }

  async assignRadiologist(
    tenantId: string,
    id: string,
    radiologistId?: string,
    userId?: string,
  ) {
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Radiology order not found");

    let targetId = radiologistId;
    if (targetId) {
      const radiologist = await this.prisma.user.findFirst({
        where: {
          id: targetId,
          tenantId,
          role: "RADIOLOGIST",
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!radiologist) {
        throw new BadRequestException("Active radiologist not found");
      }
    } else {
      const radiologists = await this.prisma.user.findMany({
        where: { tenantId, role: "RADIOLOGIST", status: "ACTIVE" },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (!radiologists.length) {
        throw new BadRequestException("No active radiologist available");
      }
      const last = await this.prisma.radiologyOrder.findFirst({
        where: { tenantId, assignedRadiologistId: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { assignedRadiologistId: true },
      });
      const lastIndex = radiologists.findIndex(
        (r) => r.id === last?.assignedRadiologistId,
      );
      targetId = (
        radiologists[(lastIndex + 1) % radiologists.length] ?? radiologists[0]
      ).id;
    }

    const updated = await this.prisma.radiologyOrder.update({
      where: { id },
      data: { assignedRadiologistId: targetId },
    });
    await this.logAudit(tenantId, userId, "UPDATE", "RadiologyOrder", id, {
      action: "ASSIGNED_RADIOLOGIST",
      radiologistId: targetId,
    });
    return updated;
  }

  async tatMetrics(tenantId: string, params: { from?: string; to?: string }) {
    const from = params.from
      ? this.normalizeDate(params.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = params.to
      ? (() => {
          const d = this.normalizeDate(params.to!);
          d.setHours(23, 59, 59, 999);
          return d;
        })()
      : new Date();

    const orders = await this.prisma.radiologyOrder.findMany({
      where: {
        tenantId,
        reportedAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        orderNumber: true,
        assignedRadiologistId: true,
        orderedAt: true,
        reportedAt: true,
        verifiedAt: true,
      },
    });

    const hours = (a?: Date | null, b?: Date | null) =>
      a && b
        ? Math.round(((a.getTime() - b.getTime()) / 3600000) * 10) / 10
        : null;

    const userMap: Record<string, string> = {};
    if (orders.some((o) => o.assignedRadiologistId)) {
      const users = await this.prisma.user.findMany({
        where: {
          id: {
            in: orders.map((o) => o.assignedRadiologistId!).filter(Boolean),
          },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      users.forEach((u) => {
        userMap[u.id] =
          [u.firstName, u.lastName].filter(Boolean).join(" ") || u.id;
      });
    }

    const buckets = new Map<
      string,
      { cases: number; reportMs: number; verifyMs: number; verified: number }
    >();
    let overallReportMs = 0;
    let overallVerifyMs = 0;
    let overallCases = 0;
    let overallVerified = 0;

    for (const o of orders) {
      const key = o.assignedRadiologistId ?? "_unassigned_";
      const bucket = buckets.get(key) || {
        cases: 0,
        reportMs: 0,
        verifyMs: 0,
        verified: 0,
      };
      bucket.cases += 1;
      overallCases += 1;
      const r = hours(o.reportedAt, o.orderedAt);
      if (r !== null) {
        bucket.reportMs += r;
        overallReportMs += r;
      }
      const v = hours(o.verifiedAt, o.orderedAt);
      if (v !== null) {
        bucket.verifyMs += v;
        bucket.verified += 1;
        overallVerifyMs += v;
        overallVerified += 1;
      }
      buckets.set(key, bucket);
    }

    const perRadiologist = [...buckets.entries()].map(([id, b]) => ({
      radiologistId: id,
      name: id === "_unassigned_" ? "Unassigned" : userMap[id] || id,
      cases: b.cases,
      avgReportHours: b.cases
        ? Math.round((b.reportMs / b.cases) * 10) / 10
        : null,
      avgVerifyHours: b.verified
        ? Math.round((b.verifyMs / b.verified) * 10) / 10
        : null,
    }));

    return {
      from,
      to,
      overall: {
        cases: overallCases,
        verified: overallVerified,
        avgReportHours: overallCases
          ? Math.round((overallReportMs / overallCases) * 10) / 10
          : null,
        avgVerifyHours: overallVerified
          ? Math.round((overallVerifyMs / overallVerified) * 10) / 10
          : null,
      },
      perRadiologist,
    };
  }

  async requestPeerReview(
    tenantId: string,
    id: string,
    dto: { reviewerId: string; note?: string },
    userId?: string,
    role?: string,
  ) {
    this.assertCanReport(role);
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException("Radiology order not found");
    if (!order.reportedAt) {
      throw new BadRequestException("Cannot review an order without a report");
    }
    if (userId && dto.reviewerId === userId) {
      throw new BadRequestException("You cannot review your own report");
    }

    const reviewer = await this.prisma.user.findFirst({
      where: {
        id: dto.reviewerId,
        tenantId,
        role: "RADIOLOGIST",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!reviewer)
      throw new BadRequestException("Active radiologist not found");

    const pending = await this.prisma.radiologyPeerReview.findFirst({
      where: { radiologyOrderId: id, status: "REQUESTED" },
      select: { id: true },
    });
    if (pending)
      throw new BadRequestException(
        "A review is already pending for this order",
      );

    const peerReview = await this.prisma.radiologyPeerReview.create({
      data: {
        tenantId,
        radiologyOrderId: id,
        requestedBy: userId,
        reviewerId: dto.reviewerId,
        notes: dto.note,
      },
    });

    try {
      await this.notifications?.create(tenantId, {
        userId: dto.reviewerId,
        title: `Peer review requested on ${order.orderNumber}`,
        body: "A second opinion has been requested on a radiology report.",
        type: "RADIOLOGY",
        referenceType: "RadiologyOrder",
        referenceId: order.id,
      });
    } catch (error) {
      console.warn(`Failed to notify reviewer: ${error}`);
    }

    await this.logAudit(
      tenantId,
      userId,
      "CREATE",
      "RadiologyPeerReview",
      peerReview.id,
    );
    return peerReview;
  }

  async listPeerReviews(tenantId: string, orderId?: string) {
    const where: any = { tenantId };
    if (orderId) where.radiologyOrderId = orderId;
    const reviews = await this.prisma.radiologyPeerReview.findMany({
      where,
      include: {
        radiologyOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            patient: {
              select: { id: true, firstName: true, lastName: true, mrn: true },
            },
          },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    const userIds = [
      ...reviews.map((r) => r.reviewerId),
      ...reviews.map((r) => r.requestedBy),
      ...reviews.map((r) => r.decidedBy),
    ].filter((id): id is string => !!id);
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      const nameOf = (id?: string | null) => {
        if (!id) return "";
        const u = users.find((x) => x.id === id);
        return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") : "";
      };
      return reviews.map((r) => ({
        ...r,
        reviewerName: nameOf(r.reviewerId),
        requestedByName: nameOf(r.requestedBy),
        decidedByName: nameOf(r.decidedBy),
      }));
    }
    return reviews.map((r) => ({
      ...r,
      reviewerName: "",
      requestedByName: "",
      decidedByName: "",
    }));
  }

  async decidePeerReview(
    tenantId: string,
    reviewId: string,
    dto: { status: "APPROVED" | "REJECTED" | "OVERRIDE"; note?: string },
    userId?: string,
    role?: string,
  ) {
    this.assertCanReport(role);
    const peerReview = await this.prisma.radiologyPeerReview.findFirst({
      where: { id: reviewId, tenantId },
    });
    if (!peerReview) throw new NotFoundException("Peer review not found");
    if (peerReview.status !== "REQUESTED") {
      throw new BadRequestException("This review has already been decided");
    }
    if (
      peerReview.reviewerId &&
      peerReview.reviewerId !== userId &&
      !RADIOLOGY_ADMIN_ROLES.has(role || "")
    ) {
      throw new ForbiddenException("You are not the reviewer for this request");
    }

    const updated = await this.prisma.radiologyPeerReview.update({
      where: { id: reviewId },
      data: {
        status: dto.status,
        notes: dto.note ?? peerReview.notes,
        decidedBy: userId,
        decidedAt: new Date(),
      },
    });

    await this.logAudit(
      tenantId,
      userId,
      "UPDATE",
      "RadiologyPeerReview",
      reviewId,
      {
        status: dto.status,
      },
    );

    if (
      peerReview.requestedBy &&
      (dto.status === "REJECTED" || dto.status === "OVERRIDE")
    ) {
      try {
        await this.notifications?.create(tenantId, {
          userId: peerReview.requestedBy,
          title: `Peer review ${dto.status.toLowerCase()}`,
          body:
            dto.note || `The second opinion was ${dto.status.toLowerCase()}.`,
          type: "RADIOLOGY",
          referenceType: "RadiologyOrder",
          referenceId: peerReview.radiologyOrderId,
        });
      } catch (error) {
        console.warn(`Failed to notify requester: ${error}`);
      }
    }

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
    const [
      totalOrders,
      newOrders,
      inProgress,
      reported,
      completedToday,
      criticalCount,
    ] = await Promise.all([
      this.prisma.radiologyOrder.count({ where: { tenantId } }),
      this.prisma.radiologyOrder.count({
        where: { tenantId, status: { in: ["ORDERED", "SCHEDULED"] } },
      }),
      this.prisma.radiologyOrder.count({
        where: { tenantId, status: { in: ["IN_PROGRESS", "IMAGES_UPLOADED"] } },
      }),
      this.prisma.radiologyOrder.count({
        where: {
          tenantId,
          status: { in: ["REPORTED", "VERIFIED", "APPROVED"] },
        },
      }),
      this.prisma.radiologyOrder.count({
        where: {
          tenantId,
          status: { in: ["REPORTED", "VERIFIED", "APPROVED", "DELIVERED"] },
          updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.radiologyOrder.count({
        where: { tenantId, isCritical: true },
      }),
    ]);
    const totalImages = await this.prisma.radiologyImage.count({
      where: { radiologyOrder: { tenantId } },
    });
    return {
      totalOrders,
      newOrders,
      inProgress,
      reported,
      completedToday,
      totalImages,
      criticalCount,
    };
  }

  async generateReportPdf(
    tenantId: string,
    orderId: string,
    userId?: string,
  ): Promise<Buffer> {
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id: orderId, tenantId },
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
          },
        },
        images: true,
      },
    });
    if (!order) throw new NotFoundException("Radiology order not found");

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");

    let doctorName = "";
    if (order.doctorId) {
      const doc = await this.prisma.doctorProfile.findFirst({
        where: { id: order.doctorId, tenantId },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
      if (doc?.user)
        doctorName = [doc.user.firstName, doc.user.lastName]
          .filter(Boolean)
          .join(" ");
    }

    let generatedBy = "";
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      if (user)
        generatedBy = [user.firstName, user.lastName].filter(Boolean).join(" ");
    }

    const signerIds = [
      order.reportedBy,
      order.verifiedBy,
      order.approvedBy,
    ].filter(Boolean) as string[];
    const signers = signerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: signerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const signerNameOf = (id?: string | null) => {
      if (!id) return "";
      const u = signers.find((s) => s.id === id);
      return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") : "";
    };

    const patientName = [
      order.patient.firstName,
      order.patient.middleName,
      order.patient.lastName,
    ]
      .filter(Boolean)
      .join(" ");
    const addr = [
      (tenant as any).addressLine1,
      (tenant as any).addressLine2,
      (tenant as any).city,
      (tenant as any).province,
    ]
      .filter(Boolean)
      .join(", ");

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
      signedByName: signerNameOf(order.reportedBy),
      verifiedByName: signerNameOf(order.verifiedBy),
      approvedByName: signerNameOf(order.approvedBy),
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
