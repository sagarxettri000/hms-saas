/**
 * DICOM Upper Layer (DICOM UL / DIMSE) constants and PDU helpers.
 * Implements the subset of the DICOM Upper Layer Protocol needed for
 * association negotiation, C-ECHO and C-STORE (SCP and SCU).
 *
 * Byte order: big-endian for PDU headers; command/data sets are encoded
 * in Implicit VR Little Endian unless a different syntax was negotiated.
 */

export const PDU_TYPE = {
  A_ASSOCIATE_RQ: 0x01,
  A_ASSOCIATE_AC: 0x02,
  A_ASSOCIATE_RJ: 0x03,
  P_DATA_TF: 0x04,
  A_RELEASE_RQ: 0x05,
  A_RELEASE_RP: 0x06,
  A_ABORT_RQ: 0x07,
  A_P_ABORT: 0x08,
} as const;

export const APPLICATION_CONTEXT = "1.2.840.10008.3.1.1.1";

export const TRANSFER_SYNTAXES = {
  IMPLICIT_VR_LE: "1.2.840.10008.1.2",
  EXPLICIT_VR_LE: "1.2.840.10008.1.2.1",
  DEFLATED_EXPLICIT_VR_LE: "1.2.840.10008.1.2.1.99",
  EXPLICIT_VR_BE: "1.2.840.10008.1.2.2",
  JPEG_BASELINE_8: "1.2.840.10008.1.2.4.50",
  JPEG_EXTENDED_12: "1.2.840.10008.1.2.4.51",
  JPEG_LOSSLESS_14: "1.2.840.10008.1.2.4.57",
  JPEG_LOSSLESS_14_1: "1.2.840.10008.1.2.4.70",
  JPEG_LS_LOSSLESS: "1.2.840.10008.1.2.4.80",
  JPEG_LS_NEAR_LOSSLESS: "1.2.840.10008.1.2.4.81",
  JPIP: "1.2.840.10008.1.2.4.94",
  RLE_LOSSLESS: "1.2.840.10008.1.2.5",
  MPEG2_MAIN: "1.2.840.10008.1.2.4.100",
} as const;

export const COMMAND_FIELD = {
  C_STORE_RQ: 0x0001,
  C_STORE_RSP: 0x8001,
  C_GET_RQ: 0x0010,
  C_GET_RSP: 0x8010,
  C_FIND_RQ: 0x0020,
  C_FIND_RSP: 0x8020,
  C_MOVE_RQ: 0x0021,
  C_MOVE_RSP: 0x8021,
  C_ECHO_RQ: 0x0030,
  C_ECHO_RSP: 0x8030,
  N_EVENT_REPORT_RQ: 0x0100,
  N_GET_RQ: 0x0110,
} as const;

export const STATUS = {
  SUCCESS: 0x0000,
  PENDING: 0xff00,
  FAILURE: 0x0110,
  UL_UNRECOGNIZED_PDU: 0x0120,
  MISSING_ATTRIBUTE: 0x0121,
  SOP_CLASS_NOT_SUPPORTED: 0x0122,
  RESOURCE_LIMITATION: 0x0213,
  UNKNOWN_SOP_CLASS: 0x0112,
} as const;

export const ASSOCIATE_RESULT = {
  ACCEPTANCE: 0x00,
  USER_REJECTION: 0x01,
  PROVIDER_REJECTION: 0x02,
} as const;

export interface PresentationContextRQ {
  id: number;
  abstractSyntaxUid: string;
  transferSyntaxUids: string[];
}

export interface NegotiatedContext {
  id: number;
  abstractSyntaxUid: string;
  transferSyntaxUid: string;
}

export interface AssociateRequestDetails {
  calledAeTitle: string;
  callingAeTitle: string;
  presentationContexts: PresentationContextRQ[];
  maximumLengthReceived: number;
  implementationClassUid?: string;
  implementationVersionName?: string;
}

export function parsePduHeader(
  bytes: Buffer,
  offset: number,
): { type: number; length: number; dataOffset: number } {
  if (bytes.length - offset < 6) throw new Error("Incomplete PDU header");
  const type = bytes[offset];
  const length = bytes.readUInt32BE(offset + 2);
  return { type, length, dataOffset: offset + 6 };
}

export function readStr(bytes: Buffer, offset: number, length: number): string {
  return bytes
    .subarray(offset, offset + length)
    .toString("latin1")
    .replace(/\s+$/g, "");
}

