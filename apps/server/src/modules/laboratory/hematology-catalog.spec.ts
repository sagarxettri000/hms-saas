import {
  HEMATOLOGY_CATALOG,
  HEMATOLOGY_PANEL,
  HEMATOLOGY_BY_CODE,
  resolveReferenceRange,
  evaluateFlag,
  rangeDisplay,
} from "./hematology-catalog";

describe("hematology catalog", () => {
  it("defines exactly the 14 CBC components with unique codes", () => {
    expect(HEMATOLOGY_CATALOG).toHaveLength(14);
    const codes = HEMATOLOGY_CATALOG.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const t of HEMATOLOGY_CATALOG) {
      expect(t.discipline).toBe("HEMATOLOGY");
      expect(t.precision).toBeGreaterThanOrEqual(0);
      expect(t.resultType).toBe("NUMERIC");
    }
  });

  it("panel members all resolve to catalogue entries", () => {
    expect(HEMATOLOGY_PANEL.memberCodes).toHaveLength(14);
    for (const code of HEMATOLOGY_PANEL.memberCodes) {
      expect(HEMATOLOGY_BY_CODE[code]).toBeDefined();
    }
  });

  it("sex-specific tests publish male, female and combined (OTHER) rows", () => {
    const sexAware = HEMATOLOGY_CATALOG.filter((t) =>
      t.ranges.some((r) => r.sex),
    );
    // HGB, RBC, PCV, ESR are sex-aware
    expect(sexAware.map((t) => t.code).sort()).toEqual(
      ["HGB", "RBC", "PCV", "ESR"].sort(),
    );
    for (const t of sexAware) {
      expect(t.ranges.some((r) => r.sex === "MALE")).toBe(true);
      expect(t.ranges.some((r) => r.sex === "FEMALE")).toBe(true);
      expect(t.ranges.some((r) => r.sex === "OTHER")).toBe(true);
    }
  });
});

describe("resolveReferenceRange", () => {
  const hgb = HEMATOLOGY_BY_CODE.HGB;

  it("resolves adult male for male patients", () => {
    const r = resolveReferenceRange(hgb, "MALE");
    expect(r?.label).toBe("Adult male");
    expect(r?.low).toBe(13.5);
    expect(r?.high).toBe(17.5);
    expect(r?.isSexSpecific).toBe(true);
  });

  it("resolves adult female for female patients", () => {
    const r = resolveReferenceRange(hgb, "FEMALE");
    expect(r?.label).toBe("Adult female");
  });

  it("falls back to the combined OTHER row for unknown genders", () => {
    const r = resolveReferenceRange(hgb, "NON_BINARY");
    expect(r?.label).toBe("Adult (combined)");
  });

  it("returns null for a test with no configured ranges", () => {
    expect(
      resolveReferenceRange({ ranges: [], unit: "u", code: "X" }, "MALE"),
    ).toBeNull();
  });

  it("uses the sex-less reference for non sex-specific tests", () => {
    const r = resolveReferenceRange(HEMATOLOGY_BY_CODE.TLC, "MALE");
    expect(r?.label).toBe("Adult");
    expect(r?.low).toBe(4);
    expect(r?.high).toBe(11);
  });
});

describe("evaluateFlag", () => {
  const resolved = resolveReferenceRange(HEMATOLOGY_BY_CODE.TLC, "MALE")!;

  it("flags NORMAL inside range", () => {
    const f = evaluateFlag(7, resolved);
    expect(f).toEqual({ flag: "NORMAL", isAbnormal: false, isCritical: false });
  });

  it("flags ABNORMAL outside the range", () => {
    const f = evaluateFlag(12, resolved);
    expect(f.flag).toBe("ABNORMAL");
    expect(f.isAbnormal).toBe(true);
    expect(f.isCritical).toBe(false);
  });

  it("flags CRITICAL below 0.5x low", () => {
    const f = evaluateFlag(1.9, resolved); // < 2.0 => 0.5 * 4.0
    expect(f.flag).toBe("CRITICAL");
    expect(f.isCritical).toBe(true);
  });

  it("flags CRITICAL above 2x high", () => {
    const f = evaluateFlag(23, resolved); // > 22 => 2 * 11
    expect(f.flag).toBe("CRITICAL");
    expect(f.isCritical).toBe(true);
  });

  it("flags NORMAL when no range is configured", () => {
    const f = evaluateFlag(999, null);
    expect(f).toEqual({ flag: "NORMAL", isAbnormal: false, isCritical: false });
  });
});

describe("rangeDisplay", () => {
  it("renders low - high", () => {
    expect(
      rangeDisplay(resolveReferenceRange(HEMATOLOGY_BY_CODE.TLC, "MALE")),
    ).toBe("4 - 11");
  });

  it("renders an empty string for no range", () => {
    expect(rangeDisplay(null)).toBe("");
  });
});
