import { buildLabReportPdf } from "./lab-report-pdf";

const order: any = {
  id: "ord_1",
  orderNumber: "LAB-20260915-0001",
  status: "APPROVED",
  isStat: false,
  isEmergency: false,
  orderedAt: new Date("2026-09-15T06:00:00Z"),
  processedAt: new Date("2026-09-15T07:00:00Z"),
  approvedAt: new Date("2026-09-15T08:00:00Z"),
  clinicalNote: "Routine check",
  reportTitle: "HEMATOLOGY REPORT",
  department: "Department of Pathology",
  patient: {
    firstName: "Ram",
    middleName: "",
    lastName: "Shrestha",
    mrn: "MRN-001",
    hospitalNumber: "H-8821",
    gender: "MALE",
    dateOfBirth: new Date("1990-01-01"),
  },
  items: [
    {
      testName: "Hemoglobin",
      resultValue: 11.2,
      unit: "g/dL",
      referenceRange: "Adult male: 13.5 - 17.5 g/dL",
      method: "Automated hematology analyzer",
      precision: 1,
      isAbnormal: true,
      isCritical: false,
      status: "RESULT_ENTERED",
    },
    {
      testName: "Platelets",
      resultValue: null,
      result: null,
      unit: "x10^3/uL",
      referenceRange: "150 - 450",
      method: "Automated hematology analyzer",
      precision: 0,
      isAbnormal: false,
      isCritical: false,
      status: "ORDERED",
    },
  ],
  samples: [
    { specimenType: "Whole Blood", barcode: "BC-123456", collectedAt: new Date("2026-09-15T06:30:00Z"), status: "COLLECTED" },
  ],
  approvedByName: "Dr. Pathologist",
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
  vatNumber: "301234567",
  registrationNumber: "REG-0091",
};

describe("buildLabReportPdf", () => {
  const buffer = buildLabReportPdf(order, hospital, "Tech User");
  const content = buffer.toString("latin1");

  it("returns a PDF buffer", () => {
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(content.startsWith("%PDF-1.4")).toBe(true);
    expect(content).toContain("%%EOF");
  });

  it("renders the hematology report title and department", () => {
    expect(content).toContain("HEMATOLOGY REPORT");
    expect(content).toContain("Department of Pathology");
  });

  it("renders hospital letterhead identifiers", () => {
    expect(content).toContain("NB Maitri Hospital");
    expect(content).toContain("PAN: 301234567");
    expect(content).toContain("VAT: 301234567");
    expect(content).toContain("Reg: REG-0091");
    expect(content).toContain("nbmaitri.com");
  });

  it("renders patient and order details", () => {
    expect(content).toContain("Ram Shrestha");
    expect(content).toContain("H-8821");
    expect(content).toContain("MRN-001");
    expect(content).toContain("LAB-20260915-0001");
  });

  it("renders the results table with a Method column", () => {
    expect(content).toContain("Method");
    expect(content).toContain("Automated hematology analyzer");
    expect(content).toContain("Adult male: 13.5 - 17.5 g/dL");
  });

  it("renders ABNORMAL flag for abnormal results", () => {
    expect(content).toContain("ABNORMAL");
  });

  it("renders Pending (not Normal) for un-entered results", () => {
    expect(content).toContain("Pending");
    expect(content).toContain("150 - 450");
  });

  it("renders barcode text in a box", () => {
    expect(content).toContain("BARCODE");
    // Barcode is rendered as spaced glyphs (visual barcode effect)
    expect(content).toContain("B C - 1 2 3 4 5 6");
  });

  it("renders electronic signature", () => {
    expect(content).toContain("Electronically signed by: Dr. Pathologist");
  });
});