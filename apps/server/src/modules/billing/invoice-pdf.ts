const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

import { code128Segments } from "./code128";

function esc(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function txt(s: string): string {
  return `(${esc(s)})`;
}

function fmtMoney(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? "0.00" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  /** Draw a Code128 barcode from pre-computed module segments. */
  barcode(x: number, y: number, height: number, moduleW: number, segments: { x: number; w: number }[]) {
    for (const s of segments) {
      this.rect(x + s.x * moduleW, y, s.w * moduleW, height, "0 0 0");
    }
  }

  gap(n: number) { this.py -= n; }
  moveDown(n: number) { this.py -= n; }
  moveTo(y: number) { this.py = y; }
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  barcode?: string | null;
  type: string;
  status: string;
  issuedDate: any;
  dueDate?: any;
  notes?: string;
  subtotal: any;
  discountAmount: any;
  discountPercent?: any;
  taxAmount: any;
  taxPercent?: any;
  totalAmount: any;
  paidAmount: any;
  dueAmount: any;
  isCredit: boolean;
  printCount: number;
  patient?: {
    firstName: string; middleName?: string; lastName: string;
    mrn?: string; phone?: string; mobile?: string; email?: string;
    gender?: string; dateOfBirth?: any; age?: number | null;
    addressLine1?: string; addressLine2?: string;
    city?: string; district?: string; province?: string; country?: string;
    patientType?: string; isStaff?: boolean;
  } | null;
  customerName?: string;
  customerPhone?: string;
  scheme?: { name?: string; code?: string; discountPercent?: any } | null;
  encounter?: {
    department?: { name?: string };
    doctor?: {
      user?: { firstName?: string; lastName?: string };
      specialization?: string;
      doctorId?: string;
    };
  } | null;
  admission?: { id: string; department?: { name?: string } };
  items: { serviceName: string; description?: string; quantity: any; rate: any; discountAmount?: any; taxAmount?: any; lineTotal: any; doctorId?: string }[];
  payments: { paymentNumber: string; amount: any; method: string; paidAt: any; status: string; transactionId?: string; referenceNumber?: string }[];
  refunds: { refundNumber: string; amount: any; reason: string; status: string; refundMethod: string; refundedAt?: any }[];
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

function tenantAddress(t: TenantData): string {
  const parts = [t.addressLine1, t.addressLine2, t.city || t.district, t.province, t.country].filter(Boolean);
  return parts.join(", ");
}

function patientName(p?: InvoiceData["patient"] | null): string {
  if (!p) return "Walk-in Customer";
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ") || "Walk-in Customer";
}

function titleCasePdf(v: any): string {
  if (!v) return "";
  const s = String(v).toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function patientAge(p?: InvoiceData["patient"] | null): string {
  if (!p) return "";
  if (p.age !== null && p.age !== undefined) return `${p.age} yrs`;
  if (p.dateOfBirth) {
    const dob = new Date(p.dateOfBirth as any);
    if (!isNaN(dob.getTime())) return `${new Date().getFullYear() - dob.getFullYear()} yrs`;
  }
  return "";
}

function patientAddress(p?: InvoiceData["patient"] | null): string {
  if (!p) return "";
  const parts = [p.addressLine1, p.addressLine2, p.city, p.district, p.province, p.country].filter(Boolean);
  return parts.join(", ");
}

function encounterConsultant(enc?: InvoiceData["encounter"] | null): string {
  const user = enc?.doctor?.user;
  if (!user) return "";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const spec = enc?.doctor?.specialization;
  return name ? (spec ? `${name} (${spec})` : name) : "";
}

function headerBlock(p: PdfPage, title: string, hospital: TenantData) {
  p.text(MARGIN, p.y, hospital.name, 16, "0.12 0.24 0.4");
  p.gap(14);
  const addr = tenantAddress(hospital);
  if (addr) { p.text(MARGIN, p.y, addr, 9, "0.35 0.35 0.35"); p.gap(11); }
  const contact = [hospital.phone, hospital.email, hospital.website].filter(Boolean).join(" | ");
  if (contact) { p.text(MARGIN, p.y, contact, 8, "0.4 0.4 0.4"); p.gap(10); }
  const regs = [
    hospital.panNumber ? `PAN: ${hospital.panNumber}` : null,
    hospital.vatNumber ? `VAT: ${hospital.vatNumber}` : null,
    hospital.registrationNumber ? `Reg: ${hospital.registrationNumber}` : null,
  ].filter(Boolean);
  if (regs.length) { p.text(MARGIN, p.y, regs.join("  |  "), 8, "0.4 0.4 0.4"); p.gap(10); }
  p.line(MARGIN, p.y, PAGE_W - MARGIN, p.y);
  p.gap(6);
  p.text(PAGE_W - MARGIN, p.y + 6, title, 14, "0.12 0.24 0.4");
}

function infoRow(p: PdfPage, label: string, value: string, x: number, y: number, labelW = 80) {
  p.text(x, y, label, 9, "0.4 0.4 0.4");
  p.text(x + labelW, y, value, 10, "0 0 0");
}

/**
 * Stamp a scannable Code128 barcode + human-readable value just above the
 * invoice footer. Centered horizontally; only used for Pharmacy bills.
 */
function barcodeBlock(p: PdfPage, value: string) {
  const segments = code128Segments(value);
  // Bars occupy y 70–110; skip rather than overlap content that ends too low
  // (dense single-page invoices).
  if (!segments || p.y < 125) return;
  const moduleW = 1.3;
  const height = 40;
  const totalModules = segments.reduce((s, seg) => s + seg.w, 0);
  const x = (PAGE_W - totalModules * moduleW) / 2;
  const y = 70; // above the footer block (footer text sits at y <= 50)
  let cx = x;
  for (const seg of segments) {
    if (seg.bar) p.rect(cx, y, seg.w * moduleW, height, "0 0 0");
    cx += seg.w * moduleW;
  }
  p.text(PAGE_W / 2 - 45, y + height + 5, value, 8, "0.3 0.3 0.3");
}

function buildInvoicePdfBuffer(pages: PdfPage[]): Buffer {
  const objs: string[] = [];
  const offsets: number[] = [];
  let pdf = "%PDF-1.4\n";

  function addObj(body: string): number {
    const idx = objs.length + 1;
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${idx} 0 obj\n${body}\nendobj\n`;
    objs.push(body);
    return idx;
  }

  addObj("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => 4 + i * 2).join(" 0 R ");
  addObj(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  for (let i = 0; i < pages.length; i++) {
    const stream = pages[i].lines.join("\n");
    const contentIdx = 3 + i * 2;
    const pageIdx = 4 + i * 2;
    const fontIdx = 5 + i * 2;
    addObj(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIdx} 0 R /Resources << /Font << /F1 ${fontIdx} 0 R >> >> >>`);
    addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  }

  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

export function buildInvoicePdf(
  inv: InvoiceData,
  hospital: TenantData,
  generatedBy?: string,
): Buffer {
  const p = new PdfPage();
  const right = PAGE_W - MARGIN;

  headerBlock(p, "INVOICE", hospital);

  // Invoice info block
  const infoY = p.y;
  infoRow(p, "Invoice #:", inv.invoiceNumber, MARGIN, infoY);
  infoRow(p, "Type:", inv.type.replace(/_/g, " "), MARGIN, infoY - 14);
  infoRow(p, "Status:", inv.status, MARGIN, infoY - 28);
  infoRow(p, "Date:", dateStr(inv.issuedDate), MARGIN + 260, infoY);
  if (inv.dueDate) infoRow(p, "Due:", dateStr(inv.dueDate), MARGIN + 260, infoY - 14);

  // Patient info
  p.moveTo(infoY - 50);
  p.line(MARGIN, p.y + 4, right, p.y + 4);
  p.gap(4);
  p.text(MARGIN, p.y, "PATIENT / BILLING DETAILS", 9, "0.4 0.4 0.4");
  p.gap(14);
  infoRow(p, "Name:", inv.patient ? patientName(inv.patient) : (inv.customerName || "Walk-in Customer"), MARGIN, p.y);
  if (inv.patient?.mrn) infoRow(p, "MRN:", inv.patient.mrn, MARGIN + 260, p.y);
  p.gap(14);
  if (inv.patient) {
    infoRow(
      p, "Age/Gender:",
      [patientAge(inv.patient), inv.patient.gender ? titleCasePdf(inv.patient.gender) : null].filter(Boolean).join(" / "),
      MARGIN, p.y,
    );
  }
  const pt = inv.patient;
  if (pt?.phone || pt?.mobile || inv.customerPhone) {
    infoRow(p, "Phone:", inv.customerPhone || pt?.mobile || pt?.phone || "", MARGIN + 260, p.y);
  }
  p.gap(14);
  const patAddr = patientAddress(inv.patient);
  if (patAddr) infoRow(p, "Address:", patAddr, MARGIN, p.y, 56);
  const consultant = encounterConsultant(inv.encounter);
  if (consultant) {
    if (patAddr) p.gap(14);
    infoRow(p, "Consultant:", consultant, MARGIN, p.y, 56);
  }
  if (inv.scheme?.name) {
    p.gap(14);
    infoRow(p, "Scheme/Cat:", inv.scheme.name, MARGIN, p.y, 56);
  }
  if (inv.admission?.department?.name) {
    if (consultant || inv.scheme?.name || patAddr) p.gap(14); else p.gap(0);
    infoRow(p, "Department:", inv.admission.department.name, MARGIN, p.y);
    p.gap(14);
  }
  p.gap(6);

  // Line items table
  p.line(MARGIN, p.y, right, p.y);
  p.gap(2);
  p.text(MARGIN, p.y, "SERVICE DETAILS", 9, "0.4 0.4 0.4");
  p.gap(14);

  const colX = [MARGIN, MARGIN + 240, MARGIN + 290, MARGIN + 340, MARGIN + 410];
  const colHeaders = ["Service", "Qty", "Rate", "Disc", "Amount"];
  p.rect(MARGIN, p.y - 2, right - MARGIN, 16, "0.87 0.9 0.95");
  for (let i = 0; i < colHeaders.length; i++) {
    p.text(colX[i], p.y + 10, colHeaders[i], 9, "0.12 0.24 0.4");
  }
  p.gap(18);

  for (const item of inv.items) {
    if (p.y < p.bottom + 40) break; // single page invoice for now
    const name = item.serviceName.length > 30 ? item.serviceName.slice(0, 28) + ".." : item.serviceName;
    p.text(colX[0], p.y, name, 10);
    p.text(colX[1], p.y, String(Number(item.quantity)), 10);
    p.text(colX[2], p.y, fmtMoney(item.rate), 10);
    p.text(colX[3], p.y, fmtMoney(item.discountAmount), 10);
    p.text(colX[4], p.y, fmtMoney(item.lineTotal), 10);
    p.gap(14);
  }

  p.line(MARGIN, p.y + 4, right, p.y + 4);
  p.gap(10);

  // Totals
  const totalsX = MARGIN + 300;
  const labelX = MARGIN + 380;
  const totalsY = p.y;

  const rows: [string, string][] = [
    ["Subtotal", fmtMoney(inv.subtotal)],
  ];
  if (Number(inv.discountAmount) > 0) rows.push(["Discount", `-${fmtMoney(inv.discountAmount)}`]);
  if (Number(inv.taxAmount) > 0) rows.push(["Tax", fmtMoney(inv.taxAmount)]);
  rows.push(["Total", fmtMoney(inv.totalAmount)]);
  rows.push(["Paid", fmtMoney(inv.paidAmount)]);
  rows.push(["Balance Due", fmtMoney(inv.dueAmount)]);

  for (let i = 0; i < rows.length; i++) {
    const [label, val] = rows[i];
    const isLast = i === rows.length - 1;
    const sz = isLast ? 11 : 10;
    const c = isLast ? "0.12 0.24 0.4" : "0 0 0";
    if (isLast) {
      p.line(totalsX, p.y + 12, right, p.y + 12);
      p.gap(2);
    }
    p.text(totalsX, p.y, label, sz, c);
    p.text(labelX, p.y, val, sz, c);
    p.gap(14);
  }

  // Payments
  if (inv.payments.length > 0) {
    p.gap(6);
    p.line(MARGIN, p.y + 4, right, p.y + 4);
    p.gap(2);
    p.text(MARGIN, p.y, "PAYMENT HISTORY", 9, "0.4 0.4 0.4");
    p.gap(14);

    const payColX = [MARGIN, MARGIN + 130, MARGIN + 220, MARGIN + 340, MARGIN + 430];
    const payHeaders = ["Ref #", "Date", "Method", "Amount", "Status"];
    p.rect(MARGIN, p.y - 2, right - MARGIN, 16, "0.87 0.9 0.95");
    for (let i = 0; i < payHeaders.length; i++) {
      p.text(payColX[i], p.y + 10, payHeaders[i], 9, "0.12 0.24 0.4");
    }
    p.gap(18);

    for (const pay of inv.payments) {
      if (p.y < p.bottom + 20) break;
      p.text(payColX[0], p.y, pay.paymentNumber, 9);
      p.text(payColX[1], p.y, dateStr(pay.paidAt), 9);
      p.text(payColX[2], p.y, pay.method, 9);
      p.text(payColX[3], p.y, fmtMoney(pay.amount), 9);
      p.text(payColX[4], p.y, pay.status, 9);
      p.gap(14);
    }
  }

  // Pharmacy bills carry a unique scannable barcode (their invoice number).
  if (inv.type === "PHARMACY" && inv.barcode) barcodeBlock(p, inv.barcode);

  // Footer
  p.moveTo(50);
  p.line(MARGIN, p.y + 16, right, p.y + 16);
  p.gap(4);
  p.text(MARGIN, p.y, `Print #${inv.printCount + 1}`, 8, "0.5 0.5 0.5");
  p.text(right, p.y, dateTimeStr(new Date()), 8, "0.5 0.5 0.5");
  p.gap(14);
  p.text(MARGIN, p.y, `Thank you for choosing ${hospital.name}.`, 9, "0.3 0.3 0.3");
  if (generatedBy) {
    p.text(right, p.y, `Generated by ${generatedBy}`, 8, "0.5 0.5 0.5");
  }

  return buildInvoicePdfBuffer([p]);
}

export function buildReceiptPdf(
  inv: InvoiceData,
  payment: InvoiceData["payments"][0],
  hospital: TenantData,
  generatedBy?: string,
): Buffer {
  const p = new PdfPage();
  const right = PAGE_W - MARGIN;

  headerBlock(p, "PAYMENT RECEIPT", hospital);

  // Receipt info
  const infoY = p.y;
  infoRow(p, "Receipt #:", payment.paymentNumber, MARGIN, infoY);
  infoRow(p, "Date:", dateTimeStr(payment.paidAt), MARGIN + 260, infoY);
  p.gap(14);
  infoRow(p, "Invoice #:", inv.invoiceNumber, MARGIN, p.y);
  infoRow(p, "Type:", inv.type.replace(/_/g, " "), MARGIN + 260, p.y);
  p.gap(14);

  // Patient info
  p.moveTo(infoY - 42);
  p.line(MARGIN, p.y + 4, right, p.y + 4);
  p.gap(4);
  p.text(MARGIN, p.y, "PATIENT DETAILS", 9, "0.4 0.4 0.4");
  p.gap(14);
  infoRow(p, "Name:", inv.patient ? patientName(inv.patient) : (inv.customerName || "Walk-in Customer"), MARGIN, p.y);
  if (inv.patient?.mrn) infoRow(p, "MRN:", inv.patient.mrn, MARGIN + 260, p.y);
  p.gap(20);

  // Payment details
  p.line(MARGIN, p.y + 4, right, p.y + 4);
  p.gap(4);
  p.text(MARGIN, p.y, "PAYMENT DETAILS", 9, "0.4 0.4 0.4");
  p.gap(14);
  infoRow(p, "Method:", payment.method, MARGIN, p.y);
  p.gap(14);
  if (payment.transactionId) { infoRow(p, "Txn ID:", payment.transactionId, MARGIN, p.y); p.gap(14); }
  if (payment.referenceNumber) { infoRow(p, "Reference:", payment.referenceNumber, MARGIN, p.y); p.gap(14); }
  p.gap(10);

  // Summary box
  const boxY = p.y + 2;
  p.rect(MARGIN, boxY - 60, right - MARGIN, 60, "0.95 0.97 1");
  p.line(MARGIN, boxY - 30, right, boxY - 30);

  p.text(MARGIN + 10, boxY - 8, "Amount Paid", 10, "0 0 0");
  p.text(right - 10, boxY - 8, fmtMoney(payment.amount), 14, "0.12 0.24 0.4");
  p.text(MARGIN + 10, boxY - 22, "Total Invoice", 9, "0.4 0.4 0.4");
  p.text(right - 10, boxY - 22, fmtMoney(inv.totalAmount), 10, "0.4 0.4 0.4");
  p.text(MARGIN + 10, boxY - 36, "Balance Due", 9, "0.4 0.4 0.4");
  p.text(right - 10, boxY - 36, fmtMoney(inv.dueAmount), 10, Number(inv.dueAmount) > 0 ? "0.7 0.2 0.2" : "0.2 0.6 0.3");

  p.moveTo(boxY - 70);

  // Footer
  p.line(MARGIN, p.y + 16, right, p.y + 16);
  p.gap(4);
  p.text(MARGIN, p.y, "This is a computer-generated receipt.", 8, "0.5 0.5 0.5");
  p.text(right, p.y, dateTimeStr(new Date()), 8, "0.5 0.5 0.5");
  p.gap(14);
  p.text(MARGIN, p.y, `Thank you for your payment at ${hospital.name}.`, 9, "0.3 0.3 0.3");

  return buildInvoicePdfBuffer([p]);
}
