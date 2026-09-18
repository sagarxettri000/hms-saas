import {
  buildAckMessage,
  parseHl7Message,
  parseHl7Timestamp,
} from "./hl7.parser";
import {
  buildRadiologyOruReport,
  frameMllp,
  MLLP_EOB,
} from "./hl7-outbound-builder";

const ADT_A01 =
  "MSH|^~\\&|ADT1|HOSPITAL|HMS|NEPAL|20260909080000||ADT^A01|ADT-20260909-001|P|2.5\r" +
  "EVN|A01|20260909080000\r" +
  "PID|1||MRN-1001||Regmi^Anita||19910315|F|||Kathmandu^^URBAN^^^^^\r" +
  "PV1|1|I|WARD-A^101^1^^^HOSPITAL\r";

const ORM_O01 =
  "MSH|^~\\&|RIS|HOSPITAL|HMS|NEPAL|20260909081000||ORM^O01|ORM-20260909-007|P|2.5\r" +
  "PID|1||MRN-1001||Regmi^Anita||19910315|F\r" +
  "ORC|NW|RAD-2026-0111|ACC-8888\r" +
  "OBR|1|RAD-2026-0111|ACC-8888|CT^CHEST ABDOMEN^L|20260909081000|20260909090000\r" +
  "ZDS|1|202609090900^2026090909300\r";

describe("HL7 v2.5 conformance", () => {
  it("round-trips a realistic ADT^A01 message", () => {
    const parsed = parseHl7Message(ADT_A01);
    expect(parsed.messageType).toBe("ADT");
    expect(parsed.eventType).toBe("A01");
    expect(parsed.messageControlId).toBe("ADT-20260909-001");
    expect(parsed.version).toBe("2.5");
    expect(parsed.sendingApplication).toBe("ADT1");

    const pid = parsed.segment("PID")!;
    expect(pid.component(2)).toBe("MRN-1001");
    const name = pid.field(4)[0] ?? [];
    expect(name[0]).toBe("Regmi");
    expect(name[1]).toBe("Anita");

    const dob = parseHl7Timestamp(pid.component(6));
    expect(dob?.getFullYear()).toBe(1991);
    expect(dob?.getMonth()).toBe(2); // March
    expect(pid.component(7)).toBe("F");

    const evn = parsed.segment("EVN")!;
    expect(evn.component(0)).toBe("A01");

    // ACK generation conforms: MSH|...|ACK|ADT^A01|...|AA
    const ack = buildAckMessage(parsed, "HMS");
    const ackParsed = parseHl7Message(ack);
    expect(ackParsed.messageType).toBe("ACK");
    expect(ack).toContain("MSA|AA|ADT-20260909-001");
  });

  it("parses ORM^O01 order fields used by DICOM MWL bridging", () => {
    const parsed = parseHl7Message(ORM_O01);
    expect(parsed.messageType).toBe("ORM");
    expect(parsed.eventType).toBe("O01");

    const orc = parsed.segment("ORC")!;
    const obr = parsed.segment("OBR")!;
    expect(orc.component(1)).toBe("RAD-2026-0111");
    expect(orc.component(2)).toBe("ACC-8888");
    expect(obr.component(2)).toBe("ACC-8888");

    const requestedProcedure = obr.field(3)[0] ?? [];
    expect(requestedProcedure[0]).toBe("CT");
    expect(requestedProcedure[1]).toBe("CHEST ABDOMEN");
  });

  it("builds a conformance-correct ORU^R01 with MLLP framing", () => {
    const message = buildRadiologyOruReport(
      {
        patient: {
          mrn: "MRN-1001",
          firstName: "Anita",
          lastName: "Regmi",
          dateOfBirth: new Date("1991-03-15"),
          gender: "F",
        },
        order: {
          orderNumber: "RAD-2026-0111",
          accessionNumber: "ACC-8888",
          modality: "CT",
          bodyPart: "CHEST ABDOMEN",
          status: "VERIFIED",
          findings: "No acute abnormality.",
          impression: "Normal study.",
          report: "Findings: no acute abnormality.\nImpression: normal.",
        } as any,
        report: {
          status: "VERIFIED",
          findings: "No acute abnormality.",
          impression: "Normal study.",
        } as any,
        receivingApplication: "PACS",
        receivingFacility: "HOSPITAL",
      },
      { controlId: "ORU.20260909.42" },
    );

    const segments = message.trim().split("\r");
    expect(segments[0]).toMatch(/^MSH\|\^\~\\&\|HMS\|[^|]*\|PACS\|HOSPITAL\|/);
    expect(segments[0]).toContain("|ORU^R01|ORU.20260909.42|P|2.5");
    expect(segments.some((s) => s.startsWith("PID|1|MRN-1001||"))).toBe(true);
    expect(
      segments.some((s) =>
        s.startsWith("OBR|1|RAD-2026-0111|ACC-8888|CT^CHEST ABDOMEN"),
      ),
    ).toBe(true);
    expect(segments).toContain("ORC|RE|RAD-2026-0111|ACC-8888");
    const obxs = segments.filter((s) => s.startsWith("OBX|"));
    expect(obxs.length).toBe(3);
    expect(obxs.some((s) => s.includes("No acute abnormality."))).toBe(true);
    expect(obxs.some((s) => s.includes("Normal study."))).toBe(true);

    // MLLP framing wraps exactly one message with SOB/EOB/CR.
    const frame = frameMllp(message);
    expect(frame[0]).toBe(0x0b);
    expect(frame[frame.length - 2]).toBe(0x1c);
    expect(frame[frame.length - 1]).toBe(0x0d);
    expect(frame.indexOf(MLLP_EOB)).toBeGreaterThan(0);
    const inner = frame
      .subarray(1, frame.indexOf(MLLP_EOB) - 1)
      .toString("utf8");
    expect(inner).toContain("ORU^R01");

    // The built message re-parses cleanly (round-trip stability).
    const reparsed = parseHl7Message(message);
    expect(reparsed.messageType).toBe("ORU");
    expect(reparsed.eventType).toBe("R01");
    expect(reparsed.segment("PID")!.component(1)).toBe("MRN-1001");
  });
});
