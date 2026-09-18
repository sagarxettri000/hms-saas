import * as dicomParser from "dicom-parser";

export interface SampleDicomOptions {
  patientId?: string;
  patientName?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  modality?: string;
  rows?: number;
  columns?: number;
  accessionNumber?: string;
}

const defaults = {
  patientId: "PT001",
  patientName: "TEST^DICOM",
  studyInstanceUid: "1.2.826.0.1.3680043.8.498.202609080001",
  seriesInstanceUid: "1.2.826.0.1.3680043.8.498.202609080011",
  sopInstanceUid: "1.2.826.0.1.3680043.8.498.202609080021",
  modality: "OT",
  rows: 8,
  columns: 8,
};

const SECONDARY_CAPTURE = "1.2.840.10008.5.1.4.1.1.7";
const IMPLICIT_LE = "1.2.840.10008.1.2";

function padEven(buf: Buffer): Buffer {
  return buf.length % 2 === 0
    ? buf
    : Buffer.concat([buf, Buffer.alloc(1, 0x20)]);
}

function padNullEven(buf: Buffer): Buffer {
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.alloc(1)]);
}

function ascii(value: string): Buffer {
  return Buffer.from(value, "ascii");
}

function implicitTag(group: number, element: number, value: Buffer): Buffer {
  const tag = Buffer.alloc(4);
  tag.writeUInt16LE(group, 0);
  tag.writeUInt16LE(element, 2);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(value.length, 0);
  return Buffer.concat([tag, len, value]);
}

function explicitTag(
  group: number,
  element: number,
  vr: string,
  value: Buffer,
): Buffer {
  const tag = Buffer.alloc(4);
  tag.writeUInt16LE(group, 0);
  tag.writeUInt16LE(element, 2);
  const vrBuf = ascii(vr);
  if (vr === "OB" || vr === "OW" || vr === "OF" || vr === "UT" || vr === "UN") {
    const len = Buffer.alloc(4);
    len.writeUInt32LE(value.length, 0);
    return Buffer.concat([tag, vrBuf, Buffer.alloc(2), len, value]);
  }
  const len = Buffer.alloc(2);
  len.writeUInt16LE(value.length, 0);
  return Buffer.concat([tag, vrBuf, len, value]);
}

export function buildDicomP10File(opts: SampleDicomOptions = {}): Buffer {
  const o = { ...defaults, ...opts };
  const rows = o.rows ?? 8;
  const columns = o.columns ?? 8;
  const u16 = (v: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v, 0);
    return b;
  };

  const metaElements: Buffer[] = [];
  metaElements.push(
    explicitTag(0x0002, 0x0001, "OB", Buffer.from([0x00, 0x01])),
  );
  metaElements.push(
    explicitTag(0x0002, 0x0002, "UI", padNullEven(ascii(SECONDARY_CAPTURE))),
  );
  metaElements.push(
    explicitTag(0x0002, 0x0003, "UI", padNullEven(ascii(o.sopInstanceUid!))),
  );
  metaElements.push(
    explicitTag(0x0002, 0x0010, "UI", padNullEven(ascii(IMPLICIT_LE))),
  );
  metaElements.push(
    explicitTag(
      0x0002,
      0x0012,
      "UI",
      padNullEven(ascii("1.2.826.0.1.3680043.9.9999.1")),
    ),
  );

  const metaBody = Buffer.concat(metaElements);
  const groupLength = Buffer.alloc(4);
  groupLength.writeUInt32LE(metaBody.length, 0);
  const meta = Buffer.concat([
    explicitTag(0x0002, 0x0000, "UL", groupLength),
    metaBody,
  ]);

  const pixelBytes = Buffer.alloc(rows * columns * 2);
  for (let i = 0; i < rows * columns; i += 1) {
    const v = Math.round(180 + 30 * Math.sin(i));
    pixelBytes.writeUInt16LE(v & 0xffff, i * 2);
  }

  const np = (s: string) => padEven(ascii(s));
  const ui = (s: string) => padNullEven(ascii(s));
  const ds = Buffer.alloc(4);
  ds.writeUInt16LE(rows, 0);
  ds.writeUInt16LE(columns, 2);

  const dataSet = Buffer.concat([
    implicitTag(0x0008, 0x0016, ui(SECONDARY_CAPTURE)),
    implicitTag(0x0008, 0x0018, ui(o.sopInstanceUid!)),
    implicitTag(0x0008, 0x0020, np("20260908")),
    implicitTag(0x0008, 0x0050, ui(o.accessionNumber || "")),
    implicitTag(0x0008, 0x0060, np(o.modality!)),
    implicitTag(0x0010, 0x0010, np(o.patientName!)),
    implicitTag(0x0010, 0x0020, np(o.patientId!)),
    implicitTag(0x0020, 0x000d, ui(o.studyInstanceUid!)),
    implicitTag(0x0020, 0x000e, ui(o.seriesInstanceUid!)),
    implicitTag(0x0020, 0x0011, np("1")),
    implicitTag(0x0020, 0x0013, np("1")),
    implicitTag(0x0028, 0x0002, u16(1)),
    implicitTag(0x0028, 0x0004, np("MONOCHROME2")),
    implicitTag(0x0028, 0x0010, u16(rows)),
    implicitTag(0x0028, 0x0011, u16(columns)),
    implicitTag(0x0028, 0x0100, u16(16)),
    implicitTag(0x0028, 0x0101, u16(16)),
    implicitTag(0x0028, 0x0102, u16(15)),
    implicitTag(0x0028, 0x0103, u16(0)),
    implicitTag(0x7fe0, 0x0010, pixelBytes),
  ]);

  return Buffer.concat([Buffer.alloc(128), ascii("DICM"), meta, dataSet]);
}

export function parseSampleFile(file: Buffer) {
  const dataSet = dicomParser.parseDicom(file);
  return {
    dataSet,
    text: (group: number, element: number) =>
      dataSet.string(
        `x${group.toString(16).padStart(4, "0")}${element.toString(16).padStart(4, "0")}`,
      ),
    uInt16: (group: number, element: number) =>
      dataSet.uint16(
        `x${group.toString(16).padStart(4, "0")}${element.toString(16).padStart(4, "0")}`,
      ),
  };
}
