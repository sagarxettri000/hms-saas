import { BadRequestException } from "@nestjs/common";

export interface MultipartPart {
  headers: Record<string, string>;
  data: Buffer;
}

const CRLF = Buffer.from("\r\n");
const CRLFCRLF = Buffer.from("\r\n\r\n");

/**
 * Parse a `multipart/related` body (DICOMweb STOW-RS) into its parts.
 * Handles preamble, header blocks, and the closing `--` boundary.
 */
export function parseMultipartRelated(
  body: Buffer,
  contentType: string,
): Promise<MultipartPart[]> {
  const boundary = extractBoundary(contentType);
  if (!boundary) {
    throw new BadRequestException(
      "Content-Type must include a boundary parameter",
    );
  }

  const delimiter = Buffer.from(`--${boundary}`);

  const parts: MultipartPart[] = [];

  let cursor = 0;
  for (;;) {
    const partStart = body.indexOf(delimiter, cursor);
    if (partStart === -1) break;

    // Boundary delimiter is followed by either `--` (close) or an EOL.
    const afterBoundary = partStart + delimiter.length;
    if (
      body.subarray(afterBoundary, afterBoundary + 2).toString("latin1") ===
      "--"
    ) {
      break;
    }

    let headerStart = afterBoundary;
    if (body[headerStart] === 0x0d && body[headerStart + 1] === 0x0a) {
      headerStart += 2;
    } else if (body[headerStart] === 0x0a) {
      headerStart += 1;
    }

    const nextBoundary = body.indexOf(delimiter, headerStart);
    if (nextBoundary === -1) break;

    let chunk = body.subarray(headerStart, nextBoundary);

    // The bytes preceding the next delimiter normally belong to that
    // delimiter's leading CRLF, so strip a single trailing CRLF.
    if (
      chunk.length >= 2 &&
      chunk[chunk.length - 2] === 0x0d &&
      chunk[chunk.length - 1] === 0x0a
    ) {
      chunk = chunk.subarray(0, chunk.length - 2);
    }

    const headerEnd = findHeaderEnd(chunk);
    if (headerEnd === -1 || !chunk.length) {
      cursor = nextBoundary;
      continue;
    }

    const headers = parseHeaders(chunk.subarray(0, headerEnd));
    const data = Buffer.from(chunk.subarray(headerEnd));
    parts.push({ headers, data });

    cursor = nextBoundary;
  }

  if (!parts.length) {
    throw new BadRequestException("No multipart parts found");
  }
  return Promise.resolve(parts);
}

function extractBoundary(contentType: string): string | undefined {
  const m = /boundary="?([^";]+)"?/i.exec(contentType);
  return m ? m[1] : undefined;
}

function findHeaderEnd(chunk: Buffer): number {
  const idx = chunk.indexOf(CRLFCRLF);
  if (idx !== -1) return idx + CRLFCRLF.length;
  const lf = chunk.indexOf(Buffer.from("\n\n"));
  return lf !== -1 ? lf + 2 : -1;
}

function parseHeaders(block: Buffer): Record<string, string> {
  const headers: Record<string, string> = {};
  const text = block.toString("latin1");
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (name) headers[name] = value;
  }
  return headers;
}

/**
 * Fully drain the raw request body stream into a Buffer.
 */
export function readRawBody(req: {
  on: (event: string, callback: (chunk: Buffer) => void) => unknown;
  once: (event: string, callback: () => void) => unknown;
}): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.once("end", () => resolve(Buffer.concat(chunks)));
    req.once("error", reject);
  });
}
