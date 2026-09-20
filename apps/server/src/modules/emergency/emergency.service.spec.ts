import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EmergencyService } from "./emergency.service";

function makeService(over: any = {}) {
  const prisma = {
    patient: {
      findFirst: jest.fn().mockResolvedValue({ id: "p1" }),
      findMany: jest.fn().mockResolvedValue([
        { id: "p1", firstName: "John", lastName: "Doe", mrn: "NBM-001" },
      ]),
      count: jest.fn().mockResolvedValue(1),
      ...(over.patient || {}),
    },
    emergencyCase: {
      findFirst: jest.fn().mockResolvedValue({ id: "ec1", patientId: "p1" }),
      ...(over.emergencyCase || {}),
    },
    invoice: {
      findUnique: jest.fn().mockResolvedValue({ id: "inv1", items: [], payments: [] }),
      ...(over.invoice || {}),
    },
  };
  const billing = {
    createInvoice: jest.fn().mockResolvedValue({ id: "inv1", dueAmount: 500 }),
    createPayment: jest.fn(),
    ...over.billing,
  };
  return { svc: new EmergencyService(prisma as any, billing as any), prisma, billing };
}

const ITEMS = [{ serviceName: "Emergency triage", quantity: 1, rate: 500 }];

describe("EmergencyService — createInvoice", () => {
  it("rejects a patient with no emergency case", async () => {
    const { svc, billing } = makeService({
      emergencyCase: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.createInvoice("t1", { patientId: "p1", items: ITEMS }, "u1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.createInvoice).not.toHaveBeenCalled();
  });

  it("creates the bill unpaid and never auto-records a payment", async () => {
    const { svc, billing } = makeService();
    const invoice = await svc.createInvoice(
      "t1",
      { patientId: "p1", emergencyCaseId: "ec1", items: ITEMS },
      "u1",
    );
    expect(billing.createInvoice).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ type: "EMERGENCY", patientId: "p1" }),
      "u1",
    );
    // Creating a bill must not settle it — payment is recorded via the Pay flow.
    expect(billing.createPayment).not.toHaveBeenCalled();
    expect(invoice).toBeTruthy();
  });

  it("rejects an emergency case that belongs to another patient", async () => {
    const { svc, billing } = makeService({
      emergencyCase: {
        findFirst: jest.fn().mockResolvedValue({ id: "ec9", patientId: "other", admissionId: null }),
      },
    });
    await expect(
      svc.createInvoice(
        "t1",
        { patientId: "p1", emergencyCaseId: "ec9", items: ITEMS },
        "u1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.createInvoice).not.toHaveBeenCalled();
  });
});

describe("EmergencyService — ER billing patient picker", () => {
  it("scopes the picker to the tenant and to patients with an ER case", async () => {
    const { svc, prisma } = makeService();
    const result = await svc.listErPatients("t1", { search: "John" });
    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          emergencyCases: { some: {} },
        }),
      }),
    );
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it("404s an unknown ER patient", async () => {
    const { svc } = makeService({
      patient: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(svc.getErPatient("t1", "nope")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
