import { buildFlowCytometryReportPdf, FlowReportData } from "./flow-cytometry-report-pdf";

function population(name: string, markerResults: any[]) {
  return {
    id: `p_${name}`,
    parentId: null,
    name,
    sortOrder: 1,
    percentage: 42.5,
    absoluteCount: 1240,
    countUnit: "cells/uL",
    qualitative: "Dim",
    status: "FINALIZED",
    notes: undefined,
    markerResults,
  };
}

function mr(markerCode: string, extra: any = {}) {
  return {
    markerId: `m_${markerCode}`,
    markerCode,
    percentage: extra.percentage ?? 12.3,
    absoluteCount: null,
    mfi: null,
    unit: "%",
    valueText: null,
    isAbnormal: false,
    isCritical: false,
    status: "RESULT_ENTERED",
    ...extra,
  };
}

const baseReport: FlowReportData = {
  orderNumber: "LAB-20260915-0007",
  status: "APPROVED",
  isStat: false,
  isEmergency: false,
  orderedAt: new Date("2026-09-15T06:00:00Z"),
  processedAt: new Date("2026-09-15T07:00:00Z"),
  approvedAt: new Date("2026-09-15T08:00:00Z"),
  verifiedByName: null,
  approvedByName: "Dr. Pathologist",
  clinicalNote: undefined,
  patient: {
    name: "Sita Gurung",
    mrn: "MRN-007",
    hospitalNumber: "H-9001",
    gender: "FEMALE",
    age: "34Y",
    dateOfBirth: new Date("1992-02-02"),
  },
  samples: [
    { specimenType: "Whole Blood", barcode: "FC-887766", container: "EDTA (lavender top)", status: "RECEIVED", collectedAt: new Date("2026-09-15T06:30:00Z") },
  ],
  panel: {
    code: "FCM-MRD",
    name: "MRD Panel (B-ALL)",
    specimenType: "Bone Marrow",
    container: "Heparin",
    markers: [
      { code: "CD19", name: "CD19", fluorochrome: "FITC" },
      { code: "CD20", name: "CD20", fluorochrome: "PE" },
      { code: "CD34", name: "CD34", fluorochrome: "PerCP-Cy5.5" },
      { code: "CD45", name: "CD45", fluorochrome: "V500" },
      { code: "CD38", name: "CD38", fluorochrome: "PE-Cy7" },
      { code: "CD58", name: "CD58", fluorochrome: "FITC" },
      { code: "CD10", name: "CD10", fluorochrome: "APC" },
      { code: "CD123", name: "CD123", fluorochrome: "PE" },
    ],
  },
  gatingStrategy: "CD45 vs SSC",
  resultSummary: "No evidence of MRD in this sample.",
  runs: [
    {
      instrumentName: "Cytek Aurora - North Wing",
      acquisitionStatus: "COMPLETED",
      qcStatus: "PASSED",
      compensationStatus: "APPLIED",
      numberOfEvents: 150000,
      numberOfParameters: 18,
      startedAt: new Date("2026-09-15T07:00:00Z"),
    },
  ],
  populations: {
    rows: [
      population("Blast gate", [mr("CD19", { percentage: 45 }), mr("CD20", { percentage: 1.2 }), mr("CD34", { percentage: 3.1 })]),
      population("Abnormal lymphoid", [
        mr("CD19", { percentage: 65, isAbnormal: true }),
        mr("CD10", { percentage: 70, isAbnormal: true, isCritical: true }),
      ]),
    ],
    tree: [],
  },
};

const hospital: any = {
  name: "NB Maitri Hospital",
  addressLine1: "Main Road",
  city: "Kathmandu",
  district: "Kathmandu",
  country: "Nepal",
  phone: "+977-1-5500000",
  email: "hello@nbmaitri.com",
  website: "nbmaitri.com",
  panNumber: "301234567",
};

describe("buildFlowCytometryReportPdf", () => {
  const buffer = buildFlowCytometryReportPdf(baseReport, hospital, "Tech User");
  const content = buffer.toString("latin1");

  it("returns a valid PDF buffer", () => {
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(content.startsWith("%PDF-1.4")).toBe(true);
    expect(content).toContain("%%EOF");
  });

  it("renders title, order and patient details", () => {
    expect(content).toContain("FLOW CYTOMETRY REPORT");
    expect(content).toContain("LAB-20260915-0007");
    expect(content).toContain("Sita Gurung");
    expect(content).toContain("MRN-007");
    expect(content).toContain("NB Maitri Hospital");
  });

  it("renders panel composition and instruments", () => {
    expect(content).toContain("MRD Panel");
    expect(content).toContain("B-ALL");
    expect(content).toContain("FCM-MRD");
    expect(content).toContain("Cytek Aurora - North Wing");
    expect(content).toContain("Events: 150000");
  });

  it("renders populations with marker percentages", () => {
    expect(content).toContain("Blast gate");
    expect(content).toContain("45%");
    expect(content).toContain("CD34");
  });

  it("renders abnormal and critical flags", () => {
    expect(content).toContain("ABNORMAL");
    expect(content).toContain("CRITICAL");
  });

  it("renders interpretation text and gating strategy", () => {
    expect(content).toContain("GATING STRATEGY");
    expect(content).toContain("INTERPRETATION");
    expect(content).toContain("No evidence of MRD in this sample.");
  });

  it("renders paging and electronic signature", () => {
    expect(content).toContain("Page 1 of 1");
    expect(content).toContain("Electronically signed by: Dr. Pathologist");
  });

  it("renders an instrument marker matrix column header", () => {
    expect(content).toContain("Abs. Count");
    expect(content).toContain("MFI");
  });
});

describe("buildFlowCytometryReportPdf multi-page", () => {
  const manyPopulations = {
    ...baseReport,
    populations: {
      rows: Array.from({ length: 24 }, (_, i) =>
        population(`Pop ${i + 1}`, [
          mr("CD19"), mr("CD20"), mr("CD34"), mr("CD45"),
          mr("CD38"), mr("CD58"), mr("CD10"), mr("CD123"),
        ]),
      ),
      tree: [],
    },
  };

  const buffer = buildFlowCytometryReportPdf(manyPopulations, hospital, "Tech User");
  const content = buffer.toString("latin1");

  it("produces multiple pages", () => {
    const pageCount = (content.match(/\/Type \/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  it("renders page numbers across all pages", () => {
    expect(content).toMatch(/Page \d+ of \d+/);
  });

  it("still ends with a valid trailer", () => {
    expect(content).toContain("%%EOF");
  });
});