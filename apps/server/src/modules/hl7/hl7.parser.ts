import {
  Hl7Field,
  Hl7Segment,
  ParsedHl7Message,
} from "./hl7.types";

const CRCENTER = /[\r\n]+/;

function decodeEscapes(value: string): string {
  if (!value.includes("\\")) return value;
  return value.replace(
    /\\(F|S|T|R|E)\\/g,
    (m, code: string) =>
      code === "F" ? "|" : code === "S" ? "^" : code === "T" ? "&" : code === "R" ? "~" : "\\",
  );
}

function splitSubcomponents(
  component: string,
  subCompChars: string,
): string[] {
  if (!subCompChars) return [decodeEscapes(component)];
  return component.split(subCompChars).map(decodeEscapes);
}

function splitComponents(
  rep: string,
  compChars: string,
  subCompChars: string,
): string[] {
  if (!compChars) return [decodeEscapes(rep)];
  return rep.split(compChars).map((comp) => {
    if (!subCompChars) return decodeEscapes(comp);
    return splitSubcomponents(comp, subCompChars).join("&");
  });
}

function buildSegment(
  name: string,
  rawFields: string[],
  compChars: string,
  repChars: string,
  subCompChars: string,
): Hl7Segment {
  const fields: Hl7Field[] = [];
  for (let i = 0; i < rawFields.length; i += 1) {
    const reps = rawFields[i]
      .split(repChars)
      .map((rep) => splitComponents(rep, compChars, subCompChars));
    fields.push({ reps });
  }
  return {
    name,
    fields,
    field(index) {
      return fields[index]?.reps ?? [];
    },
    component(index, repIndex = 0, compIndex = 0) {
      return fields[index]?.reps[repIndex]?.[compIndex];
    },
    text(index) {
      const rep = fields[index]?.reps[0];
      return rep ? rep[0] : undefined;
    },
  };
}

export function parseHl7Message(raw: string): ParsedHl7Message {
  if (!raw || !raw.trim()) {
    throw new Error("Empty HL7 message");
  }

  const normalized = raw.replace(/\r?\n/g, "\r");
  const segmentLines = normalized
    .split(CRCENTER)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const mshLine = segmentLines[0];
  if (!mshLine.startsWith("MSH")) {
    throw new Error("First segment must be MSH");
  }

  const fieldSep = mshLine[3] || "|";
  const encChars = mshLine.substring(4, 9) || "^~\\&";
  const compChars = encChars[0] || "^";
  const repChars = encChars[1] || "~";
  const subCompChars = encChars[3] || "&";

  const parseNamedSegment = (line: string): Hl7Segment => {
    const rawFields = line.split(fieldSep);
    const name = rawFields[0];
    const body = rawFields.slice(1);
    if (name === "MSH") {
      return buildSegment(
        name,
        ["MSH", encChars, ...body.slice(1)],
        compChars,
        repChars,
        subCompChars,
      );
    }
    return buildSegment(name, body, compChars, repChars, subCompChars);
  };

  const segments = segmentLines.map(parseNamedSegment);
  const msh = segments[0];

  const messageControl = msh.text(9) ?? "";
  const messageTypeField = msh.field(8)[0] ?? [];

  return {
    messageType: messageTypeField[0] ?? "",
    eventType: messageTypeField[1] ?? "",
    messageControlId: messageControl,
    version: msh.text(11) ?? "",
    sendingApplication: msh.text(2) ?? "",
    sendingFacility: msh.text(3) ?? "",
    receivingApplication: msh.text(4) ?? "",
    receivingFacility: msh.text(5) ?? "",
    raw: normalized,
    segment(name) {
      return segments.find((s) => s.name === name);
    },
    allSegments(name) {
      return segments.filter((s) => s.name === name);
    },
  };
}

const TS_PATTERN = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\+\d{4})?/;

export function parseHl7Timestamp(ts: string | undefined): Date | undefined {
  if (!ts) return undefined;
  const m = TS_PATTERN.exec(ts.trim());
  if (!m) return undefined;
  const [, yyyy, mm, dd, hh, min, sec] = m;
  if (!yyyy) return undefined;
  return new Date(
    Number(yyyy),
    mm ? Number(mm) - 1 : 0,
    dd ? Number(dd) : 1,
    hh ? Number(hh) : 0,
    min ? Number(min) : 0,
    sec ? Number(sec) : 0,
  );
}

export function buildAckMessage(incoming: ParsedHl7Message, appName: string): string {
  const now = new Date()
    .toISOString()
    .slice(0, 14)
    .replace(/[-:TZ]/g, "");
  const lines: string[] = [
    [
      "MSH",
      "^~\\&",
      appName || "HMS",
      "",
      incoming.sendingApplication,
      incoming.sendingFacility,
      now,
      "",
      "ACK",
      (incoming.messageControlId || "0") + "_A",
      "P",
      incoming.version || "2.5",
    ].join("|"),
    ["MSA", "AA", incoming.messageControlId || "0"].join("|"),
  ];
  return lines.join("\r") + "\r";
}