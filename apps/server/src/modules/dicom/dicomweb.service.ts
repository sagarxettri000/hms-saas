import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { DicomService } from "./dicom.service";
import { extractDicomMetadata } from "./dicom-metadata.util";
import {
  buildInstanceJson,
  buildSeriesJson,
  buildStudyJson,
  notFound,
} from "./dicomweb-json.util";
import { MultipartPart, parseMultipartRelated } from "./multipart-related";

@Injectable()
export class DicomWebService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dicomService: DicomService,
  ) {}

  /**
   * STOW-RS: store DICOM instances submitted as a multipart/related body.
   * Accepts application/dicom binary parts (and ignores application/octet-stream parts
   * that are not valid DICOM). Returns a STOW-RS-compliant JSON response.
   */
  async stow(
    tenantId: string,
    userId: string,
    body: Buffer,
    contentType: string,
    studyUid?: string,
  ) {
    const parts = await parseMultipartRelated(body, contentType);

    const dicomParts = parts.filter(
      (p) =>
        (p.headers["content-type"] || "").toLowerCase().split(";")[0].trim() ===
        "application/dicom",
    );

    if (!dicomParts.length) {
      throw new BadRequestException(
        "No application/dicom parts found in the request body",
      );
    }

    const files = dicomParts.map(
      (
        p,
        i,
      ): {
        buffer: Buffer;
        originalname: string;
        mimetype: string;
        size: number;
      } => ({
        buffer: p.data,
        originalname: p.headers["content-location"] || `instance-${i + 1}.dcm`,
        mimetype: "application/dicom",
        size: p.data.length,
      }),
    );

    // Auto-link a matching patient if the DICOM PatientID matches an MRN / hospital number.
    let patientId: string | undefined;
    try {
      const metadata = extractDicomMetadata(files[0].buffer);
      const dicomPatientId = metadata.study.patient?.patientId;
      if (dicomPatientId) {
        const patient = await this.prisma.patient.findFirst({
          where: {
            tenantId,
            deletedAt: null,
            OR: [{ mrn: dicomPatientId }, { hospitalNumber: dicomPatientId }],
          },
          select: { id: true },
        });
        patientId = patient?.id;
      }
    } catch {
      // Metadata parsing is best-effort for patient linking.
    }

    const result = await this.dicomService.upload({
      tenantId,
      userId,
      files,
      patientId,
    });

    return {
      "00081190": {
        vr: "UR",
        Value: studyUid
          ? [`/dicomweb/studies/${studyUid}`]
          : [
              `/dicomweb/studies/${result.ingested[0]?.study.studyInstanceUid || ""}`,
            ],
      },
      "00081198": { vr: "US", Value: [result.ingested.length] },
      numberOfInstancesStored: result.ingested.length,
      failedItems: [],
    };
  }

  /**
   * QIDO-RS: query series across a study (or all studies).
   */
  async qidoSeries(
    tenantId: string,
    studyUid: string | undefined,
    query: Record<string, string>,
  ) {
    const dicomStudyFilter: Prisma.DicomStudyWhereInput = { tenantId };
    if (studyUid) dicomStudyFilter.studyInstanceUid = studyUid;

    const where: Prisma.DicomSeriesWhereInput = {
      dicomStudy: dicomStudyFilter,
    };
    if (query.Modality) where.modality = query.Modality;
    if (query.SeriesInstanceUID)
      where.seriesInstanceUid = query.SeriesInstanceUID;

    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);
    const fuzzy = query.fuzzymatching?.toLowerCase() === "true";

    if (query.SeriesDescription && fuzzy) {
      where.seriesDescription = {
        contains: query.SeriesDescription,
        mode: "insensitive",
      };
    } else if (query.SeriesDescription) {
      where.seriesDescription = query.SeriesDescription;
    }

    const series = await this.prisma.dicomSeries.findMany({
      where,
      include: {
        dicomStudy: { select: { studyInstanceUid: true, studyDate: true } },
      },
      orderBy: { seriesNumber: "asc" as const },
      take: limit,
      skip: offset,
    });

    return series.map((s) => buildSeriesJson(s, this.baseUrl()));
  }

  /**
   * QIDO-RS: query instances.
   */
  async qidoInstances(
    tenantId: string,
    studyUid: string | undefined,
    seriesUid: string | undefined,
    query: Record<string, string>,
  ) {
    const instStudyFilter: Prisma.DicomStudyWhereInput = { tenantId };
    if (studyUid) instStudyFilter.studyInstanceUid = studyUid;

    const dicomSeriesFilter: Prisma.DicomSeriesWhereInput = {
      dicomStudy: instStudyFilter,
    };
    if (seriesUid) dicomSeriesFilter.seriesInstanceUid = seriesUid;
    if (query.Modality) dicomSeriesFilter.modality = query.Modality;

    const where: Prisma.DicomInstanceWhereInput = {
      dicomSeries: dicomSeriesFilter,
    };
    if (query.SOPInstanceUID) where.sopInstanceUid = query.SOPInstanceUID;

    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);

    const instances = await this.prisma.dicomInstance.findMany({
      where,
      include: {
        dicomSeries: {
          select: {
            seriesInstanceUid: true,
            seriesNumber: true,
            modality: true,
            dicomStudy: { select: { studyInstanceUid: true, studyDate: true } },
          },
        },
      },
      orderBy: { instanceNumber: "asc" as const },
      take: limit,
      skip: offset,
    });

    return instances.map((i) => buildInstanceJson(i, this.baseUrl()));
  }

  /**
   * WADO-RS: retrieve study, series, or single-instance metadata as DICOM JSON (application/dicom+json).
   */
  async metadataStudy(tenantId: string, studyUid: string) {
    const study = await this.prisma.dicomStudy.findFirst({
      where: { tenantId, studyInstanceUid: studyUid },
      include: {
        series: {
          select: {
            seriesInstanceUid: true,
            seriesNumber: true,
            modality: true,
            numberOfInstances: true,
          },
        },
      },
    });
    if (!study) notFound("DICOM study not found");
    return buildStudyJson(study, this.baseUrl());
  }

  async metadataSeries(tenantId: string, seriesUid: string) {
    const series = await this.prisma.dicomSeries.findFirst({
      where: { seriesInstanceUid: seriesUid, dicomStudy: { tenantId } },
      include: {
        dicomStudy: {
          select: {
            studyInstanceUid: true,
            studyDate: true,
            studyDescription: true,
            accessionNumber: true,
            patientId: true,
          },
        },
      },
    });
    if (!series) notFound("DICOM series not found");
    return buildSeriesJson(series, this.baseUrl());
  }

  async metadataInstance(
    tenantId: string,
    studyUid: string | undefined,
    seriesUid: string | undefined,
    instanceUid: string,
  ) {
    const instance = await this.prisma.dicomInstance.findFirst({
      where: {
        sopInstanceUid: instanceUid,
        dicomSeries: {
          ...(studyUid
            ? { dicomStudy: { tenantId, studyInstanceUid: studyUid } }
            : { dicomStudy: { tenantId } }),
          ...(seriesUid ? { seriesInstanceUid: seriesUid } : {}),
        },
      },
      include: {
        dicomSeries: {
          select: {
            seriesInstanceUid: true,
            seriesNumber: true,
            modality: true,
            dicomStudy: { select: { studyInstanceUid: true, studyDate: true } },
          },
        },
      },
    });
    if (!instance) notFound("DICOM instance not found");
    return buildInstanceJson(instance, this.baseUrl());
  }

  /**
   * WADO-RS: retrieve all instances of a series (or a single instance) as a binary stream.
   */
  async retrieveSeriesInstances(
    tenantId: string,
    studyUid: string,
    seriesUid: string,
    instanceUid?: string | undefined,
  ): Promise<{
    parts: { data: Buffer; contentType: string }[];
    single?: { data: Buffer; contentType: string };
  }> {
    const base = {
      dicomSeries: {
        seriesInstanceUid: seriesUid,
        dicomStudy: { tenantId, studyInstanceUid: studyUid },
      },
    } as const;

    const instanceRows = await this.prisma.dicomInstance.findMany({
      where: {
        ...base,
        ...(instanceUid ? { sopInstanceUid: instanceUid } : {}),
      },
      select: { storageKey: true, contentType: true },
      orderBy: { instanceNumber: "asc" as const },
    });

    if (!instanceRows.length) notFound("DICOM instance not found");

    const parts: { data: Buffer; contentType: string }[] = [];
    for (const row of instanceRows) {
      const { data, contentType } = await this.storage.get(row.storageKey);
      parts.push({ data, contentType: row.contentType || contentType });
    }

    if (instanceUid) {
      return { parts, single: parts[0] };
    }
    return { parts };
  }

  /**
   * WADO-RS: retrieve a whole study as a multipart/related document.
   */
  async retrieveStudy(tenantId: string, studyUid: string) {
    const instances = await this.prisma.dicomInstance.findMany({
      where: {
        dicomSeries: { dicomStudy: { tenantId, studyInstanceUid: studyUid } },
      },
      select: { storageKey: true, contentType: true },
      orderBy: { instanceNumber: "asc" as const },
    });

    if (!instances.length) notFound("No instances found for study");

    const parts: { data: Buffer; contentType: string }[] = [];
    for (const row of instances) {
      const { data, contentType } = await this.storage.get(row.storageKey);
      parts.push({ data, contentType: row.contentType || contentType });
    }
    return { parts };
  }

  /**
   * WADO-RS: return a single instance (used by `/instances/:instanceUid`).
   */
  async wadoInstance(
    tenantId: string,
    uids: {
      studyInstanceUid: string;
      seriesInstanceUid: string;
      instanceUid: string;
    },
  ) {
    const instance = await this.prisma.dicomInstance.findFirst({
      where: {
        sopInstanceUid: uids.instanceUid,
        dicomSeries: {
          seriesInstanceUid: uids.seriesInstanceUid,
          dicomStudy: { tenantId, studyInstanceUid: uids.studyInstanceUid },
        },
      },
      select: { storageKey: true, contentType: true },
    });

    if (!instance) {
      throw new NotFoundException("DICOM instance not found");
    }

    const { data, contentType } = await this.storage.get(instance.storageKey);
    return { data, contentType: instance.contentType || contentType };
  }

  /**
   * WADO-RS: by internal database id (used by the in-app viewer).
   */
  async wadoById(tenantId: string, studyId: string, instanceId: string) {
    const instance = await this.prisma.dicomInstance.findFirst({
      where: {
        id: instanceId,
        dicomSeries: { dicomStudy: { id: studyId, tenantId } },
      },
      select: { storageKey: true, contentType: true },
    });
    if (!instance) {
      throw new NotFoundException("DICOM instance not found");
    }
    const { data, contentType } = await this.storage.get(instance.storageKey);
    return { data, contentType: instance.contentType || contentType };
  }

  /**
   * WADO-URI: single-parameter retrieval (requestType=WADO&objectUID=...).
   */
  async wadoUri(tenantId: string, query: Record<string, string>) {
    const objectUid = query.objectUID || query.uid;
    if (!objectUid) throw new BadRequestException("Missing objectUID");

    const instance = await this.prisma.dicomInstance.findFirst({
      where: {
        sopInstanceUid: objectUid,
        dicomSeries: { dicomStudy: { tenantId } },
      },
      select: { storageKey: true, contentType: true },
    });
    if (!instance) throw new NotFoundException("DICOM object not found");

    const { data, contentType } = await this.storage.get(instance.storageKey);
    return { data, contentType: instance.contentType || contentType };
  }

  async qidoStudies(tenantId: string, query: Record<string, string>) {
    const where: Record<string, unknown> = { tenantId };
    if (query.StudyInstanceUID) where.studyInstanceUid = query.StudyInstanceUID;
    if (query.AccessionNumber) where.accessionNumber = query.AccessionNumber;
    if (query.Modality) where.modality = query.Modality;

    const fuzzy = query.fuzzymatching?.toLowerCase() === "true";
    if (query.StudyDescription) {
      if (fuzzy) {
        (where as { OR?: unknown[] }).OR = [
          {
            studyDescription: {
              contains: query.StudyDescription,
              mode: "insensitive",
            },
          },
        ];
      } else {
        where.studyDescription = query.StudyDescription;
      }
    }

    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);

    const studies = await this.prisma.dicomStudy.findMany({
      where,
      include: {
        series: {
          select: {
            seriesInstanceUid: true,
            modality: true,
            seriesNumber: true,
            numberOfInstances: true,
          },
        },
      },
      orderBy: { studyDate: "desc" as const },
      skip: offset,
      take: limit,
    });

    return studies.map((study) => buildStudyJson(study, this.baseUrl()));
  }

  private baseUrl() {
    const apiBase =
      process.env.API_BASE_URL || process.env.PUBLIC_API_URL || "";
    return apiBase ? `${apiBase}/dicomweb` : "/dicomweb";
  }
}

function clampLimit(value: string | undefined): number {
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return 50;
  return Math.min(n, 200);
}

function clampOffset(value: string | undefined): number {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

export type { MultipartPart };