function readUidItem(bytes: Buffer, offset: number): string {
  // item: type(1) reserved(1) length(2) uid
  const len = bytes.readUInt16BE(offset + 2);
  return bytes.subarray(offset + 4, offset + 4 + len).toString("latin1");
}

export function parseAssociateRq(
  bytes: Buffer,
  offset: number,
  length: number,
): AssociateRequestDetails {
  let pos = offset;

  // Protocol version (2 bytes) + reserved (2 bytes)
  pos += 4;

  const calledAeTitle = readStr(bytes, pos, 16);
  pos += 16;
  pos += 32; // reserved
  const callingAeTitle = readStr(bytes, pos, 16);
  pos += 16;
  pos += 32; // reserved

  const details: AssociateRequestDetails = {
    calledAeTitle,
    callingAeTitle,
    presentationContexts: [],
    maximumLengthReceived: 16384,
  };

  const end = offset + length;
  while (pos + 4 <= end) {
    const itemType = bytes[pos];
    const itemLength = bytes.readUInt16BE(pos + 2);
    const itemEnd = pos + 4 + itemLength;

    if (itemType === 0x10) {
      // Application context
      pos += 4 + itemLength;
      continue;
    }

    if (itemType === 0x20) {
      // Presentation context
      let p = pos + 4;
      const pcId = bytes[p++];
      p++; // reserved
      const numTs = bytes[p++];
      p++; // reserved

      const context: PresentationContextRQ = {
        id: pcId,
        abstractSyntaxUid: "",
        transferSyntaxUids: [],
      };

      const pcEnd = p + (itemEnd - p);
      while (p < pcEnd) {
        const subType = bytes[p];
        const subLen = bytes.readUInt16BE(p + 2);
        if (subType === 0x30) {
          context.abstractSyntaxUid = readUidItem(bytes, p);
        } else if (subType === 0x40) {
          context.transferSyntaxUids.push(readUidItem(bytes, p));
        }
        p += 4 + subLen;
      }
      void numTs;
      details.presentationContexts.push(context);
      pos = itemEnd;
      continue;
    }

    if (itemType === 0x50) {
      // User information
      let p = pos + 4;
      const uEnd = itemEnd;
      while (p + 4 <= uEnd) {
        const subType = bytes[p];
        const subLen = bytes.readUInt16BE(p + 2);
        if (subType === 0x51) {
          // Maximum length received
          details.maximumLengthReceived = bytes.readUInt32BE(p + 4);
        } else if (subType === 0x52) {
          details.implementationClassUid = readUidItem(bytes, p);
        } else if (subType === 0x55) {
          details.implementationVersionName = readUidItem(bytes, p);
        }
        p += 4 + subLen;
      }
      pos = itemEnd;
      continue;
    }

    pos = itemEnd;
  }

  return details;
}

export function writeFixedString(
  buf: Buffer,
  offset: number,
  value: string,
  length: number,
) {
  buf.write(value.slice(0, length).padEnd(length, " "), offset, "latin1");
}

export interface AcContext {
  id: number;
  result: number;
  transferSyntaxUid: string;
}

/**
 * Build an A-ASSOCIATE-AC PDU body. Returns the full PDU (with header).
 */
