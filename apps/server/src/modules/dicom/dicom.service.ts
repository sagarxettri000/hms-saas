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

  async upload({ tenantId, userId, files, patientId, radiologyOrderId }: UploadDicomParams) {
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

    let targetPatientId = patientId;
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
        metadata.study.studyInstanceUid || `urn:study:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const seriesInstanceUid =
        metadata.series.seriesInstanceUid || `urn:series:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const sopInstanceUid =
        metadata.instance.sopInstanceUid || `urn:sop:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const key = `${tenantId}/dicom/${studyInstanceUid}/${seriesInstanceUid}/${sopInstanceUid}.dcm`;
      const stored = await this.storage.put(key, file.buffer, "application/dicom");

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

      ingested.push({
        study: { id: study.id, studyInstanceUid: study.studyInstanceUid },
        series: { id: series.id, seriesInstanceUid: series.seriesInstanceUid },
        instance: { id: instance.id, sopInstanceUid: instance.sopInstanceUid },
        patientName: metadata.study.patient?.patientName,
        patientId: metadata.study.patient?.patientId,
      });
    }

    return { ingested };
  }

  async findStudies(tenantId: string, params: StudySearchParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));

    const where: Prisma.DicomStudyWhereInput = { tenantId };

    if (params.patientId) where.patientId = params.patientId;
    if (params.radiologyOrderId) where.radiologyOrderId = params.radiologyOrderId;
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
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
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
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
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
}