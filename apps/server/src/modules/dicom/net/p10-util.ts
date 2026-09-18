const IMPLEMENTATION_CLASS_UID = "1.2.826.0.1.3680043.8.498.2026";
const IMPLEMENTATION_VERSION = "HMS-1.0";

const DICM = Buffer.from("DICM", "ascii");
const META_START = 132;

// VRs with 2-byte length in explicit VR encoding
const SHORT_VR = new Set(
  "AE AS AT CS DA DS DT FL FD IS LO LT PN SH SL SS ST TM UI UL US".split(" "),
);

function shortElement(
  group: number,
  element: number,
  vr: string,
  value: string,
): Buffer {
  const tag = Buffer.alloc(4);
  tag.writeUInt16LE(group, 0);
  tag.writeUInt16LE(element, 2);
  let valueBuf = Buffer.from(value, "latin1");
  if (valueBuf.length % 2)
    valueBuf = Buffer.concat([valueBuf, Buffer.from([0x00])]);
  const len = Buffer.alloc(2);
  len.writeUInt16LE(valueBuf.length, 0);
  return Buffer.concat([tag, Buffer.from(vr, "ascii"), len, valueBuf]);
}

function longElement(
  group: number,
  element: number,
  vr: string,
  value: Buffer,
): Buffer {
  const tag = Buffer.alloc(4);
  tag.writeUInt16LE(group, 0);
  tag.writeUInt16LE(element, 2);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(value.length, 0);
  return Buffer.concat([
    tag,
    Buffer.from(vr, "ascii"),
    Buffer.alloc(2),
    len,
    value,
  ]);
}

/**
 * Build a DICOM Part 10 file from a raw Data Set, adding a minimal
 * File Meta Information group (0002) in Explicit VR Little Endian.
 */
export function wrapDatasetInP10(
  dataset: Buffer,
  opts: {
    sopClassUid?: string;
    sopInstanceUid?: string;
    transferSyntaxUid?: string;
    implementationClassUid?: string;
  },
): Buffer {
  const contentElements: Buffer[] = [
    longElement(0x0002, 0x0001, "OB", Buffer.from([0x00])),
    shortElement(
      0x0002,
      0x0002,
      "UI",
      opts.sopClassUid || "1.2.840.10008.5.1.4.1.1.4",
    ),
    shortElement(
      0x0002,
      0x0003,
      "UI",
      opts.sopInstanceUid || "1.2.826.0.1.3680043.8.498.2026.1",
    ),
    shortElement(
      0x0002,
      0x0010,
      "UI",
      opts.transferSyntaxUid || "1.2.840.10008.1.2",
    ),
    shortElement(
      0x0002,
      0x0012,
      "UI",
      opts.implementationClassUid || IMPLEMENTATION_CLASS_UID,
    ),
    shortElement(0x0002, 0x0013, "SH", IMPLEMENTATION_VERSION),
  ];

  const contentLength = contentElements.reduce((s, b) => s + b.length, 0);

  const groupLengthTag = Buffer.alloc(4);
  groupLengthTag.writeUInt16LE(0x0002, 0);
  groupLengthTag.writeUInt16LE(0x0000, 2);
  const glVal = Buffer.alloc(4);
  glVal.writeUInt32LE(contentLength, 0);
  const glLen = Buffer.alloc(2);
  glLen.writeUInt16LE(4, 0);
  const groupLength = Buffer.concat([
    groupLengthTag,
    Buffer.from("UL", "ascii"),
    glLen,
    glVal,
  ]);

  const preamble = Buffer.alloc(128);
  return Buffer.concat([
    preamble,
    DICM,
    groupLength,
    ...contentElements,
    dataset,
  ]);
}

interface MetaElement {
  group: number;
  element: number;
  vr: string;
  value: Buffer;
}

// Walk the File Meta group (0002) which is always Explicit VR Little Endian.
function walkMeta(dicom: Buffer): { elements: MetaElement[]; end: number } {
  const elements: MetaElement[] = [];
  let pos = META_START;
  while (pos + 8 <= dicom.length) {
    const group = dicom.readUInt16LE(pos);
    const element = dicom.readUInt16LE(pos + 2);
    if (group !== 0x0002) break;
    const vr = dicom.subarray(pos + 4, pos + 6).toString("ascii");
    let len: number;
    if (SHORT_VR.has(vr)) {
      len = dicom.readUInt16LE(pos + 6);
      pos += 8;
    } else {
      len = dicom.readUInt32LE(pos + 8);
      pos += 12;
    }
    const value = dicom.subarray(pos, pos + len);
    elements.push({ group, element, vr, value });
    pos += len;
    if (len % 2) pos += 1;
  }
  return { elements, end: pos };
}

function isPart10(dicom: Buffer): boolean {
  return (
    dicom.length >= 132 && dicom.subarray(128, 132).toString("ascii") === "DICM"
  );
}

/**
 * Extract the raw Data Set (without preamble/meta header) from a Part 10 file.
 * Used when acting as a C-STORE SCU so we transmit the Data Set portion.
 */
export async function unwrapP10(dicom: Buffer): Promise<Buffer> {
  if (!isPart10(dicom)) return dicom;
  try {
    const { end } = walkMeta(dicom);
    return dicom.subarray(end);
  } catch {
    return dicom;
  }
}

/** Read the SOP Class UID from a Part 10 file's meta group. */
export async function p10SopClass(dicom: Buffer): Promise<string | undefined> {
  if (!isPart10(dicom)) return undefined;
  try {
    const { elements } = walkMeta(dicom);
    const el = elements.find((e) => e.group === 0x0002 && e.element === 0x0002);
    return el ? el.value.toString("latin1").replace(/\0+$/, "") : undefined;
  } catch {
    return undefined;
  }
}
