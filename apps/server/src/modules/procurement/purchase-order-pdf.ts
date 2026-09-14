const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

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

  gap(n: number) { this.py -= n; }
  moveDown(n: number) { this.py -= n; }
  moveTo(y: number) { this.py = y; }
}

interface PurchaseOrderPdfData {
  id: string;
  poNumber: string;
  status: string;
  orderDate?: any;
  expectedDate?: any;
  deliveryAddress?: string;
  terms?: string;
  notes?: string;
  totalAmount: any;
  supplier?: {
    name?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    panNumber?: string;
  } | null;
  store?: { name?: string; location?: string } | null;
  items: {
    itemName: string;
    quantity: any;
    receivedQuantity?: any;
    unit?: string;
    unitPrice: any;
    totalPrice: any;
  }[];
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

function tenantAddress(t: TenantData): string {
  const parts = [t.addressLine1, t.addressLine2, t.city || t.district, t.province, t.country].filter(Boolean);
  return parts.join(", ");
}

function headerBlock(p: PdfPage, title: string, hospital: TenantData) {
  p.text(MARGIN, p.y, hospital.name, 16, "0.12 0.24 0.4");
  p.gap(14);
  const addr = tenantAddress(hospital);
  if (addr) { p.text(MARGIN, p.y, addr, 9, "0.35 0.35 0.35"); p.gap(11); }
  const contact = [hospital.phone, hospital.email].filter(Boolean).join(" | ");
  if (contact) { p.text(MARGIN, p.y, contact, 8, "0.4 0.4 0.4"); p.gap(10); }
  p.line(MARGIN, p.y, PAGE_W - MARGIN, p.y);
  p.gap(6);
  p.text(PAGE_W - MARGIN, p.y + 6, title, 14, "0.12 0.24 0.4");
}

function infoRow(p: PdfPage, label: string, value: string, x: number, y: number, labelW = 80) {
  p.text(x, y, label, 9, "0.4 0.4 0.4");
  p.text(x + labelW, y, value, 10, "0 0 0");
}

function sectionHeader(p: PdfPage, titleText: string) {
  p.line(MARGIN, p.y + 4, PAGE_W - MARGIN, p.y + 4);
  p.gap(4);
  p.text(MARGIN, p.y, titleText, 9, "0.4 0.4 0.4");
  p.gap(14);
}

export function buildPurchaseOrderPdf(
  order: PurchaseOrderPdfData,
  hospital: TenantData,
  generatedBy?: string,
): Buffer {
  const p = new PdfPage();
  const right = PAGE_W - MARGIN;

  headerBlock(p, "PURCHASE ORDER", hospital);

  // PO info
  const infoY = p.y;
  infoRow(p, "PO #:", order.poNumber, MARGIN, infoY);
  infoRow(p, "Date:", dateStr(order.orderDate), MARGIN + 260, infoY);
  infoRow(p, "Status:", order.status.replace(/_/g, " "), MARGIN, infoY - 14);
  if (order.expectedDate) infoRow(p, "Expected:", dateStr(order.expectedDate), MARGIN + 260, infoY - 14);

  // Supplier / store
  p.moveTo(infoY - 50);
  sectionHeader(p, "SUPPLIER & DELIVERY");
  infoRow(p, "Supplier:", order.supplier?.name || "—", MARGIN, p.y);
  infoRow(p, "Store:", order.store?.name || "—", MARGIN + 260, p.y);
  p.gap(14);
  if (order.supplier?.contactPerson) { infoRow(p, "Contact:", order.supplier.contactPerson, MARGIN, p.y); p.gap(14); }
  if (order.supplier?.phone) { infoRow(p, "Phone:", order.supplier.phone, MARGIN, p.y); p.gap(14); }
  if (order.supplier?.email) { infoRow(p, "Email:", order.supplier.email, MARGIN, p.y); p.gap(14); }
  if (order.supplier?.address) { infoRow(p, "Address:", order.supplier.address, MARGIN, p.y); p.gap(14); }
  if (order.supplier?.panNumber) { infoRow(p, "PAN:", order.supplier.panNumber, MARGIN, p.y); p.gap(14); }
  if (order.deliveryAddress) { infoRow(p, "Deliver to:", order.deliveryAddress, MARGIN, p.y); p.gap(14); }
  p.gap(8);

  // Items table
  sectionHeader(p, "ITEM DETAILS");

  const colX = [MARGIN, MARGIN + 220, MARGIN + 330, MARGIN + 390, MARGIN + 470];
  const colHeaders = ["Item", "Qty", "Unit", "Rate", "Amount"];
  p.rect(MARGIN, p.y - 2, right - MARGIN, 16, "0.87 0.9 0.95");
  for (let i = 0; i < colHeaders.length; i++) {
    p.text(colX[i], p.y + 10, colHeaders[i], 9, "0.12 0.24 0.4");
  }
  p.gap(18);

  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    if (p.y < p.bottom + 40) break;
    const name = item.itemName.length > 34 ? item.itemName.slice(0, 32) + ".." : item.itemName;
    p.text(colX[0], p.y, name, 10);
    p.text(colX[1], p.y, String(Number(item.quantity)), 10);
    p.text(colX[2], p.y, item.unit || "", 10);
    p.text(colX[3], p.y, fmtMoney(item.unitPrice), 10);
    p.text(colX[4], p.y, fmtMoney(item.totalPrice), 10);
    p.gap(14);
  }

  p.line(MARGIN, p.y + 4, right, p.y + 4);
  p.gap(10);

  // Totals
  const subtotal = items.reduce(
    (sum, i) => sum + Number(i.totalPrice),
    0,
  );
  const receivedValue = items.reduce(
    (sum, i) => sum + (Number(i.receivedQuantity) || 0) * Number(i.unitPrice),
    0,
  );
  const totalsX = MARGIN + 300;
  const labelX = MARGIN + 380;
  const rows: [string, string][] = [["Subtotal", fmtMoney(subtotal)]];
  if (Number(receivedValue) > 0) rows.push(["Received", fmtMoney(receivedValue)]);
  rows.push(["Total", fmtMoney(order.totalAmount ?? subtotal)]);

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

  // Notes / terms
  if (order.terms || order.notes) {
    p.gap(8);
    sectionHeader(p, "TERMS & NOTES");
    if (order.terms) { infoRow(p, "Terms:", order.terms, MARGIN, p.y); p.gap(14); }
    if (order.notes) { infoRow(p, "Notes:", order.notes, MARGIN, p.y); p.gap(14); }
  }

  // Footer
  p.moveTo(50);
  p.line(MARGIN, p.y + 16, right, p.y + 16);
  p.gap(4);
  p.text(MARGIN, p.y, "This is a computer-generated purchase order document.", 8, "0.5 0.5 0.5");
  p.text(right, p.y, dateTimeStr(new Date()), 8, "0.5 0.5 0.5");
  p.gap(14);
  p.text(MARGIN, p.y, `Thank you for your business with ${hospital.name}.`, 9, "0.3 0.3 0.3");
  if (generatedBy) {
    p.text(right, p.y, `Generated by ${generatedBy}`, 8, "0.5 0.5 0.5");
  }

  // Serialize
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
  const kids = [4].join(" 0 R ");
  addObj(`<< /Type /Pages /Kids [${kids}] /Count 1 >>`);
  const stream = p.lines.join("\n");
  addObj(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  addObj("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 3 0 R /Resources << /Font << /F1 5 0 R >> >> >>");
  addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}