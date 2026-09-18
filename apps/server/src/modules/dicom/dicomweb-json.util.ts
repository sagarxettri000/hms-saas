import { NotFoundException } from "@nestjs/common";

export type DicomJsonAttribute = {
  vr: string;
  Value?: unknown[];
  BulkDataURI?: string;
};

export function buildSeriesJson(
  series: {
    seriesInstanceUid: string;
    seriesNumber?: string | null;
    seriesDescription?: string | null;
    modality?: string | null;
    numberOfInstances: number;
    dicomStudy:
      | {
          studyInstanceUid: string;
          studyDate?: Date | null;
          studyDescription?: string | null;
          accessionNumber?: string | null;
          patientId?: string | null;
        }
      | undefined;
  },
  baseUrl: string,
): Record<string, DicomJsonAttribute> {
  const attrs: Record<string, DicomJsonAttribute> = {};

  attrs["0020000E"] = { vr: "UI", Value: [series.seriesInstanceUid] };
  if (series.seriesNumber)
    attrs["00200011"] = { vr: "IS", Value: [series.seriesNumber] };
  if (series.seriesDescription)
    attrs["0008103E"] = { vr: "LO", Value: [series.seriesDescription] };
  if (series.modality)
    attrs["00080060"] = { vr: "CS", Value: [series.modality] };
  attrs["00201209"] = { vr: "IS", Value: [String(series.numberOfInstances)] };

  const study = series.dicomStudy;
  if (study) {
    attrs["0020000D"] = { vr: "UI", Value: [study.studyInstanceUid] };
    if (study.studyDate) {
      attrs["00080020"] = { vr: "DA", Value: [dateToDa(study.studyDate)] };
      attrs["00080030"] = { vr: "TM", Value: [timeToTm(study.studyDate)] };
    }
  }

  return attrs;
}

export function buildInstanceJson(
  instance: {
    sopInstanceUid: string;
    sopClassUid?: string | null;
    instanceNumber?: string | null;
    rows?: number | null;
    columns?: number | null;
    dicomSeries: {
      seriesInstanceUid: string;
      seriesNumber?: string | null;
      modality?: string | null;
      dicomStudy: { studyInstanceUid: string; studyDate?: Date | null };
    };
  },
  baseUrl: string,
): Record<string, DicomJsonAttribute> {
  const attrs: Record<string, DicomJsonAttribute> = {};
  const { dicomSeries } = instance;

  attrs["00080018"] = { vr: "UI", Value: [instance.sopInstanceUid] };
  if (instance.sopClassUid)
    attrs["00080016"] = { vr: "UI", Value: [instance.sopClassUid] };
  if (instance.instanceNumber)
    attrs["00200013"] = { vr: "IS", Value: [instance.instanceNumber] };
  if (instance.rows !== null && instance.rows !== undefined)
    attrs["00280010"] = { vr: "US", Value: [instance.rows] };
  if (instance.columns !== null && instance.columns !== undefined)
    attrs["00280011"] = { vr: "US", Value: [instance.columns] };

  attrs["0020000E"] = { vr: "UI", Value: [dicomSeries.seriesInstanceUid] };
  if (dicomSeries.seriesNumber)
    attrs["00200011"] = { vr: "IS", Value: [dicomSeries.seriesNumber] };
  if (dicomSeries.modality)
    attrs["00080060"] = { vr: "CS", Value: [dicomSeries.modality] };
  attrs["0020000D"] = {
    vr: "UI",
    Value: [dicomSeries.dicomStudy.studyInstanceUid],
  };

  return attrs;
}

export function buildStudyJson(
  study: {
    studyInstanceUid: string;
    studyDate?: Date | null;
    studyDescription?: string | null;
    accessionNumber?: string | null;
    modality?: string | null;
    referringPhysician?: string | null;
    bodyPart?: string | null;
    patientId?: string | null;
    series: {
      seriesInstanceUid: string;
      modality?: string | null;
      seriesNumber?: string | null;
      numberOfInstances: number;
    }[];
  },
  baseUrl: string,
): Record<string, DicomJsonAttribute> {
  const attrs: Record<string, DicomJsonAttribute> = {};

  attrs["0020000D"] = { vr: "UI", Value: [study.studyInstanceUid] };
  if (study.studyDate) {
    attrs["00080020"] = { vr: "DA", Value: [dateToDa(study.studyDate)] };
    attrs["00080030"] = { vr: "TM", Value: [timeToTm(study.studyDate)] };
  }
  if (study.studyDescription)
    attrs["00081030"] = { vr: "LO", Value: [study.studyDescription] };
  if (study.accessionNumber)
    attrs["00080050"] = { vr: "SH", Value: [study.accessionNumber] };
  if (study.modality) attrs["00080061"] = { vr: "CS", Value: [study.modality] };
  if (study.referringPhysician)
    attrs["00080090"] = buildPersonName(study.referringPhysician);
  if (study.patientId)
    attrs["00100020"] = { vr: "LO", Value: [study.patientId] };

  if (study.series?.length) {
    attrs["00201208"] = { vr: "IS", Value: [String(study.series.length)] };
  }

  return attrs;
}

export function buildPersonName(name: string): DicomJsonAttribute {
  // Accept "Last^First" DICOM format; expose as Alphabetic person name.
  return { vr: "PN", Value: [{ Alphabetic: name }] };
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

export function notFound(what: string): never {
  throw new NotFoundException(what);
}
