function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfString(value: string): string {
  return `(${escapePdfText(String(value))})`;
}

export interface ReportPdfColumn {
  title: string;
  width: number;
  align?: "left" | "right";
}

export interface ReportPdfOptions {
  title: string;
  subtitle?: string;
  meta: {
    generatedAt?: string;
    user?: string;
    count?: number;
    hospital?: string;
  };
  columns: ReportPdfColumn[];
  rows: string[][];
  totalsRow?: string[];
}

export function buildReportPdf(options: ReportPdfOptions): Buffer {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const rowHeight = 18;
  const headerHeight = 20;
  const tableLeft = margin;
  const usableWidth = pageWidth - margin * 2;
  const totalWeight = options.columns.reduce((s, c) => s + c.width, 0);
  const colWidths = options.columns.map((c) =>
    totalWeight > 0 ? (c.width / totalWeight) * usableWidth : usableWidth / options.columns.length,
  );
  const tableTop = pageHeight - 90;

  const pages: string[][] = [];
  let y = tableTop;
  let page: string[] = [];

  function startHeader(lines: string[], top: number) {
    lines.push("BT");
    lines.push("/F1 10 Tf");
    lines.push("0.87 0.9 0.95 rg");
    let x = tableLeft;
    for (const w of colWidths) {
      lines.push(`${x} ${top - headerHeight} ${w} ${headerHeight} re f`);
      x += w;
    }
    lines.push("0 0 0 rg");
    x = tableLeft;
    for (let i = 0; i < options.columns.length; i++) {
      const col = options.columns[i];
      const w = colWidths[i];
      const tx = col.align === "right" ? x + w - 8 : x + 8;
      lines.push("BT /F1 10 Tf");
      lines.push(`${tx} ${top - 14} Td`);
      lines.push(`${pdfString(col.title)} Tj`);
      lines.push("ET");
      x += w;
    }
  }

  function newPage() {
    if (page.length) pages.push(page);
    page = [];
    const header: string[] = [];
    header.push("BT");
    header.push("/F1 16 Tf");
    header.push("0.12 0.24 0.4 rg");
    header.push(`${margin} ${pageHeight - margin} Td`);
    header.push(`${pdfString(options.title)} Tj`);
    header.push("/F1 9 Tf");
    header.push("0.3 0.3 0.3 rg");
    let hx = margin;
    header.push(`${pageWidth - margin} ${pageHeight - margin} Td`);
    header.push(`${pdfString(shortenRight(String(options.subtitle || ""), 60))} Tj`);
    header.push("ET");
    header.push("BT /F1 9 Tf");
    header.push("0.3 0.3 0.3 rg");
    header.push(`${margin} ${pageHeight - margin - 14} Td`);
    const sub = options.subtitle ? ` | ${options.subtitle}` : "";
    header.push(`${pdfString(shorten(String(options.title + sub), 96))} Tj`);
    header.push("ET");
    startHeader(header, tableTop);
    page.push(...header);
    y = tableTop - headerHeight;
  }

  function drawRow(top: number, row: string[], isTotal: boolean) {
    const lines: string[] = [];
    if (isTotal) {
      lines.push("BT /F1 10 Tf");
      lines.push("0.92 0.94 0.96 rg");
      let x = tableLeft;
      for (const w of colWidths) {
        lines.push(`${x} ${top - headerHeight} ${w} ${headerHeight} re f`);
        x += w;
      }
      lines.push("ET");
    } else {
      lines.push("BT /F1 10 Tf");
      lines.push("0.98 0.98 0.98 rg");
      let x = tableLeft;
      for (const w of colWidths) {
        lines.push(`${x} ${top - headerHeight} ${w} ${headerHeight} re f`);
        x += w;
      }
      lines.push("ET");
    }
    lines.push("BT /F1 10 Tf");
    lines.push("0 0 0 rg");
    let x = tableLeft;
    for (let i = 0; i < options.columns.length; i++) {
      const col = options.columns[i];
      const w = colWidths[i];
      const cell = row[i] || "";
      const maxLen = Math.floor(w / 4.6);
      const shown = cell.length > maxLen ? cell.slice(0, Math.max(1, maxLen - 2)) + ".." : cell;
      const tx = col.align === "right" ? x + w - 8 : x + 8;
      lines.push(`${tx} ${top - 14} Td`);
      lines.push(`${pdfString(shown)} Tj`);
      x += w;
    }
    lines.push("ET");
    return lines;
  }

  newPage();
  let rows = options.rows;
  if (options.totalsRow) rows = [...rows, options.totalsRow];
  for (const row of rows) {
    if (y < 80) newPage();
    page.push(...drawRow(y, row, options.totalsRow === row));
    y -= rowHeight;
  }
  pages.push(page);

  const pageObjects: string[] = [];
  const fontObjects: string[] = [];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  function addObject(body: string) {
    const idx = pageObjects.length + fontObjects.length + 1;
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${idx} 0 obj\n${body}\nendobj\n`;
    return idx;
  }

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages
    .map((_, i) => 4 + i * 2)
    .join(" 0 R ");
  addObject(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  for (let i = 0; i < pages.length; i++) {
    const contentObj = 3 + i * 2;
    const pageObj = 4 + i * 2;
    const fontObj = 5 + i * 2;
    const stream = pages[i].join("\n");
    addObject(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> >>`,
    );
    addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

function shorten(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 3) + "..." : value;
}

