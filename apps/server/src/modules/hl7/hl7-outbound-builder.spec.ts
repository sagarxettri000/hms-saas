import { buildRadiologyOruReport, frameMllp } from "./hl7-outbound-builder";

describe("HL7 outbound ORU builder", () => {
  const base = {
    patient: {
      mrn: "MRN-1",
      firstName: "Ramesh",
      lastName: "Shrestha",
      dateOfBirth: new Date("1990-01-02T00:00:00Z"),
      gender: "M",
    },
    order: {
      orderNumber: "RAD-2026-0001",
      accessionNumber: "ACC-12345",
      modality: "CT",
      bodyPart: "CHEST",
      status: "REPORTED",
      reportedAt: new Date("2026-09-08T12:30:00Z"),
    },
    report: {
      impression: "No acute finding",
      findings: "Clear lungs",
      report: "Normal chest CT.",
    },
  };

  it("builds a well-formed ORU^R01 message", () => {
    const msg = buildRadiologyOruReport(base as any, { controlId: "ctl-1" });

    const lines = msg.trim().split("\r");
    expect(lines[0]).toMatch(
      /^MSH\|\^\~\\&\|HMS\|\|\|\|[0-9]{14}\|\|ORU\^R01\|ctl-1\|P\|2\.5$/,
    );
    expect(lines[1]).toMatch(
      /^PID\|1\|MRN-1\|\|Shrestha\^Ramesh\|\|19900102\d*\|M$/,
    );
    expect(lines[2]).toBe("ORC|RE|RAD-2026-0001|ACC-12345");
    expect(lines[3]).toMatch(/^OBR\|1\|RAD-2026-0001\|ACC-12345\|CT\^CHEST/);
    expect(lines[4]).toBe("OBX|1|TX|1^IMPRESSION||No acute finding|");
    expect(lines[5]).toBe("OBX|2|TX|2^FINDINGS||Clear lungs|");
    expect(lines[6]).toBe("OBX|3|TX|3^REPORT||Normal chest CT.|");
    expect(lines[7]).toBeUndefined();
  });

  it("escapes HL7 delimiters in free-text", () => {
    const msg = buildRadiologyOruReport({
      ...base,
      report: { impression: "a|b^c~d&e\\f" },
    } as any);
    const obx = msg.trim().split("\r")[4];
    expect(obx).toBe("OBX|1|TX|1^IMPRESSION||a\\F\\b\\S\\c\\R\\d\\T\\e\\E\\f|");
  });

  it("frames a message with MLLP start/end blocks", () => {
    const frame = frameMllp("MSH|...");
    expect(frame[0]).toBe(0x0b);
    expect(frame[frame.length - 2]).toBe(0x1c);
    expect(frame[frame.length - 1]).toBe(0x0d);
    expect(frame.subarray(1, frame.length - 2).toString("utf8")).toBe(
      "MSH|...",
    );
  });

  it("omits empty OBX values", () => {
    const msg = buildRadiologyOruReport({
      ...base,
      report: { impression: "", findings: "", report: "" },
    } as any);
    const lines = msg.trim().split("\r");
    expect(lines[4]).toBe("OBX|1|TX|1^IMPRESSION|||");
  });
});
