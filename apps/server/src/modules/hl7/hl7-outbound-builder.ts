export interface RadiologyReportData {
  patient: {
    mrn?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth?: Date | null;
    gender?: string | null;
  };
  order: {
    orderNumber: string;
    accessionNumber?: string | null;
    modality?: string | null;
    bodyPart?: string | null;
    status: string;
    reportedAt?: Date | null;
    verifiedAt?: Date | null;
  };
  report?: {
    findings?: string | null;
    impression?: string | null;
    report?: string | null;
  };
  receivingApplication?: string;
  receivingFacility?: string;
}

const FS = "\u001c"; // not used in MLLP body; retained for completeness
void FS;

function hl7Escape(value: string | undefined | null): string {
  return (value ?? "")
    .replace(/\\/g, "\\E\\")
    .replace(/\|/g, "\\F\\")
    .replace(/\^/g, "\\S\\")
    .replace(/~/g, "\\R\\")
    .replace(/&/g, "\\T\\");
}

function hl7Timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

export function buildRadiologyOruReport(
  data: RadiologyReportData,
  opts: { controlId?: string } = {},
): string {
  const now = new Date();
  const controlId = opts.controlId || `ORU.${now.getTime()}`;
  const receivingApp = hl7Escape(data.receivingApplication || "");
  const receivingFac = hl7Escape(data.receivingFacility || "");

  const p = data.patient;
  const o = data.order;
  const r = data.report;

  const mrn = hl7Escape(p.mrn || "");
  const name = `${hl7Escape(p.lastName || "")}^${hl7Escape(p.firstName || "")}`;
  const dob = p.dateOfBirth ? hl7Timestamp(p.dateOfBirth) : "";
  const gender = hl7Escape(p.gender || "");

  const modality = hl7Escape(o.modality || "");
  const bodyPart = hl7Escape(o.bodyPart || "");
  const accession = hl7Escape(o.accessionNumber || "");
  const reportTime = hl7Timestamp(o.reportedAt || o.verifiedAt || now);

  const lines: string[] = [
    `MSH|^~\\&|HMS||${receivingApp}|${receivingFac}|${hl7Timestamp(now)}||ORU^R01|${controlId}|P|2.5`,
    `PID|1|${mrn}||${name}||${dob}|${gender}`,
    `ORC|RE|${hl7Escape(o.orderNumber)}|${accession}`,
    `OBR|1|${hl7Escape(o.orderNumber)}|${accession}|${modality}^${bodyPart}|||||||||||${reportTime}`,
    `OBX|1|TX|1^IMPRESSION||${r?.impression ? hl7Escape(r.impression) : ""}|`,
    `OBX|2|TX|2^FINDINGS||${r?.findings ? hl7Escape(r.findings) : ""}|`,
    `OBX|3|TX|3^REPORT||${r?.report ? hl7Escape(r.report) : ""}|`,
  ];

  return lines.join("\r") + "\r";
}

export const MLLP_SOB = 0x0b;
export const MLLP_EOB = 0x1c;
export const MLLP_CR = 0x0d;

export function frameMllp(message: string): Buffer {
  return Buffer.concat([
    Buffer.from([MLLP_SOB]),
    Buffer.from(message, "utf8"),
    Buffer.from([MLLP_EOB, MLLP_CR]),
  ]);
}