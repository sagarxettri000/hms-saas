const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

function esc(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function txt(s: string): string {
  return `(${esc(s)})`;
}

function fmtNum(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? String(v ?? "") : String(n);
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
  get bottom() { return 60; }
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

  const catalogIdx = addObj("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjs: number[] = [];
  const contentObjs: number[] = [];

  for (const p of pages) {
    const stream = p.lines.join("\n");
    const contentIdx = addObj(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const fontIdx = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIdx = addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIdx} 0 R /Resources << /Font << /F1 ${fontIdx} 0 R >> >> >>`);
    pageObjs.push(pageIdx);
    contentObjs.push(contentIdx);
  }

  // Rewrite Pages object with correct kids
  const kids = pageObjs.map((i) => `${i} 0 R`).join(" ");
  const pagesObj = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;

  // Rebuild PDF with correct Pages object
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

interface LabOrderData {
  id: string;
  orderNumber: string;
  status: string;
  isStat: boolean;
  isEmergency: boolean;
  orderedAt: any;
  collectedAt?: any;
  receivedAt?: any;
  processedAt?: any;
  reportedAt?: any;
  verifiedAt?: any;
  approvedAt?: any;
  clinicalNote?: string;
  patient: { firstName: string; middleName?: string; lastName: string; mrn?: string; phone?: string; gender?: string; dateOfBirth?: any };
  doctor?: { user?: { firstName: string; middleName?: string; lastName: string } } | null;
  items: { testName: string; result?: string; resultValue?: any; unit?: string; referenceRange?: string; isAbnormal?: boolean; isCritical?: boolean; notes?: string; status: string }[];
  samples?: { specimenType: string; barcode?: string; collectedAt?: any; status: string }[];
  verifiedBy?: string;
  approvedBy?: string;
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
}

function tenantAddr(t: TenantData): string {
  return [t.addressLine1, t.addressLine2, t.city || t.district, t.province, t.country].filter(Boolean).join(", ");
}

function patientName(p: LabOrderData["patient"]): string {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function buildLabReportPdf(
  order: LabOrderData,
  hospital: TenantData,
  generatedBy?: string,
): Buffer {
  const p = new PdfPage();
  const right = PAGE_W - MARGIN;

  // Header
  p.text(MARGIN, p.y, hospital.name, 16, "0.12 0.24 0.4");
  p.gap(14);
  const addr = tenantAddr(hospital);
  if (addr) { p.text(MARGIN, p.y, addr, 9, "0.35 0.35 0.35"); p.gap(11); }
  const contact = [hospital.phone, hospital.email].filter(Boolean).join(" | ");
  if (contact) { p.text(MARGIN, p.y, contact, 8, "0.4 0.4 0.4"); p.gap(10); }
  p.line(MARGIN, p.y, right, p.y);
  p.gap(6);

  // Title
  p.text(MARGIN, p.y, "LABORATORY REPORT", 14, "0.12 0.24 0.4");
  if (order.isStat) {
    p.text(right, p.y + 4, "STAT", 12, "0.8 0.1 0.1");
  }
  p.gap(16);

  // Order info
  const infoY = p.y;
  const infoRow = (label: string, value: string, x: number, y: number) => {
    p.text(x, y, label, 9, "0.4 0.4 0.4");
    p.text(x + 70, y, value, 10, "0 0 0");
  };
  infoRow("Order #:", order.orderNumber, MARGIN, infoY);
  infoRow("Status:", order.status.replace(/_/g, " "), MARGIN + 260, infoY);
  p.gap(14);
  infoRow("Ordered:", dateTimeStr(order.orderedAt), MARGIN, p.y);
  if (order.verifiedAt) infoRow("Verified:", dateTimeStr(order.verifiedAt), MARGIN + 260, p.y);
  p.gap(14);
  if (order.approvedAt) { infoRow("Approved:", dateTimeStr(order.approvedAt), MARGIN, p.y); p.gap(14); }

  // Patient
  p.moveTo(infoY - 42);
  p.line(MARGIN, p.y + 4, right, p.y + 4);
  p.gap(4);
  p.text(MARGIN, p.y, "PATIENT DETAILS", 9, "0.4 0.4 0.4");
  p.gap(14);
  infoRow("Name:", patientName(order.patient), MARGIN, p.y);
  if (order.patient.mrn) infoRow("MRN:", order.patient.mrn, MARGIN + 260, p.y);
  p.gap(14);
  if (order.patient.gender) infoRow("Gender:", order.patient.gender, MARGIN, p.y);
  if (order.patient.dateOfBirth) infoRow("DOB:", dateStr(order.patient.dateOfBirth), MARGIN + 260, p.y);
  p.gap(14);
  if (order.doctor?.user) {
    const docName = [order.doctor.user.firstName, order.doctor.user.middleName, order.doctor.user.lastName].filter(Boolean).join(" ");
    infoRow("Doctor:", docName, MARGIN, p.y);
    p.gap(14);
  }

  // Samples
  if (order.samples && order.samples.length > 0) {
    p.gap(4);
    p.line(MARGIN, p.y + 4, right, p.y + 4);
    p.gap(4);
    p.text(MARGIN, p.y, "SPECIMENS", 9, "0.4 0.4 0.4");
    p.gap(14);
    for (const s of order.samples) {
      const parts = [s.specimenType, s.barcode ? `Barcode: ${s.barcode}` : "", s.collectedAt ? `Collected: ${dateStr(s.collectedAt)}` : "", `Status: ${s.status}`].filter(Boolean);
      p.text(MARGIN, p.y, parts.join("  |  "), 9);
      p.gap(12);
    }
  }

  // Results table
  p.gap(4);
  p.line(MARGIN, p.y + 4, right, p.y + 4);
  p.gap(4);
  p.text(MARGIN, p.y, "TEST RESULTS", 9, "0.4 0.4 0.4");
  p.gap(14);

  const colX = [MARGIN, MARGIN + 180, MARGIN + 260, MARGIN + 340, MARGIN + 430];
  const colHeaders = ["Test", "Result", "Unit", "Ref. Range", "Flag"];

  p.rect(MARGIN, p.y - 2, right - MARGIN, 16, "0.87 0.9 0.95");
  for (let i = 0; i < colHeaders.length; i++) {
    p.text(colX[i], p.y + 10, colHeaders[i], 9, "0.12 0.24 0.4");
  }
  p.gap(18);

  for (const item of order.items) {
    if (p.y < p.bottom + 40) break;
    const name = item.testName.length > 22 ? item.testName.slice(0, 20) + ".." : item.testName;
    p.text(colX[0], p.y, name, 10);

    const resultStr = item.resultValue != null ? fmtNum(item.resultValue) : item.result || "—";
    const flagColor = item.isCritical ? "0.8 0.1 0.1" : item.isAbnormal ? "0.8 0.5 0" : "0.2 0.6 0.3";
    const flag = item.isCritical ? "CRITICAL" : item.isAbnormal ? "ABNORMAL" : "Normal";

    p.text(colX[1], p.y, resultStr, 10, flagColor);
    p.text(colX[2], p.y, item.unit || "", 9);
    p.text(colX[3], p.y, item.referenceRange || "", 9);
    p.text(colX[4], p.y, flag, 9, flagColor);

    p.gap(14);

    if (item.notes) {
      p.text(colX[0] + 10, p.y, `Note: ${item.notes}`, 8, "0.4 0.4 0.4");
      p.gap(11);
    }
  }

  // Clinical note
  if (order.clinicalNote) {
    p.gap(4);
    p.line(MARGIN, p.y + 4, right, p.y + 4);
    p.gap(4);
    p.text(MARGIN, p.y, "CLINICAL NOTE", 9, "0.4 0.4 0.4");
    p.gap(14);
    p.text(MARGIN, p.y, order.clinicalNote.slice(0, 100), 9);
    if (order.clinicalNote.length > 100) {
      p.gap(11);
      p.text(MARGIN, p.y, order.clinicalNote.slice(100, 200), 9);
    }
  }

  // Footer
  p.moveTo(60);
  p.line(MARGIN, p.y + 16, right, p.y + 16);
  p.gap(4);
  p.text(MARGIN, p.y, "This is a computer-generated report.", 8, "0.5 0.5 0.5");
  p.text(right, p.y, dateTimeStr(new Date()), 8, "0.5 0.5 0.5");
  p.gap(14);
  p.text(MARGIN, p.y, `Reviewed and approved for ${hospital.name}`, 9, "0.3 0.3 0.3");
  if (generatedBy) {
    p.text(right, p.y, `Generated by ${generatedBy}`, 8, "0.5 0.5 0.5");
  }

  return assemblePdf([p]);
}
