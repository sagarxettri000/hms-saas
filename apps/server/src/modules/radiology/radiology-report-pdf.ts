const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

function esc(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function txt(s: string): string {
  return `(${esc(s)})`;
}

function dateTimeStr(d: unknown): string {
  if (!d) return "";
  const dt = new Date(d as any);
  return isNaN(dt.getTime())
    ? ""
    : dt.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function dateStr(d: unknown): string {
  if (!d) return "";
  const dt = new Date(d as any);
  return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

class PdfPage {
  lines: string[] = [];
  private py: number;

  constructor(
    private pageW = PAGE_W,
    private pageH = PAGE_H,
    private margin = MARGIN,
  ) {
    this.py = pageH - margin;
  }

  get y() {
    return this.py;
  }
  get bottom() {
    return 60;
  }
  get usableW() {
    return this.pageW - this.margin * 2;
  }

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

  gap(n: number) {
    this.py -= n;
  }
  moveTo(y: number) {
    this.py = y;
  }

  wrapText(
    x: number,
    maxWidth: number,
    text: string,
    size: number,
    color: string,
    lineHeight = 13,
  ) {
    const words = text.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (test.length * size * 0.5 > maxWidth && line) {
        this.text(x, this.py, line, size, color);
        this.gap(lineHeight);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) {
      this.text(x, this.py, line, size, color);
      this.gap(lineHeight);
    }
  }
}

function assemblePdf(pages: PdfPage[]): Buffer {
  let objNum = 0;
  let pdf = "%PDF-1.4\n";
  const offsets2: number[] = [];

  function add2(body: string): number {
    objNum++;
    offsets2.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${objNum} 0 obj\n${body}\nendobj\n`;
    return objNum;
  }

  add2("<< /Type /Catalog /Pages 2 0 R >>");

  const pageObjs: number[] = [];
  const contentObjs: number[] = [];
  for (const p of pages) {
    const stream = p.lines.join("\n");
    const contentIdx = add2(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    contentObjs.push(contentIdx);
    const fontIdx = add2(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    );
    const boldIdx = add2(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    );
    const pageIdx = add2(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIdx} 0 R /Resources << /Font << /F1 ${fontIdx} 0 R /FB ${boldIdx} 0 R >> >> >>`,
    );
    pageObjs.push(pageIdx);
  }

  const kids = pageObjs.map((i) => `${i} 0 R`).join(" ");
  // We need to rewrite the Pages object (obj 2) with the correct kids.
  // Rebuild the whole PDF properly.
  let pdf2 = "%PDF-1.4\n";
  const off: number[] = [];
  let n = 0;
  function add(body: string) {
    n++;
    off.push(Buffer.byteLength(pdf2, "latin1"));
    pdf2 += `${n} 0 obj\n${body}\nendobj\n`;
  }

  const contentIds: number[] = [];
  const fontIds: number[] = [];
  const boldIds: number[] = [];

  for (const p of pages) {
    const stream = p.lines.join("\n");
    add(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    contentIds.push(n);
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    fontIds.push(n);
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    boldIds.push(n);
  }

  const pageObjNums: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    add(
      `<< /Type /Page /Parent 1 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontIds[i]} 0 R /FB ${boldIds[i]} 0 R >> >> >>`,
    );
    pageObjNums.push(n);
  }

  // Rewrite PDF with correct Pages
  let final = "%PDF-1.4\n";
  const finalOff: number[] = [];
  let fn = 0;
  function addF(body: string) {
    fn++;
    finalOff.push(Buffer.byteLength(final, "latin1"));
    final += `${fn} 0 obj\n${body}\nendobj\n`;
  }

  addF("<< /Type /Catalog /Pages 2 0 R >>");
  const pageKids = pageObjNums.map((i) => `${i} 0 R`).join(" ");
  addF(`<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>`);
  for (let i = 0; i < pages.length; i++) {
    const stream = pages[i].lines.join("\n");
    addF(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    addF("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    addF("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    addF(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${fn - 2} 0 R /Resources << /Font << /F1 ${fn - 1} 0 R /FB ${fn} 0 R >> >> >>`,
    );
  }

  const xref = Buffer.byteLength(final, "latin1");
  final += `xref\n0 ${fn + 1}\n0000000000 65535 f \n`;
  for (const off2 of finalOff)
    final += `${String(off2).padStart(10, "0")} 00000 n \n`;
  final += `trailer\n<< /Size ${fn + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(final, "latin1");
}

interface RadiologyReportData {
  hospitalName: string;
  hospitalAddr: string;
  hospitalContact: string;
  orderNumber: string;
  status: string;
  modality: string;
  bodyPart: string;
  isEmergency: boolean;
  orderedAt: any;
  scheduledAt?: any;
  performedAt?: any;
  reportedAt?: any;
  verifiedAt?: any;
  approvedAt?: any;
  patientName: string;
  patientMrn: string;
  patientGender: string;
  patientDob?: any;
  doctorName: string;
  clinicalHistory: string;
  findings: string;
  impression: string;
  report: string;
  imageCount: number;
  generatedBy?: string;
  signedByName?: string;
  verifiedByName?: string;
  approvedByName?: string;
}

export function buildRadiologyReportPdf(data: RadiologyReportData): Buffer {
  const p = new PdfPage();
  const right = PAGE_W - MARGIN;

  // Header
  p.text(MARGIN, p.y, data.hospitalName, 16, "0.12 0.24 0.4");
  p.gap(14);
  if (data.hospitalAddr) {
    p.text(MARGIN, p.y, data.hospitalAddr, 9, "0.35 0.35 0.35");
    p.gap(11);
  }
  if (data.hospitalContact) {
    p.text(MARGIN, p.y, data.hospitalContact, 8, "0.4 0.4 0.4");
    p.gap(10);
  }
  p.line(MARGIN, p.y, right, p.y);
  p.gap(6);

  // Title
  p.text(MARGIN, p.y, "RADIOLOGY REPORT", 14, "0.12 0.24 0.4");
  if (data.isEmergency) {
    p.text(right, p.y + 4, "EMERGENCY", 12, "0.8 0.1 0.1");
  }
  p.gap(16);

  // Order info
  const infoRow = (label: string, value: string, x: number, y: number) => {
    p.text(x, y, label, 9, "0.4 0.4 0.4");
    p.text(x + 70, y, value, 10);
  };
  infoRow("Order #:", data.orderNumber, MARGIN, p.y);
  infoRow("Status:", data.status, MARGIN + 260, p.y);
  p.gap(14);
  infoRow("Modality:", data.modality, MARGIN, p.y);
  if (data.bodyPart) infoRow("Body Part:", data.bodyPart, MARGIN + 260, p.y);
  p.gap(14);
  infoRow("Ordered:", dateTimeStr(data.orderedAt), MARGIN, p.y);
  if (data.performedAt)
    infoRow("Performed:", dateTimeStr(data.performedAt), MARGIN + 260, p.y);

  // Patient
  p.gap(20);
  p.line(MARGIN, p.y, right, p.y);
  p.gap(4);
  p.text(MARGIN, p.y, "PATIENT INFORMATION", 9, "0.4 0.4 0.4");
  p.gap(14);
  infoRow("Name:", data.patientName, MARGIN, p.y);
  if (data.patientMrn) infoRow("MRN:", data.patientMrn, MARGIN + 260, p.y);
  p.gap(14);
  if (data.patientGender) infoRow("Gender:", data.patientGender, MARGIN, p.y);
  if (data.patientDob)
    infoRow("DOB:", dateStr(data.patientDob), MARGIN + 260, p.y);
  p.gap(14);
  if (data.doctorName) {
    infoRow("Referring:", data.doctorName, MARGIN, p.y);
    p.gap(14);
  }

  // Clinical History
  if (data.clinicalHistory) {
    p.gap(4);
    p.line(MARGIN, p.y, right, p.y);
    p.gap(4);
    p.text(MARGIN, p.y, "CLINICAL HISTORY", 9, "0.4 0.4 0.4");
    p.gap(14);
    p.wrapText(MARGIN, p.usableW, data.clinicalHistory, 10, "0 0 0");
  }

  // Findings
  if (data.findings) {
    p.gap(4);
    p.line(MARGIN, p.y, right, p.y);
    p.gap(4);
    p.text(MARGIN, p.y, "FINDINGS", 9, "0.4 0.4 0.4");
    p.gap(14);
    p.wrapText(MARGIN, p.usableW, data.findings, 10, "0 0 0");
  }

  // Impression
  if (data.impression) {
    p.gap(4);
    p.line(MARGIN, p.y, right, p.y);
    p.gap(4);
    p.text(MARGIN, p.y, "IMPRESSION", 9, "0.4 0.4 0.4");
    p.gap(14);
    p.wrapText(MARGIN, p.usableW, data.impression, 10, "0 0 0");
  }

  // Report body
  if (data.report) {
    p.gap(4);
    p.line(MARGIN, p.y, right, p.y);
    p.gap(4);
    p.text(MARGIN, p.y, "REPORT", 9, "0.4 0.4 0.4");
    p.gap(14);
    p.wrapText(MARGIN, p.usableW, data.report, 10, "0 0 0");
  }

  // Images count
  p.gap(4);
  p.line(MARGIN, p.y, right, p.y);
  p.gap(4);
  p.text(MARGIN, p.y, `Attached Images: ${data.imageCount}`, 10);

  // Signature block
  const signatures = [
    { label: "Signed by", name: data.signedByName, at: data.reportedAt },
    { label: "Verified by", name: data.verifiedByName, at: data.verifiedAt },
    { label: "Approved by", name: data.approvedByName, at: data.approvedAt },
  ].filter((s) => !!s.name);
  if (signatures.length) {
    p.gap(20);
    p.line(MARGIN, p.y, right, p.y);
    p.gap(12);
    for (const s of signatures) {
      if (!s.name) continue;
      const when = s.at ? dateTimeStr(s.at) : "";
      p.text(MARGIN, p.y, s.label, 9, "0.4 0.4 0.4");
      p.text(MARGIN + 75, p.y, s.name, 10);
      if (when) p.text(right, p.y, when, 9, "0.4 0.4 0.4");
      p.gap(15);
    }
  } else if (data.generatedBy) {
    p.gap(20);
    p.line(MARGIN, p.y, right, p.y);
    p.gap(12);
    p.text(MARGIN, p.y, "Signed by", 9, "0.4 0.4 0.4");
    p.text(MARGIN + 75, p.y, data.generatedBy, 10);
  }

  // Footer
  p.moveTo(66);
  p.line(MARGIN, p.y + 16, right, p.y + 16);
  p.gap(4);
  p.text(
    MARGIN,
    p.y,
    "This is a computer-generated radiology report.",
    8,
    "0.5 0.5 0.5",
  );
  p.text(right, p.y, dateTimeStr(new Date()), 8, "0.5 0.5 0.5");
  p.gap(14);
  p.text(MARGIN, p.y, `Approved for ${data.hospitalName}`, 9, "0.3 0.3 0.3");
  if (data.generatedBy) {
    p.text(right, p.y, `Generated by ${data.generatedBy}`, 8, "0.5 0.5 0.5");
  }

  return assemblePdf([p]);
}