function shortenRight(value: string, max: number): string {
  return value.length > max ? "..." + value.slice(value.length - max + 3) : value;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ReportXlsColumn {
  key: string;
  title: string;
  type?: string;
}

export interface ReportXlsOptions {
  title: string;
  subtitle?: string;
  columns: ReportXlsColumn[];
  rows: Record<string, any>[];
  totalsRow?: string[];
}

export function buildReportXls(options: ReportXlsOptions): Buffer {
  const head = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles>',
    '<Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#DDE7F0" ss:Pattern="Solid"/></Style>',
    '<Style ss:ID="money"><NumberFormat ss:Format="0.00"/></Style>',
    '<Style ss:ID="total"><Font ss:Bold="1"/><Interior ss:Color="#EEF1F4" ss:Pattern="Solid"/></Style>',
    "</Styles>",
    '<Worksheet ss:Name="Report">',
    "<Table>",
  ].join("\n");

  const rowsXml: string[] = [];
  const titleRow = `<Row><Cell ss:MergeAcross="${options.columns.length - 1}"><Data ss:Type="String">${xmlEscape(options.title)}</Data></Cell></Row>`;
  const subRow = `<Row><Cell ss:MergeAcross="${options.columns.length - 1}"><Data ss:Type="String">${xmlEscape(options.subtitle || "")}</Data></Cell></Row>`;
  rowsXml.push(titleRow, subRow);
  rowsXml.push(
    `<Row>${options.columns
      .map((c) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(c.title)}</Data></Cell>`)
      .join("")}</Row>`,
  );

  for (const r of options.rows) {
    const cells = options.columns.map((c) => {
      const raw = r[c.key] !== undefined ? r[c.key] : "";
      if (c.type === "money") {
        return `<Cell ss:StyleID="money"><Data ss:Type="Number">${Number(raw) || 0}</Data></Cell>`;
      }
      if (c.type === "number") {
        const n = Number(raw);
        return isNaN(n) || raw === ""
          ? `<Cell><Data ss:Type="String">${xmlEscape(String(raw))}</Data></Cell>`
          : `<Cell><Data ss:Type="Number">${n}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${xmlEscape(String(raw))}</Data></Cell>`;
    });
    rowsXml.push(`<Row>${cells.join("")}</Row>`);
  }

  if (options.totalsRow && options.totalsRow.some(Boolean)) {
    rowsXml.push(
      `<Row>${options.totalsRow
        .map((c) => {
          const n = Number(c);
          const isNum = c !== "" && !isNaN(n);
          return `<Cell ss:StyleID="total"><Data ss:Type="${isNum ? "Number" : "String"}">${isNum ? n : xmlEscape(c)}</Data></Cell>`;
        })
        .join("")}</Row>`,
    );
  }

  const tail = "</Table>\n</Worksheet>\n</Workbook>";
  return Buffer.from(head + "\n" + rowsXml.join("\n") + "\n" + tail, "utf8");
}
