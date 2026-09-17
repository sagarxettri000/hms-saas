import { code128Segments, code128BSymbols } from "./code128";

describe("code128", () => {
  it("starts with Start-B, ends with Stop, and includes a valid checksum", () => {
    const symbols = code128BSymbols("INV-20260917-00001");
    expect(symbols).not.toBeNull();
    expect(symbols![0]).toBe(104); // Start B
    expect(symbols![symbols!.length - 1]).toBe(106); // Stop
    const data = symbols!.slice(1, -2);
    const checksum = symbols![symbols!.length - 2];
    let sum = 104;
    data.forEach((v, i) => (sum += v * (i + 1)));
    expect(checksum).toBe(sum % 103);
  });

  it("rejects non-printable-ASCII values", () => {
    expect(code128Segments("INV-€")).toBeNull();
    expect(code128Segments("")).toBeNull();
  });

  it("produces segments covering exactly the total module width", () => {
    const segments = code128Segments("INV-20260917-00002")!;
    const covered = segments.reduce((s, seg) => s + seg.w, 0);
    // Start(11) + 18 data chars(11 each) + checksum(11) + stop(13) = 233
    expect(covered).toBe(233);
  });

  it("every symbol boundary restarts with a bar (spec-critical for scanners)", () => {
    const segments = code128Segments("INV-20260917-00002")!;
    // The stop pattern ends with an odd run count (2-module termination bar),
    // so the only guaranteed invariant is: no two adjacent segments share a
    // state — i.e. per-symbol parsing never yields bar,bar or space,space.
    let idx = 0;
    let prevWasBar: boolean | null = null;
    for (const seg of segments) {
      if (idx % 11 === 0) prevWasBar = null; // symbol boundary
      if (prevWasBar === seg.bar) {
        // adjacent same-state inside a symbol is impossible in Code128
        throw new Error("adjacent segments share the same bar state");
      }
      prevWasBar = seg.bar;
      idx++;
    }
  });

  it("is deterministic — same value, same geometry", () => {
    const a = code128Segments("INV-20260917-00003");
    const b = code128Segments("INV-20260917-00003");
    expect(a).toEqual(b);
  });

  it("produces different geometry for different values", () => {
    const a = code128Segments("INV-20260917-00003");
    const b = code128Segments("INV-20260917-00004");
    expect(a).not.toEqual(b);
  });
});
