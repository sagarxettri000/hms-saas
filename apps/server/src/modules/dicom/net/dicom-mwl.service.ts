import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

export interface MwlSearchParams {
  modality?: string;
  status?: string;
  from?: string;
  to?: string;
  query?: string;
  patientId?: string;
  limit?: number;
  offset?: number;
}

export interface WorklistEntry {
  orderId: string;
  accessionNumber: string | null;
  requestedProcedureId: string | null;
  modality: string | null;
  status: string;
  scheduledDateTime: Date | null;
  patient: {
    id: string | null;
    firstName: string | null;
    lastName: string | null;
    mrn: string | null;
    hospitalNumber: string | null;
    dob?: Date | null;
  };
  studyInstanceUid?: string;
  orderNumber: string;
}

/**
 * Modality Worklist bridge: surfaces scheduled radiology orders created from
 * HL7 ORM/SIU messages (and manual ordering) as DICOM MWL-compatible entries,
 * and reports performed procedure steps back to ordering systems.
 */
@Injectable()
export class DicomMwlService {
  private readonly logger = new Logger(DicomMwlService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    params: MwlSearchParams,
  ): Promise<WorklistEntry[]> {
    const where: Prisma.RadiologyOrderWhereInput = {
      tenantId,
    };

    if (params.status) {
      where.status = params.status as never;
    } else {
      where.status = { in: ["ORDERED", "SCHEDULED", "IN_PROGRESS"] as never[] };
    }

    if (params.modality) where.modality = params.modality as never;
    if (params.patientId) where.patientId = params.patientId;

    if (params.from || params.to) {
      where.OR = [{ scheduledAt: {} }] as never[];
      const scheduledDate: Prisma.DateTimeFilter = {};
      if (params.from) scheduledDate.gte = new Date(params.from);
      if (params.to) scheduledDate.lte = new Date(params.to);
      where.OR = [{ scheduledAt: scheduledDate as never }];
    }

    const q = params.query?.trim();
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { accessionNumber: { contains: q, mode: "insensitive" } },
        {
          patient: {
            is: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { mrn: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
      ] as never[];
    }

    const limit = Math.min(100, Math.max(1, Number(params.limit) || 50));
    const offset = Math.max(0, Number(params.offset) || 0);

    const orders = await this.prisma.radiologyOrder.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            hospitalNumber: true,
          },
        },
        dicomStudies: { select: { id: true, studyInstanceUid: true }, take: 1 },
      },
      orderBy: { scheduledAt: "asc" as const },
      skip: offset,
      take: limit,
    });

    return orders.map((o: any) => ({
      orderId: o.id,
      accessionNumber: o.accessionNumber,
      requestedProcedureId: o.requestedProcedureId,
      modality: o.modality,
      status: o.status,
      scheduledDateTime: o.scheduledAt,
      patient: o.patient,
      studyInstanceUid: o.dicomStudies?.[0]?.studyInstanceUid,
      orderNumber: o.orderNumber,
    }));
  }

  /** Mark a scheduled order as in progress when images begin to arrive. */
  async markPerformed(
    tenantId: string,
    orderId: string,
  ): Promise<{ performed: boolean }> {
    const updated = await this.prisma.radiologyOrder.updateMany({
      where: {
        id: orderId,
        tenantId,
        status: { in: ["ORDERED", "SCHEDULED"] },
      },
      data: { status: "IN_PROGRESS" },
    });
    return { performed: updated.count > 0 };
  }

  /** Mark a scheduled order as completed (images uploaded, worklist item done). */
  async markCompleted(
    tenantId: string,
    orderId: string,
  ): Promise<{ completed: boolean }> {
    const updated = await this.prisma.radiologyOrder.updateMany({
      where: {
        id: orderId,
        tenantId,
        status: {
          in: ["ORDERED", "SCHEDULED", "IN_PROGRESS", "IMAGES_UPLOADED"],
        },
      },
      data: { status: "IMAGES_UPLOADED" },
    });
    return { completed: updated.count > 0 };
  }
}