export function buildAssociateAc(
  details: AssociateRequestDetails,
  accepted: AcContext[],
  implementationClassUid: string,
  implementationVersionName: string,
): Buffer {
  const sub: Buffer[] = [];

  // Application context
  sub.push(
    Buffer.concat([
      Buffer.from([0x10, 0x00]),
      u16(Buffer.byteLength(APPLICATION_CONTEXT)),
      Buffer.from(APPLICATION_CONTEXT, "latin1"),
    ]),
  );

  // Presentation context accept items
  for (const ctx of accepted) {
    const tsUid = Buffer.from(ctx.transferSyntaxUid, "latin1");
    // result/why sub item (0x20 presentation context with result): type 0x21
    const inner: Buffer[] = [];
    // Transfer syntax sub-item
    inner.push(
      Buffer.concat([Buffer.from([0x40, 0x00]), u16(tsUid.length), tsUid]),
    );
    const innerLen = 4 + inner.reduce((s, b) => s + b.length, 0);
    sub.push(
      Buffer.concat([
        Buffer.from([0x21, 0x00]),
        u16(innerLen),
        Buffer.from([ctx.id]),
        Buffer.from([0x00]), // reserved
        Buffer.from([ctx.result]),
        Buffer.from([0x00]), // reserved
        ...inner,
      ]),
    );
  }

  // User information
  const ui: Buffer[] = [];
  ui.push(Buffer.concat([Buffer.from([0x51, 0x00]), u16(4), u32(16384)]));
  const icl = Buffer.from(implementationClassUid, "latin1");
  ui.push(Buffer.concat([Buffer.from([0x52, 0x00]), u16(icl.length), icl]));
  const iver = Buffer.from(implementationVersionName, "latin1");
  ui.push(Buffer.concat([Buffer.from([0x55, 0x00]), u16(iver.length), iver]));

  const uiLen = ui.reduce((s, b) => s + b.length, 0);
  sub.push(Buffer.concat([Buffer.from([0x50, 0x00]), u16(uiLen), ...ui]));

  const body: Buffer[] = [];
  body.push(u16(0x0001)); // protocol version
  body.push(u16(0x0000)); // reserved
  const called = Buffer.alloc(16, 0x20);
  writeFixedString(called, 0, details.calledAeTitle, 16);
  const reserved32 = Buffer.alloc(32, 0x00);
  const calling = Buffer.alloc(16, 0x20);
  writeFixedString(calling, 0, details.callingAeTitle, 16);
  body.push(called, reserved32, calling, reserved32);

  for (const s of sub) body.push(s);

  const variable = Buffer.concat(body);
  const header = Buffer.alloc(6);
  header[0] = PDU_TYPE.A_ASSOCIATE_AC;
  header[1] = 0x00;
  header.writeUInt32BE(variable.length, 2);
  return Buffer.concat([header, variable]);
}

export function buildAssociateRj(reason: number): Buffer {
  const body = Buffer.from([0x00, 0x01, reason]);
  const header = Buffer.alloc(6);
  header[0] = PDU_TYPE.A_ASSOCIATE_RJ;
  header.writeUInt32BE(body.length, 2);
  return Buffer.concat([header, body]);
}

export function buildReleaseRqOrRp(type: number): Buffer {
  // body: 4 reserved bytes (0)
  const header = Buffer.alloc(6);
  header[0] = type;
  header.writeUInt32BE(4, 2);
  return Buffer.concat([header, Buffer.alloc(4)]);
}

export function buildAbort(): Buffer {
  const header = Buffer.alloc(6);
  header[0] = PDU_TYPE.A_ABORT_RQ;
  header.writeUInt32BE(4, 2);
  return Buffer.concat([header, Buffer.alloc(4)]);
}

export interface Pdv {
  contextId: number;
  controlHeader: number; // bit 0: command(0)/data(1); bit 1: last
  data: Buffer;
}

export function parsePDataTf(
  bytes: Buffer,
  offset: number,
  length: number,
): Pdv[] {
  const pdvs: Pdv[] = [];
  let pos = offset;
  const end = offset + length;
  while (pos + 4 <= end) {
    const itemLength = bytes.readUInt16BE(pos + 2);
    const valueStart = pos + 4;
    const contextId = bytes[valueStart];
    const controlHeader = bytes[valueStart + 1];
    const data = bytes.subarray(valueStart + 2, valueStart + itemLength);
    pdvs.push({ contextId, controlHeader, data });
    pos = valueStart + itemLength;
  }
  return pdvs;
}

export function buildPDataTf(pdvs: Pdv[]): Buffer {
  const chunks: Buffer[] = [];
  for (const pdv of pdvs) {
    const inner = Buffer.alloc(2);
    inner[0] = pdv.contextId;
    inner[1] = pdv.controlHeader;
    chunks.push(
      Buffer.concat([
        Buffer.from([0x00, 0x00]),
        u16(pdv.data.length + 2),
        inner,
        pdv.data,
      ]),
    );
  }
  const variable = Buffer.concat(chunks);
  const header = Buffer.alloc(6);
  header[0] = PDU_TYPE.P_DATA_TF;
  header.writeUInt32BE(variable.length, 2);
  return Buffer.concat([header, variable]);
}

function u16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v, 0);
  return b;
}
function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v >>> 0, 0);
  return b;
}

// ---- DIMSE command set encode/decode (Implicit VR Little Endian) ----

export interface DimseCommand {
  commandField: number;
  messageId?: number;
  messageIdBeingRespondedTo?: number;
  affectedSopClassUid?: string;
  affectedSopInstanceUid?: string;
  status?: number;
  commandDataSetType?: number;
  priority?: number;
  errorComment?: string;
  [tag: string]: unknown;
}

