import { amountInWords } from "../../common/utils/number-to-words";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const FOOTER_Y = 40;
const HDR_FILL = "0.86 0.9 0.95";
const ACCENT = "0.1 0.22 0.38";
const GRAY = "0.42 0.42 0.42";
const LIGHT = "0.94 0.95 0.97";

function esc(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function clean(s: unknown): string {
  if (s === undefined || s === null) return "";
  return String(s);
}

function fmtMoney(v: unknown, currency = "NPR"): string {
  const n = Number(v);
  if (isNaN(n)) return "0.00";
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: unknown): string {
  if (!d) return "";
  const dt = new Date(d as any);
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function fmtDateTime(d: unknown): string {
  if (!d) return "";
  const dt = new Date(d as any);
  if (isNaN(dt.getTime())) return "";
  return `${fmtDate(dt)} ${String(dt.getHours()).padStart(2, "0")}:${String(
    dt.getMinutes(),
  ).padStart(2, "0")}`;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function nameOf(u: any): string {
  if (!u) return "";
  if (typeof u === "string") return u;
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ");
}

function roleOf(u: any): string {
  if (!u || typeof u === "string") return "";
  return u.role ? titleCase(String(u.role)) : "";
}

function numberText(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? "" : String(n);
}

// ---------------------------------------------------------------------------
// Low-level PDF page accumulator with implicit pagination handles
// ---------------------------------------------------------------------------

class Doc {
  pages: string[][] = [[]];
  y = PAGE_H - MARGIN;
  readonly usableW = PAGE_W - MARGIN * 2;
  private fontScale = 0.48; // approximate Helvetica advance

  get ops(): string[] {
    return this.pages[this.pages.length - 1];
  }

  newPage(): void {
    this.pages.push([]);
    this.y = PAGE_H - MARGIN;
  }

  gap(n: number): void {
    this.y -= n;
  }

  text(
    x: number,
    y: number,
    s: string,
    size = 9,
    color = "0 0 0",
    bold = false,
  ): void {
    const font = bold ? "F2" : "F1";
    this.ops.push(
      `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${esc(s)}) Tj ET`,
    );
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ops.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
  }

  line(x1: number, y1: number, x2: number, y2: number, w = 0.6): void {
    this.ops.push(esc(`${x1} ${y1} m ${x2} ${y2} l ${w} w S`));
  }

  textW(s: string, size: number): number {
    return s.length * size * this.fontScale;
  }

  wrapLines(s: string, maxW: number, size: number): string[] {
    const maxChars = Math.max(1, Math.floor(maxW / (size * this.fontScale)));
    const words = s.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxChars) {
        current += " " + word;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }

  textBlock(
    x: number,
    s: string,
    maxW: number,
    size: number,
    color = "0 0 0",
    bold = false,
    lineGap = 11,
  ): void {
    for (const line of this.wrapLines(s, maxW, size)) {
      this.text(x, this.y, line, size, color, bold);
      this.y -= lineGap;
    }
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface PurchaseOrderItemPdf {
  itemName: string;
  itemCode?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  specification?: string | null;
  hsCode?: string | null;
  unit?: string | null;
  quantity: any;
  unitPrice: any;
  discountAmount?: any;
  taxableAmount?: any;
  taxPercent?: any;
  taxAmount?: any;
  otherCharges?: any;
  lineTotal?: any;
  totalPrice?: any;
  receivedQuantity?: any;
  expectedDelivery?: any;
  batchRequired?: boolean | null;
  expiryRequired?: boolean | null;
  sterilityRequired?: boolean | null;
  coldChainRequired?: boolean | null;
  temperatureRequirement?: string | null;
  warrantyRequired?: boolean | null;
  calibrationRequired?: boolean | null;
  installationRequired?: boolean | null;
  trainingRequired?: boolean | null;
  criticality?: string | null;
}

export interface PurchaseOrderPdfData {
  id: string;
  poNumber: string;
  poType?: string;
  status: string;
  currency?: string;
  revision?: number;
  validityDays?: number | null;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  orderDate?: any;
  expectedDate?: any;
  deliveryAddress?: string | null;
  subtotal?: any;
  discountAmount?: any;
  taxableAmount?: any;
  taxAmount?: any;
  taxPercent?: any;
  tdsAmount?: any;
  freightAmount?: any;
  insuranceAmount?: any;
  otherCharges?: any;
  grandTotal?: any;
  totalAmount?: any;
  terms?: string | null;
  notes?: string | null;
  createdBy?: any;
  updatedBy?: any;
  approvedBy?: any;
  approvedAt?: any;
  vendorAcceptedBy?: any;
  vendorAcceptedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  supplier?: {
    name?: string;
    code?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    billingAddress?: string | null;
    shippingAddress?: string | null;
    panNumber?: string | null;
    vatNumber?: string | null;
    registrationNumber?: string | null;
    category?: string | null;
    paymentTerms?: string | null;
    bankName?: string | null;
    bankAccount?: string | null;
    bankBranch?: string | null;
  } | null;
  store?: {
    name?: string;
    code?: string | null;
    location?: string | null;
  } | null;
  purchaseRequest?: {
    requestNumber?: string;
    justification?: string | null;
    priority?: string | null;
    neededBy?: any;
    department?: string | null;
    requestedBy?: any;
    approvedBy?: any;
    approvedAt?: any;
  } | null;
  goodsReceipts?: Array<{
    grnNumber: string;
    receivedDate?: any;
    invoiceNumber?: string | null;
    items?: Array<{ itemName: string; quantity: any }>;
  }> | null;
  items: PurchaseOrderItemPdf[];
}

interface TenantPdfData {
  name?: string;
  code?: string | null;
  logoUrl?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  district?: string | null;
  province?: string | null;
  country?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  panNumber?: string | null;
  vatNumber?: string | null;
  registrationNumber?: string | null;
  currency?: string | null;
}

// ---------------------------------------------------------------------------
// Shared visual blocks
// ---------------------------------------------------------------------------

function buildAddress(t: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  district?: string | null;
  province?: string | null;
  country?: string | null;
  postalCode?: string | null;
}): string {
  return [
    t.addressLine1,
    t.addressLine2,
    t.city || t.district,
    t.province,
    t.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function drawPageHeader(
  doc: Doc,
  tenant: TenantPdfData | null,
  title: string,
): void {
  // Accent top band
  doc.rect(0, PAGE_H - 6, PAGE_W, 6, ACCENT);
  doc.y = PAGE_H - MARGIN;
  const right = PAGE_W - MARGIN;

  const orgName = tenant?.name || "Hospital";
  doc.text(MARGIN, doc.y, orgName, 15, ACCENT, true);
  doc.gap(15);

  const addr = buildAddress(tenant || {});
  if (addr) {
    doc.textBlock(MARGIN, addr, doc.usableW * 0.6, 8.5, GRAY);
    doc.gap(3);
  }

  const regParts: string[] = [];
  if (tenant?.registrationNumber)
    regParts.push(`Reg: ${tenant.registrationNumber}`);
  if (tenant?.panNumber) regParts.push(`PAN: ${tenant.panNumber}`);
  if (tenant?.vatNumber) regParts.push(`VAT: ${tenant.vatNumber}`);
  if (regParts.length) {
    doc.text(MARGIN, doc.y, regParts.join("   |   "), 8, GRAY);
    doc.gap(10);
  }

  const contactParts: string[] = [];
  if (tenant?.phone) contactParts.push(tenant.phone);
  if (tenant?.email) contactParts.push(tenant.email);
  if (tenant?.website) contactParts.push(tenant.website);
  if (contactParts.length) {
    doc.text(MARGIN, doc.y, contactParts.join("   |   "), 8, GRAY);
    doc.gap(8);
  }

  doc.line(MARGIN, doc.y, right, doc.y, 1);
  doc.gap(8);

  // Title
  doc.text(MARGIN, doc.y, title, 16, ACCENT, true);
  doc.gap(14);
}

function drawMetaField(
  doc: Doc,
  x: number,
  label: string,
  value: string,
): void {
  doc.text(x, doc.y, label, 7.5, GRAY);
  doc.gap(10);
  doc.text(x, doc.y, value || "-", 10, "0 0 0");
  doc.gap(3);
}

function drawSectionHeader(doc: Doc, text: string): void {
  doc.gap(6);
  doc.line(MARGIN, doc.y, PAGE_W - MARGIN, doc.y, 0.8);
  doc.y -= 8;
  doc.text(MARGIN, doc.y, text, 9.5, ACCENT, true);
  doc.gap(11);
}

// ---------------------------------------------------------------------------
// Item table
// ---------------------------------------------------------------------------

interface TableCol {
  label: string;
  w: number;
  align: "left" | "right";
  padLeft: number;
}

function buildItemTable(
  doc: Doc,
  order: PurchaseOrderPdfData,
  tenant: TenantPdfData | null,
  currency: string,
): void {
  const showHsCol = order.items.some(
    (i) => i.hsCode && String(i.hsCode).trim(),
  );
  const showReceivedCol = order.items.some(
    (i) => Number(i.receivedQuantity) > 0,
  );

  const columns: TableCol[] = [
    { label: "SN", w: 18, align: "left", padLeft: 4 },
    { label: "Code", w: 42, align: "left", padLeft: 4 },
    ...(showHsCol
      ? [
          {
            label: "HS Code",
            w: 38,
            align: "left",
            padLeft: 4,
          } satisfies TableCol,
        ]
      : []),
    { label: "Item Description", w: 92, align: "left", padLeft: 4 },
    { label: "Category", w: 32, align: "left", padLeft: 4 },
    { label: "Unit", w: 24, align: "left", padLeft: 4 },
    { label: "Qty", w: 26, align: "right", padLeft: 4 },
    ...(showReceivedCol
      ? [
          {
            label: "Received",
            w: 26,
            align: "right",
            padLeft: 4,
          } satisfies TableCol,
        ]
      : []),
    { label: "Unit Price", w: 44, align: "right", padLeft: 4 },
    { label: "Disc", w: 32, align: "right", padLeft: 4 },
    {
      label: `VAT ${order.items.some((i) => Number(i.taxAmount) > 0) ? "" : "(%)"}`,
      w: 22,
      align: "right",
      padLeft: 4,
    },
    { label: "VAT Amt", w: 42, align: "right", padLeft: 4 },
    { label: "Line Total", w: 50, align: "right", padLeft: 4 },
  ];

  const colW = columns.reduce((s, c) => s + c.w, 0);
  const left = MARGIN + (doc.usableW - colW);
  const xs: number[] = [];
  let cursor = left;
  for (const c of columns) {
    xs.push(cursor);
    cursor += c.w;
  }

  const renderHeader = () => {
    doc.rect(left, doc.y - 2, colW, 15, HDR_FILL);
    columns.forEach((c, i) => {
      const x =
        c.align === "right"
          ? xs[i] + c.w - 4 - doc.textW(c.label, 7.5)
          : xs[i] + c.padLeft;
      doc.text(x, doc.y + 9, c.label, 7.5, ACCENT, true);
    });
    doc.y -= 17;
  };

  renderHeader();
  doc.y -= 2;

  const items = Array.isArray(order.items) ? order.items : [];
  let sn = 0;

  const rowPush = (height: number) => {
    if (doc.y - height < FOOTER_Y + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
      renderHeader();
      doc.y -= 2;
      return true;
    }
    return false;
  };

  for (const item of items) {
    sn++;
    const detailLines: string[] = [];
    const specBits: string[] = [];
    if (item.brand) specBits.push(item.brand);
    if (item.model) specBits.push(item.model);
    if (item.specification) specBits.push(item.specification);
    if (specBits.length) detailLines.push(specBits.join(" | "));

    const descCol = columns[2].w;
    const descLines: string[] = [];
    const itemNameLines = doc.wrapLines(item.itemName || "", descCol - 8, 8.5);
    descLines.push(...itemNameLines);
    for (const dl of detailLines) {
      descLines.push(...doc.wrapLines(dl, descCol - 8, 7.5));
    }

    const rowH = Math.max(16, descLines.length * 10 + 6);

    if (rowPush(rowH)) {
      // page break performed, header re-drawn
    }

    const top = doc.y;
    doc.rect(left, top - 2, colW, rowH, sn % 2 === 1 ? LIGHT : "1 1 1");
    doc.y -= 2;

    const descIndex = columns.findIndex((c) => c.label === "Item Description");
    const cells: string[] = [
      String(sn),
      item.itemCode || "",
      ...(showHsCol ? [String(item.hsCode ?? "")] : []),
      descLines.join("\n"),
      item.category || "",
      item.unit || "",
      numberText(item.quantity),
      ...(showReceivedCol ? [numberText(item.receivedQuantity)] : []),
      fmtMoney(item.unitPrice, currency),
      fmtMoney(item.discountAmount, currency),
      item.taxPercent != null ? `${Number(item.taxPercent)}%` : "",
      fmtMoney(item.taxAmount, currency),
      fmtMoney(item.lineTotal ?? item.totalPrice, currency),
    ];

    columns.forEach((c, i) => {
      const cell = cells[i];
      if (i === descIndex) {
        let ty = top + 2;
        for (const line of descLines) {
          doc.text(
            xs[descIndex] + c.padLeft,
            ty,
            line,
            line.length > 40 ? 7.5 : 8.5,
            "0 0 0",
          );
          ty += 10;
        }
      } else {
        const x =
          c.align === "right"
            ? xs[i] + c.w - 4 - doc.textW(cell, 8.5)
            : xs[i] + c.padLeft;
        doc.text(x, top + 5, cell, 8.5, "0 0 0");
      }
    });

    doc.y = top - rowH;
  }

  // bottom rule
  doc.line(left, doc.y, left + colW, doc.y, 0.8);
  doc.y -= 8;
}

// ---------------------------------------------------------------------------
// Financial summary
// ---------------------------------------------------------------------------

function drawFinancialSummary(
  doc: Doc,
  order: PurchaseOrderPdfData,
  currency: string,
): void {
  const right = PAGE_W - MARGIN;
  const labelX = right - 250;
  const valueX = right - 60;
  const rows: Array<{
    label: string;
    value: string;
    bold?: boolean;
    header?: boolean;
  }> = [
    { label: "Subtotal", value: fmtMoney(order.subtotal, currency) },
    {
      label: "Total Discount",
      value: `(${fmtMoney(order.discountAmount, currency)})`,
    },
    {
      label: "Taxable Amount",
      value: fmtMoney(order.taxableAmount, currency),
      header: true,
    },
    {
      label:
        order.taxPercent != null ? `VAT (${Number(order.taxPercent)}%)` : "VAT",
      value: fmtMoney(order.taxAmount, currency),
    },
    ...(order.tdsAmount != null && Number(order.tdsAmount) > 0
      ? [{ label: "TDS", value: `(${fmtMoney(order.tdsAmount, currency)})` }]
      : []),
    ...(Number(order.freightAmount) > 0
      ? [{ label: "Freight", value: fmtMoney(order.freightAmount, currency) }]
      : []),
    ...(Number(order.insuranceAmount) > 0
      ? [
          {
            label: "Insurance",
            value: fmtMoney(order.insuranceAmount, currency),
          },
        ]
      : []),
    ...(Number(order.otherCharges) > 0
      ? [
          {
            label: "Other Charges",
            value: fmtMoney(order.otherCharges, currency),
          },
        ]
      : []),
    {
      label: "GRAND TOTAL",
      value: fmtMoney(order.grandTotal ?? order.totalAmount, currency),
      bold: true,
    },
  ];

  doc.rect(labelX - 6, doc.y - 4, 140, 8, LIGHT);
  doc.text(labelX, doc.y + 1, "FINANCIAL SUMMARY", 8, ACCENT, true);
  doc.y -= 14;

  for (const row of rows) {
    if (row.header) {
      doc.line(labelX, doc.y + 3, right, doc.y + 3, 0.5);
    }
    doc.text(
      labelX,
      doc.y,
      row.label,
      row.bold ? 10 : 9,
      row.bold ? ACCENT : "0 0 0",
      row.bold,
    );
    doc.text(
      valueX,
      doc.y,
      row.value,
      row.bold ? 10 : 9,
      row.bold ? ACCENT : "0 0 0",
      row.bold,
    );
    doc.y -= 13;
    if (row.bold) doc.gap(2);
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildPurchaseOrderPdf(
  order: PurchaseOrderPdfData,
  tenant: TenantPdfData | null,
  generatedBy?: string,
): Buffer {
  const currency = order.currency || tenant?.currency || "NPR";
  const doc = new Doc();
  const right = PAGE_W - MARGIN;

  drawPageHeader(doc, tenant, "PURCHASE ORDER");

  // 3. PO metadata
  const metaLeftX = MARGIN;
  const metaMidX = MARGIN + doc.usableW / 3;
  const metaRightX = PAGE_W - MARGIN - doc.usableW / 3;

  const metaRows: Array<[number, string, string]> = [
    [metaLeftX, "PO Number", order.poNumber],
    [metaMidX, "PO Date", fmtDate(order.orderDate)],
    [metaRightX, "Status", titleCase(order.status || "DRAFT")],
  ];
  if (order.poType || order.validityDays || order.revision) {
    metaRows.push([
      metaLeftX,
      "PO Type",
      order.poType ? titleCase(order.poType) : "-",
    ]);
    if (order.expectedDate)
      metaRows.push([
        metaMidX,
        "Required Delivery",
        fmtDate(order.expectedDate),
      ]);
    const rev = `REV-${String(order.revision ?? 1).padStart(2, "0")}`;
    metaRows.push([metaRightX, "Revision", rev]);
  }

  for (const [x, label, value] of metaRows) {
    drawMetaField(doc, x, label, value);
  }
  doc.y -= 12;

  // 4. Buyer + 5. Vendor blocks
  drawSectionHeader(doc, "BUYER & VENDOR");
  const blockTop = doc.y;
  const blockColW = (doc.usableW - 24) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + blockColW + 24;

  doc.rect(leftX - 6, doc.y + 4, blockColW, 9, HDR_FILL);
  doc.text(leftX + 2, doc.y + 9, "BUYER / HOSPITAL", 8, ACCENT, true);
  doc.y += 4;

  let maxBlockY = doc.y;

  // Buyer block
  const buyerLines: Array<[string, string]> = [
    ["Organization", tenant?.name || ""],
    ["Address", buildAddress(tenant || {})],
    ["Contact", [tenant?.phone, tenant?.email].filter(Boolean).join(" | ")],
    [
      "PAN / VAT",
      [tenant?.panNumber, tenant?.vatNumber].filter(Boolean).join(" / "),
    ],
    ["Reg. No.", tenant?.registrationNumber || ""],
  ];
  for (const [label, value] of buyerLines) {
    if (!value) continue;
    doc.text(leftX + 2, doc.y, label, 7.5, GRAY);
    doc.text(leftX + 66, doc.y, value, 9, "0 0 0");
    doc.y -= 12;
  }
  maxBlockY = Math.min(maxBlockY, doc.y);

  // Vendor block
  doc.text(rightX + 2, blockTop + 9, "VENDOR / SUPPLIER", 8, ACCENT, true);
  let vendorY = blockTop;
  const vendorLines: Array<[string, string]> = [
    ["Name", order.supplier?.name || "-"],
    ["Code", order.supplier?.code || ""],
    ["Contact", order.supplier?.contactPerson || ""],
    ["Phone", order.supplier?.phone || ""],
    ["Email", order.supplier?.email || ""],
    ["Address", order.supplier?.address || ""],
    ["Billing", order.supplier?.billingAddress || ""],
    ["Shipping", order.supplier?.shippingAddress || ""],
    ["PAN", order.supplier?.panNumber || ""],
    ["VAT", order.supplier?.vatNumber || ""],
    ["Reg. No.", order.supplier?.registrationNumber || ""],
    ["Category", order.supplier?.category || ""],
    [
      "Bank",
      [order.supplier?.bankName, order.supplier?.bankBranch]
        .filter(Boolean)
        .join(" | "),
    ],
    ["A/c No.", order.supplier?.bankAccount || ""],
  ];
  let vendorLinesUsed = 0;
  for (const [label, value] of vendorLines) {
    if (!value) continue;
    if (doc.y - 12 < FOOTER_Y + 24 + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
      doc.text(
        rightX + 2,
        doc.y,
        "VENDOR / SUPPLIER (continued)",
        8,
        ACCENT,
        true,
      );
      doc.y -= 12;
    }
    doc.text(rightX + 2, doc.y, label, 7.5, GRAY);
    doc.text(rightX + 68, doc.y, value, 9, "0 0 0");
    doc.y -= 12;
    vendorLinesUsed++;
  }
  vendorY = blockTop - vendorLinesUsed * 12;
  maxBlockY = Math.min(maxBlockY, doc.y);

  doc.y = maxBlockY - 4;

  // 4. Procurement references
  if (order.purchaseRequest?.requestNumber) {
    drawSectionHeader(doc, "PROCUREMENT REFERENCES");
    const refRows: Array<[string, string]> = [
      ["Request #", order.purchaseRequest.requestNumber],
      ["Requested By", nameOf(order.purchaseRequest.requestedBy) || ""],
      ["Department", order.purchaseRequest.department || ""],
      [
        "Priority",
        order.purchaseRequest.priority
          ? titleCase(order.purchaseRequest.priority)
          : "",
      ],
      ["Needed By", fmtDate(order.purchaseRequest.neededBy)],
    ];
    for (const [label, value] of refRows) {
      if (!value) continue;
      doc.text(MARGIN, doc.y, label, 7.5, GRAY);
      doc.text(MARGIN + 90, doc.y, value, 9, "0 0 0");
      doc.y -= 12;
    }
  }

  // 5. Item table
  drawSectionHeader(doc, "PURCHASE ORDER ITEMS");
  buildItemTable(doc, order, tenant, currency);

  // 6 + 20. Hospital-specific / compliance requirements (only when present)
  const hasProcFlags = order.items.some(
    (i) =>
      i.batchRequired ||
      i.expiryRequired ||
      i.sterilityRequired ||
      i.coldChainRequired ||
      i.temperatureRequirement ||
      i.warrantyRequired ||
      i.calibrationRequired ||
      i.installationRequired ||
      i.trainingRequired ||
      i.criticality,
  );
  if (hasProcFlags) {
    drawSectionHeader(doc, "HOSPITAL-SPECIFIC PROCUREMENT REQUIREMENTS");
    for (const item of order.items) {
      const flags: string[] = [];
      if (item.criticality) flags.push(`Criticality: ${item.criticality}`);
      if (item.batchRequired) flags.push("Batch/Lot required");
      if (item.expiryRequired) flags.push("Expiry required");
      if (item.sterilityRequired) flags.push("Sterility required");
      if (item.coldChainRequired) flags.push("Cold chain required");
      if (item.temperatureRequirement)
        flags.push(`Temp: ${item.temperatureRequirement}`);
      if (item.warrantyRequired) flags.push("Warranty");
      if (item.calibrationRequired) flags.push("Calibration certificate");
      if (item.installationRequired) flags.push("Installation");
      if (item.trainingRequired) flags.push("Training");
      if (!flags.length) continue;
      if (doc.y - 24 < FOOTER_Y + 24) {
        doc.newPage();
        drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
      }
      doc.textBlock(
        MARGIN,
        `${item.itemName}: ${flags.join(", ")}`,
        doc.usableW - 12,
        8.5,
      );
      doc.gap(2);
    }
  }

  // 7. Financial summary
  if (doc.y - 190 < FOOTER_Y + 24) {
    doc.newPage();
    drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
  }
  drawFinancialSummary(doc, order, currency);
  doc.gap(6);

  const grandTotalValue = Number(order.grandTotal ?? order.totalAmount) || 0;
  const words = amountInWords(grandTotalValue, currency);
  if (words) {
    doc.text(MARGIN, doc.y, "Amount in Words:", 8.5, GRAY, true);
    doc.y -= 12;
    doc.textBlock(MARGIN, words, doc.usableW - 12, 9.5);
    doc.gap(2);
  }

  // 8. Payment terms
  const payBits: string[] = [];
  if (order.paymentTerms) payBits.push(String(order.paymentTerms));
  if (order.paymentMethod) payBits.push(titleCase(String(order.paymentMethod)));
  if (order.validityDays) payBits.push(`Valid ${order.validityDays} days`);
  if (payBits.length) {
    if (doc.y - 40 < FOOTER_Y + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
    }
    drawSectionHeader(doc, "PAYMENT TERMS");
    doc.textBlock(MARGIN, payBits.join("   |   "), doc.usableW - 12, 9);
    doc.gap(2);
  }

  // 9. Delivery & logistics
  const delivBits: string[] = [];
  if (order.store?.name) {
    delivBits.push(
      `Store: ${[order.store.name, order.store.location].filter(Boolean).join(" - ")}`,
    );
  }
  if (order.deliveryAddress)
    delivBits.push(`Deliver to: ${order.deliveryAddress}`);
  if (order.expectedDate)
    delivBits.push(`Required by: ${fmtDate(order.expectedDate)}`);
  if (
    order.supplier?.shippingAddress &&
    order.supplier.shippingAddress !== order.deliveryAddress
  )
    delivBits.push(`Supplier shipping: ${order.supplier.shippingAddress}`);
  if (delivBits.length) {
    if (doc.y - 40 < FOOTER_Y + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
    }
    drawSectionHeader(doc, "DELIVERY & LOGISTICS");
    for (const bit of delivBits) {
      doc.textBlock(MARGIN, bit, doc.usableW - 12, 9);
      doc.gap(1);
    }
    doc.gap(2);
  }

  // Goods receipt linkage
  const grns = Array.isArray(order.goodsReceipts) ? order.goodsReceipts : [];
  if (grns.length) {
    if (doc.y - 70 < FOOTER_Y + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
    }
    drawSectionHeader(doc, "GOODS RECEIPTS");
    for (const grn of grns.slice(0, 6)) {
      const receivedQty = (Array.isArray(grn.items) ? grn.items : []).reduce(
        (s, it) => s + (Number(it.quantity) || 0),
        0,
      );
      const invoiceRef = grn.invoiceNumber
        ? ` Invoice: ${grn.invoiceNumber}`
        : "";
      doc.text(MARGIN, doc.y, `${grn.grnNumber}`, 9, "0 0 0", true);
      doc.text(
        right - 140,
        doc.y,
        `Received ${fmtDate(grn.receivedDate)}${invoiceRef} · Qty ${receivedQty}`,
        8.5,
        GRAY,
      );
      doc.y -= 12;
    }
  }

  // 11. Purchase justification
  if (order.purchaseRequest?.justification) {
    if (doc.y - 40 < FOOTER_Y + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
    }
    drawSectionHeader(doc, "PURCHASE JUSTIFICATION");
    doc.textBlock(
      MARGIN,
      order.purchaseRequest.justification,
      doc.usableW - 12,
      9,
    );
    doc.gap(2);
  }

  // 12. Approval workflow
  if (order.approvedBy || order.approvedAt) {
    if (doc.y - 60 < FOOTER_Y + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
    }
    drawSectionHeader(doc, "APPROVAL");
    const approver = nameOf(order.approvedBy) || "-";
    const approverRole = roleOf(order.approvedBy);
    doc.textBlock(
      MARGIN,
      `Approved by: ${approver}${approverRole ? ` (${approverRole})` : ""} on ${fmtDateTime(order.approvedAt)}`,
      doc.usableW - 12,
      9,
    );
    doc.gap(2);
  }

  // 13. Vendor acceptance
  if (order.vendorAcceptedBy || order.vendorAcceptedAt) {
    if (doc.y - 60 < FOOTER_Y + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
    }
    drawSectionHeader(doc, "VENDOR ACCEPTANCE");
    doc.textBlock(
      MARGIN,
      `Accepted by: ${nameOf(order.vendorAcceptedBy) || "-"} on ${fmtDateTime(order.vendorAcceptedAt)}`,
      doc.usableW - 12,
      9,
    );
    doc.gap(2);
  }

  // 14. Terms & conditions
  const termsText = [order.terms, order.notes].filter(Boolean).join("\n\n");
  if (termsText) {
    if (doc.y - 60 < FOOTER_Y + 24) {
      doc.newPage();
      drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
    }
    drawSectionHeader(doc, "TERMS & CONDITIONS");
    for (const line of termsText.split("\n")) {
      doc.textBlock(MARGIN, line, doc.usableW - 12, 8.5);
      doc.gap(1);
    }
  }

  // 16. Document control + signatures
  if (doc.y - 130 < FOOTER_Y + 24) {
    doc.newPage();
    drawPageHeader(doc, tenant, "PURCHASE ORDER (continued)");
  }
  drawSectionHeader(doc, "DOCUMENT CONTROL");
  const ctrlRows: Array<[string, string]> = [
    ["Created By", nameOf(order.createdBy) || "-"],
    ["Created At", fmtDateTime(order.createdAt)],
    ["Last Updated By", nameOf(order.updatedBy) || "-"],
    ["Last Updated At", fmtDateTime(order.updatedAt)],
    ["Generated By", generatedBy || "-"],
    ["Generated At", fmtDateTime(new Date())],
  ];
  for (let i = 0; i < ctrlRows.length; i += 2) {
    const leftLbl = ctrlRows[i][0];
    const leftVal = ctrlRows[i][1];
    const rightLbl = ctrlRows[i + 1] ? ctrlRows[i + 1][0] : "";
    const rightVal = ctrlRows[i + 1] ? ctrlRows[i + 1][1] : "";
    doc.text(MARGIN, doc.y, leftLbl, 7.5, GRAY);
    doc.text(MARGIN + 90, doc.y, leftVal, 9, "0 0 0");
    if (rightLbl) {
      doc.text(MARGIN + 230, doc.y, rightLbl, 7.5, GRAY);
      doc.text(MARGIN + 315, doc.y, rightVal, 9, "0 0 0");
    }
    doc.y -= 12;
  }
  doc.gap(6);

  // 17. Signatures
  const signTop = doc.y;
  doc.text(MARGIN, signTop, "Authorized Signature (Hospital)", 9, "0 0 0");
  doc.line(MARGIN, signTop - 14, MARGIN + 160, signTop - 14, 0.6);
  doc.text(right - 160, signTop, "Authorized Signature (Vendor)", 9, "0 0 0");
  doc.line(right - 160, signTop - 14, right, signTop - 14, 0.6);
  doc.y = signTop - 24;

  // 20. Footer (page numbers appended at serialize time)
  const footerNotes: string[] = [];
  if (tenant?.name) footerNotes.push(tenant.name);
  footerNotes.push(order.poNumber);
  footerNotes.push(`Revision ${String(order.revision ?? 1).padStart(2, "0")}`);
  footerNotes.push("Page {PAGE} of {TOTAL}");
  const footerLine = footerNotes.join("   |   ");

  const pageCount = doc.pages.length;
  doc.pages.forEach((ops, i) => {
    ops.push(
      `${MARGIN} ${FOOTER_Y + 22} m ${right} ${FOOTER_Y + 22} l 0.4 w S`,
    );
    const pageLabel = footerLine
      .replace("{PAGE}", String(i + 1))
      .replace("{TOTAL}", String(pageCount));
    ops.push(
      `BT /F1 7 Tf 0.5 0.5 0.5 rg ${MARGIN} ${FOOTER_Y} Td (${esc(pageLabel)}) Tj ET`,
    );
  });

  // Serialize multi-page PDF
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
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  const startIdx = objs.length + 1;
  for (let i = 0; i < doc.pages.length; i++) {
    const contentId = startIdx + i * 2;
    const pageId = startIdx + i * 2 + 1;
    contentIds.push(contentId);
    pageIds.push(pageId);
  }
  const kids = pageIds.map((p) => `${p} 0 R`).join(" ");
  addObj(`<< /Type /Pages /Kids [${kids}] /Count ${doc.pages.length} >>`);

  doc.pages.forEach((ops, i) => {
    const contentId = contentIds[i];
    const pageId = pageIds[i];
    const stream = ops.join("\n");
    addObj(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    addObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    );
  });

  addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets)
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
