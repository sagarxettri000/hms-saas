const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

function esc(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function txt(s: string): string {
  return `(${esc(s)})`;
}

function fmtNum(v: unknown, precision?: number): string {
  const n = Number(v);
  if (isNaN(n)) return String(v ?? "");
  if (precision != null && isFinite(n)) return n.toFixed(precision);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function dateStr(d: unknown): string {
  if (!d) return "";
  const dt = new Date(d as any);
  return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

function dateTimeStr(d: unknown): string {
  if (!d) return "";
  const dt = new Date(d as any);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

class PdfPage {
  lines: string[] = [];
  private py: number;

  constructor(private pageW = PAGE_W, private pageH = PAGE_H, private margin = MARGIN) {
    this.py = pageH - margin;
  }

  get y() { return this.py; }
  get bottom() { return 58; }
  get usableW() { return this.pageW - this.margin * 2; }

  text(x: number, y: number, value: string, size = 10, color = "0 0 0") {
    this.lines.push("BT");
    this.lines.push(`/F1 ${size} Tf`);
    this.lines.push(`${color} rg`);
    this.lines.push(`${x} ${y} Td`);
    this.lines.push(`${txt(value)} Tj`);
    this.lines.push("ET");
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.lines.push(`${color} rg`);
    this.lines.push(`${x} ${y} ${w} ${h} re f`);
    this.lines.push("0 0 0 rg");
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    this.lines.push(`${x1} ${y1} m ${x2} ${y2} l 0.6 w S`);
  }

  gap(n: number) { this.py -= n; }
  moveTo(y: number) { this.py = y; }
}

function assemblePdf(pages: PdfPage[]): Buffer {
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  function addObj(body: string): number {
    const idx = offsets.length + 1;
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${idx} 0 obj\n${body}\nendobj\n`;
    return idx;
  }

  addObj("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjs: number[] = [];

  for (const p of pages) {
    const stream = p.lines.join("\n");
    const contentIdx = addObj(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const fontIdx = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIdx = addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIdx} 0 R /Resources << /Font << /F1 ${fontIdx} 0 R >> >> >>`);
    pageObjs.push(pageIdx);
  }

  const kids = pageObjs.map((i) => `${i} 0 R`).join(" ");
  const pagesObj = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;

  let pdf2 = "%PDF-1.4\n";
  const offsets2: number[] = [];
  let objNum = 0;

  function add2(body: string): number {
    objNum++;
    offsets2.push(Buffer.byteLength(pdf2, "latin1"));
    pdf2 += `${objNum} 0 obj\n${body}\nendobj\n`;
    return objNum;
  }

  add2("<< /Type /Catalog /Pages 2 0 R >>");
  add2(pagesObj);

  for (const p of pages) {
    const stream = p.lines.join("\n");
    add2(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    add2("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const contentNum = objNum - 2;
    const fontNum = objNum;
    add2(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${fontNum} 0 R >> >> >>`);
  }

  const xref = Buffer.byteLength(pdf2, "latin1");
  pdf2 += `xref\n0 ${offsets2.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets2) pdf2 += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf2 += `trailer\n<< /Size ${offsets2.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf2, "latin1");
}

export interface FlowReportMarker {
  code: string;
  name: string;
  fluorochrome: string;
}

export interface FlowReportMarkerResult {
  markerId: string;
  markerCode?: string;
  percentage?: number | null;
  absoluteCount?: number | null;
  mfi?: number | null;
  unit?: string;
  valueText?: string;
  isAbnormal?: boolean | null;
  isCritical?: boolean | null;
  status: string;
  notes?: string;
}

export interface FlowReportPopulation {
  id: string;
  parentId?: string | null;
  name: string;
  sortOrder: number;
  percentage?: number | null;
  absoluteCount?: number | null;
  countUnit?: string;
  qualitative?: string;
  status: string;
  notes?: string;
  markerResults: FlowReportMarkerResult[];
}

export interface FlowReportRun {
  acquisitionStatus?: string;
  qcStatus?: string;
  compensationStatus?: string;
  numberOfEvents?: number;
  numberOfParameters?: number;
  startedAt?: any;
  completedAt?: any;
  instrumentName?: string | null;
}

export interface FlowReportData {
  orderNumber: string;
  status: string;
  isStat: boolean;
  isEmergency: boolean;
  orderedAt: any;
  collectedAt?: any;
  receivedAt?: any;
  processedAt?: any;
  verifiedAt?: any;
  approvedAt?: any;
  reportedAt?: any;
  verifiedByName?: string | null;
  approvedByName?: string | null;
  clinicalNote?: string;
  patient: {
    name: string;
    mrn?: string;
    hospitalNumber?: string;
    gender?: string;
    age?: string;
    dateOfBirth?: any;
  };
  samples?: { specimenType: string; barcode?: string; container?: string; status: string; collectedAt?: any }[];
  panel: {
    code: string;
    name: string;
    specimenType?: string;
    container?: string;
    markers: FlowReportMarker[];
  };
  gatingStrategy?: string | null;
  resultSummary?: string | null;
  runs?: FlowReportRun[];
  populations: { rows: FlowReportPopulation[]; tree?: any[] };
}

interface TenantData {
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  panNumber?: string;
  vatNumber?: string;
  registrationNumber?: string;
}

const RIGHT = PAGE_W - MARGIN;

class FlowReportBuilder {
  pages: PdfPage[] = [];
  private cur: PdfPage;

  constructor(private resume: { title: string; orderNumber: string; panel: string }) {
    this.cur = new PdfPage();
    this.pages.push(this.cur);
  }

  get y() { return this.cur.y; }

  text(x: number, y: number, value: string, size = 10, color = "0 0 0") {
    this.cur.text(x, y, value, size, color);
  }

  gap(n: number) { this.cur.gap(n); }
  line() { this.cur.line(MARGIN, this.cur.y, RIGHT, this.cur.y); }
  moveTo(y: number) { this.cur.moveTo(y); }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.cur.rect(x, y, w, h, color);
  }

  ensureSpace(needed: number) {
    if (this.cur.y - needed < this.cur.bottom + 10) this.newPage();
  }

  newPage() {
    const p = new PdfPage();
    this.pages.push(p);
    this.cur = p;
    this.cur.gap(4);
    this.cur.line(MARGIN, this.cur.y, RIGHT, this.cur.y);
    this.cur.gap(7);
    this.cur.text(MARGIN, this.cur.y, `${this.resume.title}  |  ${this.resume.orderNumber}  |  ${this.resume.panel}`, 8, "0.4 0.4 0.4");
    this.cur.text(RIGHT, this.cur.y, "(continued)", 8, "0.4 0.4 0.4");
    this.cur.gap(11);
    this.cur.line(MARGIN, this.cur.y, RIGHT, this.cur.y);
    this.cur.gap(10);
  }
}

function tenantAddr(t: TenantData): string {
  return [t.addressLine1, t.addressLine2, t.city || t.district, t.province, t.country].filter(Boolean).join(", ");
}

function markerValue(mr: FlowReportMarkerResult): string {
  if (mr.valueText) return mr.valueText;
  if (mr.percentage != null) return `${fmtNum(mr.percentage)}%`;
  if (mr.absoluteCount != null) return `${fmtNum(mr.absoluteCount)} ${mr.unit ?? "cells/uL"}`.trim();
  if (mr.mfi != null) return `MFI ${fmtNum(mr.mfi)}`;
  return "—";
}

function markerFlagColor(mr: FlowReportMarkerResult): string {
  return mr.isCritical ? "0.8 0.1 0.1" : mr.isAbnormal ? "0.8 0.5 0" : "0 0 0";
}

export function buildFlowCytometryReportPdf(
  report: FlowReportData,
  hospital: TenantData,
  generatedBy?: string,
): Buffer {
  const b = new FlowReportBuilder({
    title: "FLOW CYTOMETRY REPORT",
    orderNumber: report.orderNumber,
    panel: report.panel?.code || "",
  });
  const right = RIGHT;

  // Header (page 1 only)
  b.text(MARGIN, b.y, hospital.name, 16, "0.12 0.24 0.4");
  b.gap(14);
  const addr = tenantAddr(hospital);
  if (addr) { b.text(MARGIN, b.y, addr, 9, "0.35 0.35 0.35"); b.gap(11); }
  const regLine = [hospital.panNumber ? `PAN: ${hospital.panNumber}` : "", hospital.vatNumber ? `VAT: ${hospital.vatNumber}` : "", hospital.registrationNumber ? `Reg: ${hospital.registrationNumber}` : ""].filter(Boolean).join("  |  ");
  if (regLine) { b.text(MARGIN, b.y, regLine, 8, "0.4 0.4 0.4"); b.gap(10); }
  const contact = [hospital.phone, hospital.email, hospital.website].filter(Boolean).join(" | ");
  if (contact) { b.text(MARGIN, b.y, contact, 8, "0.4 0.4 0.4"); b.gap(10); }
  b.line();
  b.gap(6);

  // Title
  b.text(MARGIN, b.y, "FLOW CYTOMETRY REPORT", 14, "0.12 0.24 0.4");
  b.gap(12);
  b.text(MARGIN, b.y, "Department of Pathology — Immunophenotyping", 10, "0.3 0.3 0.3");
  if (report.isStat) {
    b.text(right, b.y + 4, "STAT", 12, "0.8 0.1 0.1");
  }
  b.gap(16);

  // Order info
  const infoY = b.y;
  const infoRow = (label: string, value: string, x: number, y: number) => {
    b.text(x, y, label, 9, "0.4 0.4 0.4");
    b.text(x + 70, y, value, 10, "0 0 0");
  };
  infoRow("Order #:", report.orderNumber, MARGIN, infoY);
  infoRow("Status:", report.status.replace(/_/g, " "), MARGIN + 260, infoY);
  b.gap(14);
  infoRow("Ordered:", dateTimeStr(report.orderedAt), MARGIN, b.y);
  if (report.verifiedAt) infoRow("Verified:", dateTimeStr(report.verifiedAt), MARGIN + 260, b.y);
  b.gap(14);
  if (report.processedAt) { infoRow("Processed:", dateTimeStr(report.processedAt), MARGIN, b.y); b.gap(14); }
  if (report.approvedAt) {
    const approvedStr = report.approvedByName
      ? `${dateTimeStr(report.approvedAt)}  (${report.approvedByName})`
      : dateTimeStr(report.approvedAt);
    infoRow("Approved:", approvedStr, MARGIN, b.y);
    b.gap(14);
  }
  if (report.reportedAt) { infoRow("Reported:", dateTimeStr(report.reportedAt), MARGIN, b.y); b.gap(14); }

  // Patient
  b.moveTo(infoY - 42);
  b.line();
  b.gap(4);
  b.text(MARGIN, b.y, "PATIENT DETAILS", 9, "0.4 0.4 0.4");
  b.gap(14);
  infoRow("Name:", report.patient.name, MARGIN, b.y);
  if (report.patient.hospitalNumber) infoRow("Hosp. #:", report.patient.hospitalNumber, MARGIN + 260, b.y);
  b.gap(14);
  if (report.patient.mrn) infoRow("MRN:", report.patient.mrn, MARGIN, b.y);
  if (report.patient.dateOfBirth) infoRow("DOB:", dateStr(report.patient.dateOfBirth), MARGIN + 260, b.y);
  b.gap(14);
  if (report.patient.gender) infoRow("Gender:", report.patient.gender, MARGIN, b.y);
  if (report.patient.age) infoRow("Age:", String(report.patient.age), MARGIN + 260, b.y);
  b.gap(14);

  // Specimens
  if (report.samples && report.samples.length > 0) {
    b.gap(4);
    b.line();
    b.gap(4);
    b.text(MARGIN, b.y, "SPECIMENS", 9, "0.4 0.4 0.4");
    b.gap(14);
    for (const s of report.samples) {
      const parts = [s.specimenType, s.collectedAt ? `Collected: ${dateStr(s.collectedAt)}` : "", `Status: ${s.status}`].filter(Boolean);
      b.text(MARGIN, b.y, parts.join("  |  "), 9);
      if (s.barcode) {
        b.gap(11);
        b.ensureSpace(30);
        b.text(MARGIN, b.y, `Barcode: ${s.barcode}`, 8, "0.4 0.4 0.4");
      }
      b.gap(14);
    }
  }

  // Panel
  b.gap(4);
  b.line();
  b.gap(4);
  b.text(MARGIN, b.y, "PANEL", 9, "0.4 0.4 0.4");
  b.gap(14);
  infoRow("Panel:", `${report.panel.name} (${report.panel.code})`, MARGIN, b.y);
  if (report.panel.specimenType) infoRow("Specimen:", report.panel.specimenType, MARGIN + 260, b.y);
  b.gap(14);
  if (report.panel.container) infoRow("Container:", report.panel.container, MARGIN, b.y);
  b.gap(14);
  const markerLayout = (report.panel.markers || [])
    .map((m) => `${m.name}${m.fluorochrome ? ` ${m.fluorochrome}` : ""}`)
    .join(", ");
  if (markerLayout) {
    b.text(MARGIN, b.y, `Markers: ${markerLayout.slice(0, 100)}`, 9, "0.3 0.3 0.3");
    b.gap(14);
  }

  // Acquisition runs
  if (report.runs && report.runs.length > 0) {
    b.gap(4);
    b.line();
    b.gap(4);
    b.text(MARGIN, b.y, "ACQUISITION", 9, "0.4 0.4 0.4");
    b.gap(14);
    for (const run of report.runs) {
      b.ensureSpace(28);
      const runParts = [
        run.instrumentName ? `Instrument: ${run.instrumentName}` : "",
        `Acquisition: ${run.acquisitionStatus || "PENDING"}`,
        `QC: ${run.qcStatus || "NOT_RUN"}`,
      ].filter(Boolean);
      b.text(MARGIN, b.y, runParts.join("  |  "), 9);
      b.gap(12);
      const detailParts = [
        run.startedAt ? `Started: ${dateTimeStr(run.startedAt)}` : "",
        run.numberOfEvents ? `Events: ${run.numberOfEvents}` : "",
        run.numberOfParameters ? `Parameters: ${run.numberOfParameters}` : "",
        run.compensationStatus ? `Compensation: ${run.compensationStatus}` : "",
      ].filter(Boolean);
      if (detailParts.length) {
        b.text(MARGIN, b.y, detailParts.join("  |  "), 8, "0.4 0.4 0.4");
        b.gap(12);
      }
    }
  }

  // Populations & marker matrix
  b.gap(4);
  b.line();
  b.gap(4);
  b.text(MARGIN, b.y, "POPULATIONS & MARKER RESULTS", 9, "0.4 0.4 0.4");
  b.gap(14);

  const colX = [MARGIN, MARGIN + 95, MARGIN + 165, MARGIN + 255, MARGIN + 335, MARGIN + 415, MARGIN + 470];
  const colHeaders = ["Marker", "Fluor.", "%", "Abs. Count", "MFI", "Value", "Flag"];

  const rows = report.populations?.rows || [];
  const panelMarkers = report.panel?.markers || [];
  for (const pop of rows) {
    const results = (pop.markerResults || []).filter((mr) => mr.status === "RESULT_ENTERED");
    const blockH = 34 + results.length * 13 + (pop.notes ? 14 : 0);
    b.ensureSpace(blockH);

    const title = [
      pop.name,
      pop.qualitative ? ` ${pop.qualitative}` : "",
      pop.percentage != null ? `  ${fmtNum(pop.percentage)}%` : "",
      pop.absoluteCount != null ? `  ${fmtNum(pop.absoluteCount)} ${pop.countUnit ?? "cells/uL"}` : "",
    ].join("");

    const top = b.y - 2;
    b.rect(MARGIN, top, right - MARGIN, 16, "0.87 0.9 0.95");
    b.text(MARGIN + 4, top + 12, title.slice(0, 90), 9, "0.12 0.24 0.4");
    const headerY = top - 22;
    for (let i = 0; i < colHeaders.length; i++) {
      b.text(colX[i], headerY, colHeaders[i], 8, "0.4 0.4 0.4");
    }
    let rowY = headerY - 12;

    for (const mr of results) {
      const marker = panelMarkers.find((m) => m.code === mr.markerCode);
      b.text(colX[0], rowY, marker?.code || mr.markerCode || "—", 9);
      b.text(colX[1], rowY, (marker?.fluorochrome || "").slice(0, 14), 8, "0.4 0.4 0.4");
      b.text(colX[2], rowY, mr.percentage != null ? fmtNum(mr.percentage) : "", 9);
      b.text(colX[3], rowY, mr.absoluteCount != null ? fmtNum(mr.absoluteCount) : "", 9);
      b.text(colX[4], rowY, mr.mfi != null ? fmtNum(mr.mfi) : "", 9);
      b.text(colX[5], rowY, markerValue(mr).slice(0, 50), 9, markerFlagColor(mr));
      const flag = mr.isCritical ? "CRITICAL" : mr.isAbnormal ? "ABNORMAL" : "";
      b.text(colX[6], rowY, flag, 8, markerFlagColor(mr));
      rowY -= 13;
    }

    b.moveTo(rowY - 4);
    if (pop.notes) {
      b.text(MARGIN + 4, b.y, `Note: ${pop.notes}`, 8, "0.4 0.4 0.4");
      b.gap(12);
    }
    b.gap(4);
  }

  // Gating strategy
  if (report.gatingStrategy) {
    b.ensureSpace(30);
    b.gap(4);
    b.line();
    b.gap(4);
    b.text(MARGIN, b.y, "GATING STRATEGY", 9, "0.4 0.4 0.4");
    b.gap(14);
    const gs = report.gatingStrategy;
    b.text(MARGIN, b.y, gs.slice(0, 100), 9);
    if (gs.length > 100) {
      b.gap(12);
      b.text(MARGIN, b.y, gs.slice(100, 200), 9);
    }
    b.gap(14);
  }

  // Interpretation
  if (report.resultSummary) {
    b.ensureSpace(30);
    b.gap(4);
    b.line();
    b.gap(4);
    b.text(MARGIN, b.y, "INTERPRETATION", 9, "0.4 0.4 0.4");
    b.gap(14);
    const rs = report.resultSummary;
    b.text(MARGIN, b.y, rs.slice(0, 100), 9);
    if (rs.length > 100) {
      b.gap(12);
      b.text(MARGIN, b.y, rs.slice(100, 200), 9);
    }
    b.gap(14);
  }

  // Clinical note
  if (report.clinicalNote) {
    b.ensureSpace(30);
    b.gap(4);
    b.line();
    b.gap(4);
    b.text(MARGIN, b.y, "CLINICAL NOTE", 9, "0.4 0.4 0.4");
    b.gap(14);
    b.text(MARGIN, b.y, report.clinicalNote.slice(0, 100), 9);
    if (report.clinicalNote.length > 100) {
      b.gap(12);
      b.text(MARGIN, b.y, report.clinicalNote.slice(100, 200), 9);
    }
    b.gap(14);
  }

  // Footers on every page + signature block on the last page
  const last = b.pages[b.pages.length - 1];
  for (let i = 0; i < b.pages.length; i++) {
    const p = b.pages[i];
    p.moveTo(60);
    p.line(MARGIN, p.y + 16, right, p.y + 16);
    p.gap(4);
    p.text(MARGIN, p.y, "This is a computer-generated report.", 8, "0.5 0.5 0.5");
    p.text(right, p.y, `Page ${i + 1} of ${b.pages.length}`, 8, "0.5 0.5 0.5");
    if (i === b.pages.length - 1) {
      p.gap(14);
      p.text(MARGIN, p.y, `Reviewed and approved for ${hospital.name}`, 9, "0.3 0.3 0.3");
      if (report.approvedByName) {
        p.text(right, p.y, `Electronically signed by: ${report.approvedByName}`, 8, "0.4 0.4 0.4");
      } else if (generatedBy) {
        p.text(right, p.y, `Generated by ${generatedBy}`, 8, "0.5 0.5 0.5");
      }
    }
  }

  return assemblePdf(b.pages);
}