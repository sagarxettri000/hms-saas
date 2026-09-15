import {
  FLOW_MARKERS,
  FLOW_MARKERS_BY_CODE,
  FLOW_PANELS,
  FLOW_PANELS_BY_CODE,
  FLOW_INSTRUMENTS,
  FLOW_CYTOMETRY_DISCIPLINE,
} from "./flow-cytometry-catalog";

describe("flow cytometry catalog", () => {
  it("defines exactly 23 unique markers", () => {
    expect(FLOW_MARKERS).toHaveLength(23);
    const codes = FLOW_MARKERS.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const m of FLOW_MARKERS) {
      expect(FLOW_MARKERS_BY_CODE[m.code]).toBeDefined();
      expect(m.category).toBeTruthy();
    }
  });

  it("defines the four panels with the required marker dimensions", () => {
    expect(FLOW_PANELS).toHaveLength(4);
    expect(FLOW_PANELS.map((p) => p.code).sort()).toEqual(
      ["FCM-LYS", "FCM-ISP", "FCM-MRD", "FCM-PNH"].sort(),
    );
    const byCode = Object.fromEntries(FLOW_PANELS.map((p) => [p.code, p.markers.length]));
    expect(byCode["FCM-LYS"]).toBe(7);
    expect(byCode["FCM-ISP"]).toBe(10);
    expect(byCode["FCM-MRD"]).toBe(8);
    expect(byCode["FCM-PNH"]).toBe(5);
  });

  it("every panel marker resolves to a known marker", () => {
    for (const panel of FLOW_PANELS) {
      const seen = new Set<string>();
      for (const def of panel.markers) {
        expect(FLOW_MARKERS_BY_CODE[def.markerCode]).toBeDefined();
        expect(def.fluorochrome).toBeTruthy();
        expect(def.sortOrder).toBeGreaterThan(0);
        expect(seen.has(def.markerCode)).toBe(false); // no duplicate markers in a panel
        seen.add(def.markerCode);
      }
      // sort orders are strictly sequential
      expect(panel.markers.map((m) => m.sortOrder)).toEqual(
        panel.markers.map((_, i) => i + 1),
      );
    }
  });

  it("CD45 is the universal gating marker present in every panel", () => {
    for (const panel of FLOW_PANELS) {
      expect(panel.markers.some((m) => m.markerCode === "CD45")).toBe(true);
    }
  });

  it("prices are positive and turnaround times are set", () => {
    for (const p of FLOW_PANELS) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.turnaroundTime).toBeGreaterThan(0);
      expect(p.category).toBe("Flow Cytometry");
      expect(FLOW_PANELS_BY_CODE[p.code]).toBeDefined();
    }
  });

  it("exposes the discipline constant used by the scheduler", () => {
    expect(FLOW_CYTOMETRY_DISCIPLINE).toBe("FLOW_CYTOMETRY");
  });

  it("does not publish any clinical reference range or cut-off", () => {
    // Module constraint: catalogue carries configuration only, never
    // diagnostic thresholds. Interpretations are reviewer-provided.
    const s = JSON.stringify(FLOW_MARKERS) + JSON.stringify(FLOW_PANELS);
    expect(s).not.toMatch(/\b(low|high|cutoff|cut-off|threshold|reference)\b/i);
  });

  it("defines instrument catalogue with unique valid entries", () => {
    expect(FLOW_INSTRUMENTS).toHaveLength(3);
    const codes = FLOW_INSTRUMENTS.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const i of FLOW_INSTRUMENTS) {
      expect(i.channels).toBeGreaterThan(0);
      expect(i.name).toBeTruthy();
      expect(i.manufacturer).toBeTruthy();
      expect(i.location).toBeTruthy();
    }
  });
});