import * as dicomParser from "dicom-parser";

export interface DicomPatientInfo {
  patientId?: string;
  patientName?: string;
}

export interface DicomInstanceMetadata {
  sopInstanceUid?: string;
  sopClassUid?: string;
  instanceNumber?: string;
  rows?: number;
  columns?: number;
  numberOfFrames?: number;
  bitsAllocated?: number;
  samplesPerPixel?: number;
  photometricInterpretation?: string;
  transferSyntax?: string;
}

export interface DicomSeriesMetadata {
  seriesInstanceUid?: string;
  seriesNumber?: string;
  seriesDescription?: string;
  modality?: string;
  bodyPart?: string;
}

export interface DicomStudyMetadata {
  studyInstanceUid?: string;
  studyDate?: Date;
  studyDescription?: string;
  accessionNumber?: string;
  modality?: string;
  bodyPartExamined?: string;
  referringPhysician?: string;
  institutionName?: string;
  patient?: DicomPatientInfo;
}

export interface DicomFileMetadata {
  dataset: dicomParser.DataSet;
  study: DicomStudyMetadata;
  series: DicomSeriesMetadata;
  instance: DicomInstanceMetadata;
}

const TAGS = {
  patientName: "x00100010",
  patientId: "x00100020",
  studyDate: "x00080020",
  studyTime: "x00080030",
  studyDescription: "x00081030",
  accessionNumber: "x00080050",
  modality: "x00080060",
  seriesDescription: "x0008103e",
  referringPhysicianName: "x00080090",
  institutionName: "x00080080",
  studyInstanceUid: "x0020000d",
  seriesInstanceUid: "x0020000e",
  seriesNumber: "x00200011",
  bodyPartExamined: "x00180015",
  sopInstanceUid: "x00080018",
  sopClassUid: "x00080016",
  instanceNumber: "x00200013",
  rows: "x00280010",
  columns: "x00280011",
  samplesPerPixel: "x00280002",
  photometricInterpretation: "x00280004",
  bitsAllocated: "x00280100",
  numberOfFrames: "x00280008",
  transferSyntax: "x00020010",
} as const;

export function extractDicomMetadata(buffer: Buffer): DicomFileMetadata {
  const dataset = dicomParser.parseDicom(buffer);

  const studyDate = combineDateTime(
    dataset.string(TAGS.studyDate),
    dataset.string(TAGS.studyTime),
  );

  return {
    dataset,
    study: {
      studyInstanceUid: dataset.string(TAGS.studyInstanceUid),
      studyDate,
      studyDescription: dataset.string(TAGS.studyDescription),
      accessionNumber: dataset.string(TAGS.accessionNumber),
      modality: dataset.string(TAGS.modality),
      bodyPartExamined: dataset.string(TAGS.bodyPartExamined),
      referringPhysician: dataset.string(TAGS.referringPhysicianName),
      institutionName: dataset.string(TAGS.institutionName),
      patient: {
        patientId: dataset.string(TAGS.patientId),
        patientName: dataset.string(TAGS.patientName),
      },
    },
    series: {
      seriesInstanceUid: dataset.string(TAGS.seriesInstanceUid),
      seriesNumber: dataset.string(TAGS.seriesNumber),
      seriesDescription: dataset.string(TAGS.seriesDescription),
      modality: dataset.string(TAGS.modality),
      bodyPart: dataset.string(TAGS.bodyPartExamined),
    },
    instance: {
      sopInstanceUid: dataset.string(TAGS.sopInstanceUid),
      sopClassUid: dataset.string(TAGS.sopClassUid),
      instanceNumber: dataset.string(TAGS.instanceNumber),
      rows: dataset.intString(TAGS.rows),
      columns: dataset.intString(TAGS.columns),
      numberOfFrames: dataset.intString(TAGS.numberOfFrames),
      bitsAllocated: dataset.intString(TAGS.bitsAllocated),
      samplesPerPixel: dataset.intString(TAGS.samplesPerPixel),
      photometricInterpretation: dataset.string(TAGS.photometricInterpretation),
      transferSyntax: dataset.string(TAGS.transferSyntax),
    },
  };
}

function combineDateTime(
  dateString: string | undefined,
  timeString: string | undefined,
): Date | undefined {
  if (!dateString) return undefined;
  const isoDate = dateString.replace(/\./g, "");
  const iso = timeString
    ? `${isoDate}T${timeString.replace(/\..*$/, "").replace(/:/g, "")}`
    : `${isoDate}T000000`;
  const parsed = new Date(
    `${iso.slice(0, 4)}-${iso.slice(4, 6)}-${iso.slice(6, 8)}T${iso.slice(9, 11)}:${iso.slice(11, 13)}:${iso.slice(13, 15)}`,
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}