const VR_BY_SHORT: Record<string, string> = {
  AE: "AE",
  AS: "AS",
  AT: "AT",
  CS: "CS",
  DA: "DA",
  DS: "DS",
  DT: "DT",
  FD: "FD",
  FL: "FL",
  IS: "IS",
  LO: "LO",
  LT: "LT",
  OB: "OB",
  OD: "OD",
  OF: "OF",
  OW: "OW",
  PN: "PN",
  SH: "SH",
  SL: "SL",
  SQ: "SQ",
  SS: "SS",
  ST: "ST",
  TM: "TM",
  UI: "UI",
  UL: "UL",
  US: "US",
  UT: "UT",
};

/**
 * Parse a DICOM dataset (used for command sets) in Implicit VR Little Endian.
 * Returns an array of elements with decoded values for scalar VRs.
 */
export function parseDatasetImplicitLe(
  bytes: Buffer,
  offset: number,
  dataLength: number,
): Array<{ tag: string; vr: string; value: unknown }> {
  const elements: Array<{ tag: string; vr: string; value: unknown }> = [];
  let pos = offset;
  const end = offset + dataLength;

  while (pos + 8 <= end) {
    const group = bytes.readUInt16LE(pos);
    const element = bytes.readUInt16LE(pos + 2);
    const length = bytes.readUInt32LE(pos + 4);
    const tag =
      group.toString(16).padStart(4, "0") +
      element.toString(16).padStart(4, "0");

    if (group === 0xfffe) {
      // Sequence/item delimiters: skip
      pos += 8 + length;
      continue;
    }

    const valueOffset = pos + 8;
    if (valueOffset + length > end) break;

    const vr = implicitVr(group, element);
    let value: unknown;
    if (length === 0xffffffff) {
      value = undefined; // SQ with delimiters (command sets won't have this)
      pos += 8 + length;
    } else if (length === 0) {
      value = "";
    } else {
      value = decodeValue(bytes, valueOffset, length, vr);
      pos += 8 + length;
    }

    try {
      elements.push({ tag, vr, value });
    } catch {
      // ignore
    }
    void value;
  }

  return elements;
}

function implicitVr(group: number, element: number): string {
  // Command group elements (0000,xxxx) are US or UL in command sets except UIDs.
  const tag = (group << 16) | element;
  switch (tag) {
    case 0x00000000:
      return "UL";
    case 0x00000100:
      return "US";
    case 0x00000101:
      return "US";
    case 0x00000102:
      return "US";
    case 0x00000110:
      return "US";
    case 0x00000120:
      return "US";
    case 0x00000700:
      return "US";
    case 0x00000800:
      return "US";
    case 0x00000900:
      return "US";
    case 0x00000901:
      return "US";
    case 0x00000002:
      return "UI"; // affected SOP class UID
    case 0x00001000:
      return "UI"; // affected SOP instance UID
    case 0x00000200:
      return "AT";
    case 0x00000300:
      return "TM";
    case 0x0000a000:
      return "AT";
    default:
      if (group === 0x0000) return "US";
      return "OB";
  }
}

export function decodeByteValue(
  bytes: Buffer,
  offset: number,
  length: number,
  vr: string,
): string {
  const raw = bytes.subarray(offset, offset + length);
  switch (vr) {
    case "UI":
      return raw.toString("latin1").replace(/\0+$/g, "");
    case "PN":
    case "SH":
    case "LO":
    case "ST":
    case "LT":
    case "UT":
    case "CS":
    case "AE":
    case "AS":
    case "DA":
    case "DT":
    case "TM":
    case "DS":
    case "IS":
    default:
      return raw.toString("utf8").replace(/\0+$/g, "");
  }
}

function decodeValue(
  bytes: Buffer,
  offset: number,
  length: number,
  vr: string,
): unknown {
  if (vr === "US" && length === 2) return bytes.readUInt16LE(offset);
  if (vr === "UL" && length === 4) return bytes.readUInt32LE(offset);
  if (vr === "SS" && length === 2) return bytes.readInt16LE(offset);
  if (vr === "SL" && length === 4) return bytes.readInt32LE(offset);
  if (vr === "US" || vr === "UL") {
    // multi-value numeric
    if (vr === "US") {
      const out: number[] = [];
      for (let i = 0; i < length; i += 2)
        out.push(bytes.readUInt16LE(offset + i));
      return out.length === 1 ? out[0] : out;
    }
    const out: number[] = [];
    for (let i = 0; i < length; i += 4)
      out.push(bytes.readUInt32LE(offset + i));
    return out.length === 1 ? out[0] : out;
  }
  return decodeByteValue(bytes, offset, length, vr);
}

