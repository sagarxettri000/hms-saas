import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class DicomWebService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * QIDO-RS: search for studies (GET /studies?StudyInstanceUID=...).
   * Returns DICOMweb study-level metadata as a JSON document.
   */
  async qidoStudies(tenantId: string, query: Record<string, string>) {
    const where: Record<string, unknown> = { tenantId };
    if (query.StudyInstanceUID) where.studyInstanceUid = query.StudyInstanceUID;
    if (query.AccessionNumber) where.accessionNumber = query.AccessionNumber;
    if (query.Modality) where.modality = query.Modality;

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
    });

    const result: Record<string, unknown>[] = [];
    for (const study of studies) {
      const entries: Record<string, unknown> = {
        "0020000D": { vr: "UI", Value: [study.studyInstanceUid] },
      };
      if (study.studyDate) {
        entries["00080020"] = { vr: "DA", Value: [dateToDa(study.studyDate)] };
        entries["00080030"] = { vr: "TM", Value: [timeToTm(study.studyDate)] };
      }
      if (study.studyDescription) {
        entries["00081030"] = { vr: "LO", Value: [study.studyDescription] };
      }
      if (study.accessionNumber) {
        entries["00080050"] = { vr: "SH", Value: [study.accessionNumber] };
      }
      if (study.modality) {
        entries["00080061"] = { vr: "CS", Value: [study.modality] };
      }
      if (study.referringPhysician) {
        entries["00080090"] = {
          vr: "PN",
          Value: [{ Alphabetic: study.referringPhysician }],
        };
      }
      if (study.patientId) {
        entries["00200010"] = { vr: "LO", Value: [study.patientId] };
      }
      result.push(entries);
    }
    return result;
  }

  /**
   * WADO-RS: retrieve a specific instance (GET /studies/:study/series/:series/instances/:instance).
   * Returns the raw DICOM part 10 binary.
   */
  async wadoInstance(
    tenantId: string,
    uids: { studyInstanceUid: string; seriesInstanceUid: string; instanceUid: string },
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
      where: { sopInstanceUid: objectUid, dicomSeries: { dicomStudy: { tenantId } } },
      select: { storageKey: true, contentType: true },
    });
    if (!instance) throw new NotFoundException("DICOM object not found");

    const { data, contentType } = await this.storage.get(instance.storageKey);
    return { data, contentType: instance.contentType || contentType };
  }
}

function dateToDa(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function timeToTm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}${m}${s}`;
}