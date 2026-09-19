function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pdfString(value: string): string {
  return `(${escapeText(String(value))})`;
}

export interface PdfColumn {
  title: string;
  width: number;
  align?: "left" | "right";
}

export function buildPdf(options: {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: string[][];
  watermark?: string;
}): Buffer {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const rowHeight = 18;
  const headerHeight = 20;
  const lineHeight = 14;

  const content: string[] = [];
  let y = pageHeight - margin;

  // Watermark rendered under the header so it never obscures data (§35.2).
  if (options.watermark) {
    content.push("q");
    content.push("/F1 42 Tf");
    content.push("0.82 0.84 0.87 rg");
    content.push("1 0 0 1 130 400 Tm");
    content.push(`${pdfString(options.watermark)} Tj`);
    content.push("Q");
  }

  content.push("BT");
  content.push("/F1 18 Tf");
  content.push("0.12 0.24 0.4 rg");
  content.push(`${margin} ${y} Td`);
  content.push(`${pdfString(options.title)} Tj`);
  y -= 22;
  content.push("/F1 10 Tf");
  content.push("0.3 0.3 0.3 rg");
  if (options.subtitle) {
    content.push(`${margin} ${y} Td`);
    content.push(`${pdfString(options.subtitle)} Tj`);
    y -= 16;
  }
  content.push("ET");

  const tableLeft = margin;
  const tableTop = y;
  const tableWidth = pageWidth - margin * 2;
  const usableWidth = tableWidth;
  const colWidths = options.columns.map((c, i) => {
    const total = options.columns.reduce((s, col) => s + col.width, 0);
    return total > 0
      ? (c.width / total) * usableWidth
      : usableWidth / options.columns.length;
  });

  const pageHeightContent = () => tableTop - 40;

  function drawHeader(top: number) {
    const contentLines: string[] = [];
    contentLines.push("BT");
    contentLines.push("/F1 10 Tf");
    contentLines.push("0.9 0.92 0.95 rg");
    let x = tableLeft;
    for (let i = 0; i < options.columns.length; i++) {
      const w = colWidths[i];
      contentLines.push(`${x} ${top - headerHeight} ${w} ${headerHeight} re f`);
      x += w;
    }
    contentLines.push("0 0 0 rg");
    x = tableLeft;
    for (let i = 0; i < options.columns.length; i++) {
      const col = options.columns[i];
      const w = colWidths[i];
      const align = col.align === "right" ? 2 : 0;
      const tx = col.align === "right" ? x + w - 8 : x + 8;
      const ty = top - 14;
      contentLines.push("BT /F1 10 Tf");
      contentLines.push(`${tx} ${ty} Td`);
      contentLines.push(`${pdfString(col.title)} Tj`);
      contentLines.push("ET");
      x += w;
    }
    contentLines.push("0 0 0 rg");
    return contentLines;
  }

  function drawRow(top: number, row: string[], header: boolean) {
    const lines: string[] = [];
    const fillTop = top - headerHeight;
    if (!header) {
      lines.push("BT");
      lines.push("/F1 10 Tf");
      lines.push("0.98 0.98 0.98 rg");
      let x = tableLeft;
      for (const w of colWidths) {
        lines.push(`${x} ${fillTop} ${w} ${headerHeight} re f`);
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
      if (cell.length > Math.floor(w / 4.5)) {
        const shortened = cell.slice(0, Math.floor(w / 4.5) - 2) + "..";
        const tx = col.align === "right" ? x + w - 8 : x + 8;
        lines.push(`${tx} ${top - 14} Td`);
        lines.push(`${pdfString(shortened)} Tj`);
      } else {
        const tx = col.align === "right" ? x + w - 8 : x + 8;
        lines.push(`${tx} ${top - 14} Td`);
        lines.push(`${pdfString(cell)} Tj`);
      }
      x += w;
    }
    lines.push("ET");
    return lines;
  }

  const headers = drawHeader(tableTop);
  content.push(...headers);
  y = tableTop - headerHeight;

  for (const row of options.rows) {
    if (y < 80) {
      content.push(...drawHeader(y));
      y -= headerHeight;
    }
    content.push(...drawRow(y, row, false));
    y -= rowHeight;
  }

  const objects: string[] = [];
  const offsets: number[] = [];
  let pdf = "%PDF-1.4\n";

  function addObject(body: string) {
    const objIndex = objects.length + 1;
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${objIndex} 0 obj\n${body}\nendobj\n`;
    objects.push(body);
    return objIndex;
  }

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
  );
  const stream = content.join("\n");
  addObject(
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  );
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell);
          if (/[",\n\r]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(","),
    )
    .join("\n");
}