export function commandToAttributes(
  cmd: DimseCommand,
  tagOrVR?: Record<string, unknown>,
): Array<{ tag: string; vr: string; value: unknown }> {
  const map: Array<{ tag: string; vr: string; value: unknown }> = [];
  const push = (tag: string, vr: string, value: unknown) =>
    map.push({ tag, vr, value });

  const groupLength = estimateGroupLength(cmd);
  push("00000000", "UL", groupLength);
  if (cmd.affectedSopClassUid) push("00000002", "UI", cmd.affectedSopClassUid);
  push("00000100", "US", cmd.commandField);
  if (cmd.messageId !== undefined) push("00000110", "US", cmd.messageId);
  if (cmd.messageIdBeingRespondedTo !== undefined)
    push("00000120", "US", cmd.messageIdBeingRespondedTo);
  if (cmd.priority !== undefined) push("00000700", "US", cmd.priority);
  if (cmd.commandDataSetType !== undefined)
    push("00000800", "US", cmd.commandDataSetType);
  if (cmd.status !== undefined) push("00000900", "US", cmd.status);
  if (cmd.affectedSopInstanceUid)
    push("00001000", "UI", cmd.affectedSopInstanceUid);

  if (groupLength > 0) map[0].value = groupLength;
  return map;
}

function estimateGroupLength(cmd: DimseCommand): number {
  let total = 0;
  const count = (vr: string, valueLength: number, even: boolean) => {
    total += 4 + 4 + valueLength;
    if (even && valueLength % 2) total += 1;
  };
  if (cmd.affectedSopClassUid)
    count("UI", cmd.affectedSopClassUid.length, true);
  count("US", 2, false);
  if (cmd.messageId !== undefined) count("US", 2, false);
  if (cmd.messageIdBeingRespondedTo !== undefined) count("US", 2, false);
  if (cmd.priority !== undefined) count("US", 2, false);
  if (cmd.commandDataSetType !== undefined) count("US", 2, false);
  if (cmd.status !== undefined) count("US", 2, false);
  if (cmd.affectedSopInstanceUid)
    count("UI", cmd.affectedSopInstanceUid.length, true);
  return total;
}

/**
 * Encode an implicit-VR little-endian dataset (command sets). Values are written
 * left-aligned and padded to even length.
 */
export function encodeCommandSet(cmd: DimseCommand): Buffer {
  const attrs = commandToAttributes(cmd);
  const chunks: Buffer[] = [];
  for (const attr of attrs) {
    const tagBuf = Buffer.alloc(4);
    tagBuf.writeUInt16LE(parseInt(attr.tag.slice(0, 4), 16), 0);
    tagBuf.writeUInt16LE(parseInt(attr.tag.slice(4, 8), 16), 2);

    let valueBuf: Buffer;
    if (typeof attr.value === "number") {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(attr.value, 0);
      if (attr.vr === "US" && attr.value <= 0xffff) {
        valueBuf = b.subarray(0, 2);
      } else {
        valueBuf = b;
      }
    } else if (typeof attr.value === "string") {
      valueBuf = Buffer.from(attr.value, "latin1");
      if (valueBuf.length % 2)
        valueBuf = Buffer.concat([valueBuf, Buffer.from([0x00])]);
    } else {
      valueBuf = Buffer.alloc(0);
    }

    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(valueBuf.length, 0);

    chunks.push(Buffer.concat([tagBuf, lenBuf, valueBuf]));
  }
  return Buffer.concat(chunks);
}

export function pdvForCommand(cmd: DimseCommand, contextId: number): Pdv {
  const data = encodeCommandSet(cmd);
  // control header: bit0=0 (command), bit1=1 (last)
  return { contextId, controlHeader: 0x02, data };
}

export function buildCommandSetPData(
  cmd: DimseCommand,
  contextId: number,
): Buffer {
  return buildPDataTf([pdvForCommand(cmd, contextId)]);
}

export const VR_BY_SHORT_KEYS = Object.keys(VR_BY_SHORT);
