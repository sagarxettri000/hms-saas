import { ExportsService } from "./exports.service";
import { buildPdf, toCsv } from "./pdf.util";

describe("ExportsService", () => {
  const prisma = {
    patient: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    labOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
    prescription: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const reports = {
    getSummary: jest.fn().mockResolvedValue({
      totalRevenue: 1000,
      collected: 800,
      outstanding: 200,
    }),
    revenueByStatus: jest.fn().mockResolvedValue([
      { status: "PAID", count: 2, amount: 800, collected: 800 },
      { status: "OVERDUE", count: 1, amount: 200, collected: 0 },
    ]),
    doctorWorkload: jest
      .fn()
      .mockResolvedValue([{ doctorId: "d1", name: "Dr Ram", count: 5 }]),
  };
  const service = new ExportsService(prisma as any, reports as any);

  beforeEach(() => jest.clearAllMocks());

  it("builds a patients CSV with header and rows", async () => {
    prisma.patient.findMany.mockResolvedValue([
      {
        mrn: "MRN-1",
        firstName: "Ram",
        middleName: null,
        lastName: "Sharma",
        gender: "MALE",
        dateOfBirth: new Date("1990-01-01"),
        mobile: "9800000000",
        phone: null,
        email: "ram@x.com",
        addressLine1: "Main Rd",
        city: "KTM",
        district: "KTM",
        status: "ACTIVE",
      },
    ]);
    const csv = await service.patientsCsv("t1");
    expect(csv).toContain("MRN,Name,Gender");
    expect(csv).toContain("MRN-1");
    expect(csv).toContain("Ram Sharma");
    const arg = prisma.patient.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantId: "t1", deletedAt: null });
  });

  it("builds an invoices CSV scoped by tenant and date range", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        invoiceNumber: "INV-1",
        patient: {
          firstName: "Ram",
          middleName: null,
          lastName: "Sharma",
          mrn: "MRN-1",
        },
        issuedDate: new Date("2026-08-01"),
        totalAmount: 500,
        paidAmount: 500,
        dueAmount: 0,
        status: "PAID",
      },
    ]);
    const csv = await service.invoicesCsv("t1", { from: "2026-08-01" });
    expect(csv).toContain("INV-1");
    const arg = prisma.invoice.findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe("t1");
    expect(arg.where.issuedDate.gte).toBeInstanceOf(Date);
  });

  it("builds a lab results CSV", async () => {
    prisma.labOrderItem.findMany.mockResolvedValue([
      {
        labOrder: {
          orderNumber: "LAB-1",
          patient: {
            mrn: "MRN-1",
            firstName: "Ram",
            middleName: null,
            lastName: "Sharma",
          },
        },
        testName: "Glucose",
        result: null,
        resultValue: 120,
        unit: "mg/dL",
        referenceRange: "70-100",
        isAbnormal: true,
      },
    ]);
    const csv = await service.labResultsCsv("t1");
    expect(csv).toContain("LAB-1");
    expect(csv).toContain("Glucose");
    expect(csv).toContain("YES");
  });

  it("builds a prescriptions CSV flattening items", async () => {
    prisma.prescription.findMany.mockResolvedValue([
      {
        id: "RX-1",
        patient: {
          mrn: "MRN-1",
          firstName: "Ram",
          middleName: null,
          lastName: "Sharma",
        },
        status: "ACTIVE",
        items: [
          {
            medicineName: "Paracetamol",
            dosage: "500mg",
            frequency: "TDS",
            duration: "5 days",
          },
        ],
      },
    ]);
    const csv = await service.prescriptionsCsv("t1");
    expect(csv).toContain("RX-1");
    expect(csv).toContain("Paracetamol");
  });

  it("produces a valid PDF for revenue summary", async () => {
    const pdf = await service.revenuePdf("t1", { from: "2026-08-01" });
    expect(pdf).toBeInstanceOf(Buffer);
    const text = pdf.toString("latin1");
    expect(text).toContain("%PDF-1.4");
    expect(text).toContain("%%EOF");
    expect(reports.getSummary).toHaveBeenCalledWith("t1", {
      from: "2026-08-01",
    });
  });

  it("produces a valid PDF for doctor workload", async () => {
    const pdf = await service.doctorWorkloadPdf("t1", {});
    const text = pdf.toString("latin1");
    expect(text).toContain("%PDF-1.4");
    expect(text).toContain("%%EOF");
    expect(text).toContain("Dr Ram");
  });
});

describe("pdf.util", () => {
  it("wraps CSV cells containing delimiters", () => {
    const csv = toCsv([["a,b", 'say "hi"', "ok"]]);
    expect(csv).toBe('"a,b","say ""hi""",ok');
  });

  it("escapes newlines in CSV cells", () => {
    const csv = toCsv([["line1\nline2"]]);
    expect(csv).toBe('"line1\nline2"');
  });

  it("buildPdf returns a well-formed minimal PDF", () => {
    const pdf = buildPdf({
      title: "Test",
      subtitle: "Sub",
      columns: [{ title: "A", width: 1 }],
      rows: [["x"], ["y"]],
    });
    const text = pdf.toString("latin1");
    expect(text).toContain("%PDF-1.4");
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("startxref");
    expect(text).toContain("%%EOF");
  });

  it("buildPdf renders an optional watermark (§35.2)", () => {
    const pdf = buildPdf({
      title: "Test",
      columns: [{ title: "A", width: 1 }],
      rows: [["x"]],
      watermark: "CONFIDENTIAL",
    });
    const text = pdf.toString("latin1");
    expect(text).toContain("(CONFIDENTIAL) Tj");
    const plain = buildPdf({
      title: "Test",
      columns: [{ title: "A", width: 1 }],
      rows: [["x"]],
    }).toString("latin1");
    expect(plain).not.toContain("CONFIDENTIAL");
  });
});
