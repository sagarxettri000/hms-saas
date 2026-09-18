import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { extractDicomMetadata } from "./dicom-metadata.util";

export interface UploadDicomParams {
  tenantId: string;
  userId: string;
  files: DicomUploadFile[];
  patientId?: string;
  radiologyOrderId?: string;
}

export interface DicomUploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface StudySearchParams {
  patientId?: string;
  radiologyOrderId?: string;
  accessionNumber?: string;
  modality?: string;
  query?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class DicomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload({
    tenantId,
    userId,
    files,
    patientId,
    radiologyOrderId,
  }: UploadDicomParams) {
    if (!files?.length) {
      throw new BadRequestException("At least one DICOM file is required");
    }

    if (radiologyOrderId) {
      const order = await this.prisma.radiologyOrder.findFirst({
        where: { id: radiologyOrderId, tenantId },
        select: { id: true },
      });
      if (!order) throw new NotFoundException("Radiology order not found");
    }

    const targetPatientId = patientId;
    if (patientId) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: patientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException("Patient not found");
    }

    const ingested = [];
    for (const file of files) {
      const metadata = extractDicomMetadata(file.buffer);

      const studyInstanceUid =
        metadata.study.studyInstanceUid ||
        `urn:study:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const seriesInstanceUid =
        metadata.series.seriesInstanceUid ||
        `urn:series:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const sopInstanceUid =
        metadata.instance.sopInstanceUid ||
        `urn:sop:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const key = `${tenantId}/dicom/${studyInstanceUid}/${seriesInstanceUid}/${sopInstanceUid}.dcm`;
      const stored = await this.storage.put(
        key,
        file.buffer,
        "application/dicom",
      );

      const study = await this.prisma.dicomStudy.upsert({
        where: { tenantId_studyInstanceUid: { tenantId, studyInstanceUid } },
        update: {
          studyDate: metadata.study.studyDate,
          studyDescription: metadata.study.studyDescription,
          accessionNumber: metadata.study.accessionNumber,
          modality: metadata.study.modality,
          bodyPart: metadata.study.bodyPartExamined,
          referringPhysician: metadata.study.referringPhysician,
          institutionName: metadata.study.institutionName,
          patientId: targetPatientId ?? undefined,
          radiologyOrderId: radiologyOrderId ?? undefined,
          uploadedBy: userId,
          numberOfInstances: { increment: 1 },
        },
        create: {
          tenantId,
          patientId: targetPatientId,
          radiologyOrderId,
          studyInstanceUid,
          studyDate: metadata.study.studyDate,
          studyDescription: metadata.study.studyDescription,
          accessionNumber: metadata.study.accessionNumber,
          modality: metadata.study.modality,
          bodyPart: metadata.study.bodyPartExamined,
          referringPhysician: metadata.study.referringPhysician,
          institutionName: metadata.study.institutionName,
          numberOfSeries: 1,
          numberOfInstances: 1,
          uploadedBy: userId,
        },
      });

      const series = await this.prisma.dicomSeries.upsert({
        where: {
          dicomStudyId_seriesInstanceUid: {
            dicomStudyId: study.id,
            seriesInstanceUid,
          },
        },
        update: {
          seriesNumber: metadata.series.seriesNumber,
          seriesDescription: metadata.series.seriesDescription,
          modality: metadata.series.modality,
          bodyPart: metadata.series.bodyPart,
          numberOfInstances: { increment: 1 },
        },
        create: {
          dicomStudyId: study.id,
          seriesInstanceUid,
          seriesNumber: metadata.series.seriesNumber,
          seriesDescription: metadata.series.seriesDescription,
          modality: metadata.series.modality,
          bodyPart: metadata.series.bodyPart,
          numberOfInstances: 1,
        },
      });

      const instance = await this.prisma.dicomInstance.upsert({
        where: {
          dicomSeriesId_sopInstanceUid: {
            dicomSeriesId: series.id,
            sopInstanceUid,
          },
        },
        update: {
          instanceNumber: metadata.instance.instanceNumber,
          storageKey: key,
          fileSize: stored.size,
          rows: metadata.instance.rows ?? undefined,
          columns: metadata.instance.columns ?? undefined,
          numberOfFrames: metadata.instance.numberOfFrames ?? undefined,
          bitsAllocated: metadata.instance.bitsAllocated ?? undefined,
          transferSyntax: metadata.instance.transferSyntax,
          contentType: "application/dicom",
          uploadedBy: userId,
        },
        create: {
          dicomSeriesId: series.id,
          sopInstanceUid,
          instanceNumber: metadata.instance.instanceNumber,
          storageKey: key,
          fileSize: stored.size,
          rows: metadata.instance.rows,
          columns: metadata.instance.columns,
          numberOfFrames: metadata.instance.numberOfFrames,
          bitsAllocated: metadata.instance.bitsAllocated,
          transferSyntax: metadata.instance.transferSyntax,
          contentType: "application/dicom",
          uploadedBy: userId,
        },
      });

      // Auto-link the study to an existing radiology order by accession number.
      if (!radiologyOrderId && metadata.study.accessionNumber) {
        const matched = await this.prisma.radiologyOrder.findFirst({
          where: {
            tenantId,
            accessionNumber: metadata.study.accessionNumber as string,
          },
          select: { id: true },
        });
        if (matched) {
          await this.prisma.dicomStudy.update({
            where: { id: study.id },
            data: { radiologyOrderId: matched.id },
          });
          await this.prisma.radiologyOrder.updateMany({
            where: {
              id: matched.id,
              tenantId,
              status: { in: ["ORDERED", "SCHEDULED", "IN_PROGRESS"] },
            },
            data: { status: "IMAGES_UPLOADED" },
          });
        }
      }

      ingested.push({
        study: { id: study.id, studyInstanceUid: study.studyInstanceUid },
        series: { id: series.id, seriesInstanceUid: series.seriesInstanceUid },
        instance: { id: instance.id, sopInstanceUid: instance.sopInstanceUid },
        patientName: metadata.study.patient?.patientName,
        patientId: metadata.study.patient?.patientId,
      });
    }

    if (radiologyOrderId && ingested.length) {
      await this.prisma.radiologyOrder.updateMany({
        where: {
          id: radiologyOrderId,
          tenantId,
          status: { in: ["ORDERED", "SCHEDULED", "IN_PROGRESS"] },
        },
        data: { status: "IMAGES_UPLOADED" },
      });
    }

    return { ingested };
  }

  async findStudies(tenantId: string, params: StudySearchParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));

    const where: Prisma.DicomStudyWhereInput = { tenantId };

    if (params.patientId) where.patientId = params.patientId;
    if (params.radiologyOrderId)
      where.radiologyOrderId = params.radiologyOrderId;
    if (params.accessionNumber) where.accessionNumber = params.accessionNumber;
    if (params.modality) where.modality = params.modality;

    const q = params.query?.trim();
    if (q) {
      where.OR = [
        { studyDescription: { contains: q, mode: "insensitive" } },
        { accessionNumber: { contains: q, mode: "insensitive" } },
        { studyInstanceUid: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.dicomStudy.count({ where }),
      this.prisma.dicomStudy.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          series: {
            select: {
              id: true,
              seriesInstanceUid: true,
              seriesNumber: true,
              modality: true,
              seriesDescription: true,
              numberOfInstances: true,
            },
            orderBy: { seriesNumber: "asc" as const },
          },
        },
        orderBy: { studyDate: "desc" as const },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findStudy(tenantId: string, studyId: string) {
    const study = await this.prisma.dicomStudy.findFirst({
      where: { id: studyId, tenantId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        series: {
          include: {
            instances: {
              select: {
                id: true,
                sopInstanceUid: true,
                instanceNumber: true,
                rows: true,
                columns: true,
                bitsAllocated: true,
                transferSyntax: true,
                fileSize: true,
                createdAt: true,
              },
              orderBy: { instanceNumber: "asc" as const },
            },
          },
          orderBy: { seriesNumber: "asc" as const },
        },
      },
    });
    if (!study) throw new NotFoundException("DICOM study not found");
    return study;
  }

  async associateStudy(
    tenantId: string,
    studyId: string,
    orderId: string,
    userId?: string,
  ) {
    const study = await this.prisma.dicomStudy.findFirst({
      where: { id: studyId, tenantId },
      select: { id: true, radiologyOrderId: true },
    });
    if (!study) throw new NotFoundException("DICOM study not found");

    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id: orderId, tenantId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException("Radiology order not found");

    await this.prisma.dicomStudy.update({
      where: { id: studyId },
      data: { radiologyOrderId: order.id },
    });
    await this.prisma.radiologyOrder.updateMany({
      where: {
        id: order.id,
        tenantId,
        status: { in: ["ORDERED", "SCHEDULED", "IN_PROGRESS"] },
      },
      data: { status: "IMAGES_UPLOADED" },
    });

    if (userId) {
      await this.prisma.auditLog
        .create({
          data: {
            tenantId,
            userId,
            entity: "DicomStudy",
            entityId: studyId,
            action: "UPDATE" as any,
            metadata: {
              action: "STUDY_ASSOCIATED",
              radiologyOrderId: order.id,
            },
          },
        })
        .catch(() => {});
    }

    return { studyId: study.id, radiologyOrderId: order.id };
  }

  async unassociateStudy(tenantId: string, studyId: string, userId?: string) {
    const study = await this.prisma.dicomStudy.findFirst({
      where: { id: studyId, tenantId },
      select: { id: true, radiologyOrderId: true },
    });
    if (!study) throw new NotFoundException("DICOM study not found");

    await this.prisma.dicomStudy.update({
      where: { id: studyId },
      data: { radiologyOrderId: null },
    });

    if (userId) {
      await this.prisma.auditLog
        .create({
          data: {
            tenantId,
            userId,
            entity: "DicomStudy",
            entityId: studyId,
            action: "UPDATE" as any,
            metadata: { action: "STUDY_UNASSOCIATED" },
          },
        })
        .catch(() => {});
    }

    return { studyId: study.id, radiologyOrderId: null };
  }

  async createOrderFromStudy(
    tenantId: string,
    studyId: string,
    dto: {
      bodyPart?: string;
      clinicalHistory?: string;
      referringDoctorId?: string;
    },
    userId?: string,
  ) {
    const study = await this.prisma.dicomStudy.findFirst({
      where: { id: studyId, tenantId },
      select: {
        id: true,
        patientId: true,
        accessionNumber: true,
        modality: true,
        bodyPart: true,
        radiologyOrderId: true,
      },
    });
    if (!study) throw new NotFoundException("DICOM study not found");
    if (!study.patientId) {
      throw new BadRequestException(
        "Cannot create an order for a study without a linked patient",
      );
    }
    if (study.radiologyOrderId) {
      throw new BadRequestException(
        "This study is already linked to a radiology order",
      );
    }

    const modalityMap: Record<string, string> = {
      CT: "CT",
      MR: "MRI",
      US: "ULTRASOUND",
      DX: "XRAY",
      CR: "XRAY",
      MG: "XRAY",
      XA: "XRAY",
      RF: "XRAY",
      OT: "OTHERS",
      ECG: "ECG",
    };
    const modality = (modalityMap[study.modality ?? "OT"] ?? "OTHERS") as any;

    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.radiologyOrder.findFirst({
      where: { tenantId, orderNumber: { startsWith: `RAD-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { orderNumber: true },
    });
    const seq = latest
      ? parseInt(latest.orderNumber.split("-").pop() ?? "0", 10) + 1
      : 1;
    const orderNumber = `RAD-${ymd}-${String(seq).padStart(4, "0")}`;

    const order = await this.prisma.radiologyOrder.create({
      data: {
        tenantId,
        patientId: study.patientId,
        doctorId: dto.referringDoctorId,
        orderNumber,
        accessionNumber: study.accessionNumber ?? undefined,
        modality,
        bodyPart: dto.bodyPart ?? study.bodyPart ?? undefined,
        clinicalHistory: dto.clinicalHistory,
      },
    });

    await this.prisma.dicomStudy.update({
      where: { id: study.id },
      data: { radiologyOrderId: order.id },
    });

    if (userId) {
      await this.prisma.auditLog
        .create({
          data: {
            tenantId,
            userId,
            entity: "RadiologyOrder",
            entityId: order.id,
            action: "CREATE" as any,
            metadata: { source: "DICOM_STUDY", studyId: study.id },
          },
        })
        .catch(() => {});
    }

    return order;
  }

  async findInstance(tenantId: string, studyId: string, instanceId: string) {
    const instance = await this.prisma.dicomInstance.findFirst({
      where: {
        id: instanceId,
        dicomSeries: { dicomStudy: { id: studyId, tenantId } },
      },
      include: {
        dicomSeries: {
          select: {
            id: true,
            seriesInstanceUid: true,
            seriesNumber: true,
            modality: true,
          },
        },
      },
    });
    if (!instance) throw new NotFoundException("DICOM instance not found");
    return instance;
  }

  async fetchInstanceData(instance: { storageKey: string }) {
    const { data, contentType } = await this.storage.get(instance.storageKey);
    return { data, contentType };
  }

  async deleteStudy(tenantId: string, studyId: string) {
    const study = await this.prisma.dicomStudy.findFirst({
      where: { id: studyId, tenantId },
      include: {
        series: {
          include: { instances: { select: { storageKey: true } } },
        },
      },
    });
    if (!study) throw new NotFoundException("DICOM study not found");

    for (const series of study.series) {
      for (const instance of series.instances) {
        await this.storage.delete(instance.storageKey).catch(() => undefined);
      }
    }

    await this.prisma.dicomStudy.delete({ where: { id: studyId } });
    return { deleted: true };
  }

  // ---- DICOM node management ----

  async listNodes(tenantId: string) {
    return this.prisma.dicomNode.findMany({
      where: { tenantId },
      orderBy: { name: "asc" as const },
    });
  }

  async createNode(
    tenantId: string,
    data: {
      name: string;
      aeTitle: string;
      hostname: string;
      port?: number;
      isLocal?: boolean;
      tls?: boolean;
    },
  ) {
    if (!data.name?.trim())
      throw new BadRequestException("Node name is required");
    if (!data.aeTitle?.trim())
      throw new BadRequestException("AE title is required");
    if (!data.hostname?.trim())
      throw new BadRequestException("Hostname is required");

    return this.prisma.dicomNode.create({
      data: {
        tenantId,
        name: data.name.trim(),
        aeTitle: data.aeTitle.trim(),
        hostname: data.hostname.trim(),
        port: Number(data.port) || 104,
        isLocal: Boolean(data.isLocal),
        tls: Boolean(data.tls),
      },
    });
  }

  async updateNode(
    tenantId: string,
    nodeId: string,
    data: {
      name?: string;
      aeTitle?: string;
      hostname?: string;
      port?: number;
      isLocal?: boolean;
      tls?: boolean;
    },
  ) {
    const existing = await this.prisma.dicomNode.findFirst({
      where: { id: nodeId, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("DICOM node not found");

    return this.prisma.dicomNode.update({
      where: { id: nodeId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.aeTitle !== undefined ? { aeTitle: data.aeTitle.trim() } : {}),
        ...(data.hostname !== undefined
          ? { hostname: data.hostname.trim() }
          : {}),
        ...(data.port !== undefined ? { port: Number(data.port) } : {}),
        ...(data.isLocal !== undefined ? { isLocal: data.isLocal } : {}),
        ...(data.tls !== undefined ? { tls: data.tls } : {}),
      },
    });
  }

  async deleteNode(tenantId: string, nodeId: string) {
    const existing = await this.prisma.dicomNode.findFirst({
      where: { id: nodeId, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("DICOM node not found");

    await this.prisma.dicomNode.delete({ where: { id: nodeId } });
    return { deleted: true };
  }

  async echoNode(tenantId: string, nodeId: string) {
    const node = await this.prisma.dicomNode.findFirst({
      where: { id: nodeId, tenantId },
    });
    if (!node) throw new NotFoundException("DICOM node not found");

    const { isTcpReachable } = await import("./dicom-node-echo");
    try {
      const info = await isTcpReachable(node.hostname, node.port);
      return { node, reachable: info.reachable, latencyMs: info.latencyMs };
    } catch (err) {
      return {
        node,
        reachable: false,
        latencyMs: null,
        error: (err as Error).message,
      };
    }
  }
}
