import {
  buildAckMessage,
  parseHl7Message,
  parseHl7Timestamp,
} from "./hl7.parser";

const ADT = [
  "MSH|^~\\&|RIS|HOSPITAL|HMS|NEPAL|20250115123000||ADT^A01|MSG0001|P|2.5",
  "PID|1||MRN000123^^^HOSP^MR||DOE^JOHN^A||19800101|M|||123 MAIN ST^^KATHMANDU^BAGMATI^44600^NP||555-555-5555||||||||||123-45-6789|",
  "PV1|1|I|WARD^1^101^HOSP|||",
].join("\r");

const ORM = [
  "MSH|^~\\&|RIS|HOSPITAL|HMS|NEPAL|20250115123000||ORM^O01|MSG0002|P|2.5",
  "PID|1||MRN000123^^^HOSP^MR||DOE^JOHN^A||19800101|M|",
  "ORC|NW|ORD-1001|||NW",
  "OBR|1|ORD-1001|FILL-2001|CT^CT CHEST W/O CONTRAST^L|||20250115123000|||RAD|||",
].join("\r");

describe("hl7.parser", () => {
  describe("parseHl7Message", () => {
    it("parses MSH metadata (message type, control id, version, sender)", () => {
      const parsed = parseHl7Message(ADT);
      expect(parsed.messageType).toBe("ADT");
      expect(parsed.eventType).toBe("A01");
      expect(parsed.messageControlId).toBe("MSG0001");
      expect(parsed.version).toBe("2.5");
      expect(parsed.sendingApplication).toBe("RIS");
      expect(parsed.sendingFacility).toBe("HOSPITAL");
    });

    it("parses PID component access", () => {
      const parsed = parseHl7Message(ADT);
      const pid = parsed.segment("PID")!;
      expect(pid.component(2, 0, 0)).toBe("MRN000123");
      expect(pid.component(4, 0, 0)).toBe("DOE");
      expect(pid.component(4, 0, 1)).toBe("JOHN");
      expect(pid.component(4, 0, 2)).toBe("A");
      expect(pid.component(7)).toBe("M");
      expect(pid.component(10, 0, 2)).toBe("KATHMANDU");
    });

    it("handles repetitions on PID-3", () => {
      const msg = ADT.replace(
        "MRN000123^^^HOSP^MR",
        "MRN000123^^^HOSP^MR~ALT001^^^ALT^MR",
      );
      const pid = parseHl7Message(msg).segment("PID")!;
      expect(pid.field(2).length).toBe(2);
      expect(pid.field(2)[1][0]).toBe("ALT001");
    });

    it("parses OBR universal service id components", () => {
      const obr = parseHl7Message(ORM).segment("OBR")!;
      expect(obr.component(3, 0, 0)).toBe("CT");
      expect(obr.component(3, 0, 1)).toBe("CT CHEST W/O CONTRAST");
    });

    it("decodes escape sequences", () => {
      const msg = ADT.replace("DOE^JOHN", "DOE\\F\\JOHN\\S\\SR\\R\\");
      const pid = parseHl7Message(msg).segment("PID")!;
      expect(pid.field(4)[0][0]).toBe("DOE|JOHN^SR~");
    });

    it("throws on a message without MSH", () => {
      expect(() => parseHl7Message("PID|1||X")).toThrow(/MSH/);
    });

    it("throws on an empty message", () => {
      expect(() => parseHl7Message("")).toThrow(/Empty/);
    });

    it("lists all OBX segments", () => {
      const out = [
        "MSH|^~\\&|LI|HOSPITAL|HMS|NEPAL|20250115123000||ORU^R01|MSG0003|P|2.5",
        "PID|1||MRN000123^^^HOSP^MR||DOE^JOHN^A||19800101|M|",
        "OBR|1|LAB-1|FILL-1|CBC^COMPLETE BLOOD COUNT^L|||",
        "OBX|1|NM|WBC^WHITE BLOOD COUNT^L||8.5|10^9/L|4-11|N",
        "OBX|2|NM|HGB^HEMOGLOBIN^L||13.1|g/dL|12-16|N",
      ].join("\r");
      const parsed = parseHl7Message(out);
      expect(parsed.allSegments("OBX").length).toBe(2);
      expect(parsed.segment("OBX")!.component(2, 0, 1)).toBe(
        "WHITE BLOOD COUNT",
      );
    });
  });

  describe("parseHl7Timestamp", () => {
    it("parses full datetime and date-only values", () => {
      const dt = parseHl7Timestamp("20250115123045");
      expect(dt?.getFullYear()).toBe(2025);
      expect((dt as unknown as { getMonth: () => number }).getMonth()).toBe(0);
      expect((dt as unknown as { getHours: () => number }).getHours()).toBe(12);
      expect(parseHl7Timestamp("19800101")?.getFullYear()).toBe(1980);
    });

    it("returns undefined for garbage", () => {
      expect(parseHl7Timestamp("nope")).toBeUndefined();
      expect(parseHl7Timestamp("")).toBeUndefined();
    });
  });

  describe("buildAckMessage", () => {
    it("builds an ACK referencing the original control id", () => {
      const parsed = parseHl7Message(ADT);
      const ack = buildAckMessage(parsed, "HMS");
      expect(ack).toContain("ACK");
      expect(ack).toContain("MSG0001_A");
      expect(ack).toContain("MSA|AA|MSG0001");
    });
  });
});
