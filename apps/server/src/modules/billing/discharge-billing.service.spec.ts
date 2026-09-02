import { DischargeBillingService } from "./discharge-billing.service";

describe("DischargeBillingService", () => {
  const now = new Date();
  const tenantId = "t1";
  const patientId = "p1";
  const admissionId = "adm1";
  const userId = "u1";

  function mockPrisma(overrides: Record<string, any> = {}) {
    const defaults: Record<string, any> = {
      patient: {
        findFirst: jest.fn().mockResolvedValue({ id: patientId, tenantId, firstName: "John", lastName: "Doe" }),
      },
      admission: {
        findFirst: jest.fn().mockResolvedValue({ id: admissionId, tenantId, patientId, admissionDate: now }),
      },
      bed: { findMany: jest.fn().mockResolvedValue([]) },
      bedAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      encounter: { findMany: jest.fn().mockResolvedValue([]) },
      labOrder: { findMany: jest.fn().mockResolvedValue([]) },
      labOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
      radiologyOrder: { findMany: jest.fn().mockResolvedValue([]) },
      oTCase: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "inv1", invoiceNumber: "INV-20260902-00001", ...data })),
        update: jest.fn().mockResolvedValue({}),
      },
      nursingNote: { findMany: jest.fn().mockResolvedValue([]) },
      medicationAdministration: { findMany: jest.fn().mockResolvedValue([]) },
      billingService: { findMany: jest.fn().mockResolvedValue([]) },
      deposit: { findMany: jest.fn().mockResolvedValue([]) },
      payment: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "pay1", ...data })),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      financialTransaction: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "ft1", ...data })),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      dischargeBill: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue({ data: [], total: 0 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "db1", ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
        count: jest.fn().mockResolvedValue(0),
      },
      dischargeBillDetail: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "d1", ...data })),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      chargeTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "ct1", ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      ...overrides,
    };
    return defaults;
  }

  describe("createDraftBill", () => {
    it("creates an empty draft bill (services added manually later)", async () => {
      const prisma = mockPrisma();
      prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
      const service = new DischargeBillingService(prisma as any);
      const result = await service.createDraftBill(tenantId, { patientId, admissionId }, userId);
      expect(result).toBeDefined();
      // A brand-new draft bill starts with no auto-collected charge details
      expect(prisma.dischargeBill.create).toHaveBeenCalled();
      const createArgs = prisma.dischargeBill.create.mock.calls[0][0];
      expect(createArgs.data.details).toBeUndefined();
    });
  });

  describe("addManualCharge", () => {
    it("adds a manual charge to a draft bill", async () => {
      const draftBill = {
        id: "db1",
        tenantId,
        status: "DRAFT",
        details: [],
      };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(draftBill),
          update: jest.fn().mockResolvedValue(draftBill),
        },
      });
      prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
      const service = new DischargeBillingService(prisma as any);
      const result = await service.addManualCharge(
        tenantId,
        "db1",
        { serviceName: "Consultation", quantity: 1, unitRate: 1000 },
        userId,
      );
      expect(result).toBeDefined();
      expect(prisma.dischargeBillDetail.create).toHaveBeenCalled();
    });

    it("rejects adding charge to non-DRAFT bill", async () => {
      const finalizedBill = {
        id: "db1",
        tenantId,
        status: "FINALIZED",
        details: [],
      };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(finalizedBill),
        },
      });
      const service = new DischargeBillingService(prisma as any);
      await expect(
        service.addManualCharge(tenantId, "db1", { serviceName: "X", quantity: 1, unitRate: 100 }, userId),
      ).rejects.toThrow();
    });
  });

  describe("removeCharge", () => {
    it("removes a charge from a draft bill", async () => {
      const draftBill = { id: "db1", tenantId, status: "DRAFT" };
      const detail = { id: "d1", dischargeBillId: "db1", tenantId };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(draftBill),
        },
        dischargeBillDetail: {
          findFirst: jest.fn().mockResolvedValue(detail),
          delete: jest.fn().mockResolvedValue(detail),
          findMany: jest.fn().mockResolvedValue([]),
        },
      });
      prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
      const service = new DischargeBillingService(prisma as any);
      await service.removeCharge(tenantId, "db1", "d1", userId);
      expect(prisma.dischargeBillDetail.delete).toHaveBeenCalled();
    });
  });

  describe("applyDiscount", () => {
    it("applies discount to a draft bill", async () => {
      const draftBill = { id: "db1", tenantId, status: "DRAFT", discount: 0 };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(draftBill),
          update: jest.fn().mockResolvedValue({ ...draftBill, discount: 5000 }),
        },
      });
      prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
      const service = new DischargeBillingService(prisma as any);
      const result = await service.applyDiscount(
        tenantId,
        "db1",
        { amount: 5000, reason: "VIP discount" },
        userId,
      );
      expect(result).toBeDefined();
      expect(prisma.dischargeBill.update).toHaveBeenCalled();
    });
  });

  describe("finalizeBill", () => {
    it("finalizes a draft bill and creates an Invoice", async () => {
      const draftBill = {
        id: "db1",
        tenantId,
        billNumber: "DRAFT",
        patientId,
        admissionId,
        status: "DRAFT",
        paidAmount: 0,
        discount: 0,
        corporateAmount: 0,
        details: [
          { grossAmount: 10000, tax: 1000, discount: 0, insuranceAmount: 0, netAmount: 11000, serviceName: "Consultation", serviceCode: "CON", quantity: 1, unitRate: 10000, chargeTransactionId: "ct1", serviceId: "s1", description: null, sourceModule: "IPD", sourceTransactionId: null },
          { grossAmount: 5000, tax: 500, discount: 0, insuranceAmount: 0, netAmount: 5500, serviceName: "Lab Test", serviceCode: "LAB", quantity: 1, unitRate: 5000, chargeTransactionId: "ct2", serviceId: "s2", description: null, sourceModule: "LAB", sourceTransactionId: "lab1" },
        ],
      };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(draftBill),
          update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
        },
        deposit: { findMany: jest.fn().mockResolvedValue([]) },
        chargeTransaction: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        invoice: {
          create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "inv1", invoiceNumber: "INV-20260902-00001", ...data })),
          update: jest.fn().mockResolvedValue({}),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      });
      prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
      const service = new DischargeBillingService(prisma as any);
      const result = await service.finalizeBill(tenantId, "db1", userId);
      expect(result).toBeDefined();
      expect(prisma.invoice.create).toHaveBeenCalled();
      expect(prisma.chargeTransaction.updateMany).toHaveBeenCalled();
      expect(prisma.financialTransaction.create).toHaveBeenCalled();
    });

    it("rejects finalizing a non-DRAFT bill", async () => {
      const finalizedBill = {
        id: "db1",
        tenantId,
        status: "FINALIZED",
        details: [],
      };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(finalizedBill),
        },
      });
      const service = new DischargeBillingService(prisma as any);
      await expect(service.finalizeBill(tenantId, "db1", userId)).rejects.toThrow();
    });

    it("rejects finalizing a bill with no details", async () => {
      const emptyBill = {
        id: "db1",
        tenantId,
        status: "DRAFT",
        details: [],
      };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(emptyBill),
        },
      });
      const service = new DischargeBillingService(prisma as any);
      await expect(service.finalizeBill(tenantId, "db1", userId)).rejects.toThrow();
    });
  });

  describe("recordPayment", () => {
    it("records payment and syncs to Invoice", async () => {
      const bill = {
        id: "db1",
        tenantId,
        billNumber: "DB-20260902-00001",
        patientId,
        admissionId,
        invoiceId: "inv1",
        status: "FINALIZED",
        netAmount: 16500,
        paidAmount: 0,
        dueAmount: 16500,
      };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(bill),
          update: jest.fn().mockResolvedValue(bill),
        },
        payment: {
          create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "pay1", ...data })),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        invoice: { update: jest.fn().mockResolvedValue({}) },
      });
      prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
      const service = new DischargeBillingService(prisma as any);
      const result = await service.recordPayment(
        tenantId,
        "db1",
        { amount: 10000, method: "CASH" },
        userId,
      );
      expect(result).toBeDefined();
      expect(prisma.payment.create).toHaveBeenCalled();
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv1" },
          data: expect.objectContaining({ paidAmount: 10000 }),
        }),
      );
    });

    it("rejects payment exceeding due amount", async () => {
      const bill = {
        id: "db1",
        tenantId,
        status: "FINALIZED",
        netAmount: 5000,
        paidAmount: 0,
        dueAmount: 5000,
      };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(bill),
        },
      });
      const service = new DischargeBillingService(prisma as any);
      await expect(
        service.recordPayment(tenantId, "db1", { amount: 10000, method: "CASH" }, userId),
      ).rejects.toThrow();
    });

    it("rejects payment on non-FINALIZED bill", async () => {
      const bill = {
        id: "db1",
        tenantId,
        status: "DRAFT",
        dueAmount: 5000,
      };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(bill),
        },
      });
      const service = new DischargeBillingService(prisma as any);
      await expect(
        service.recordPayment(tenantId, "db1", { amount: 1000, method: "CASH" }, userId),
      ).rejects.toThrow();
    });
  });

  describe("cancelBill", () => {
    it("cancels a draft bill", async () => {
      const bill = { id: "db1", tenantId, status: "DRAFT", paidAmount: 0 };
      const prisma = mockPrisma({
        dischargeBill: {
          findFirst: jest.fn().mockResolvedValue(bill),
          update: jest.fn().mockResolvedValue({ ...bill, status: "CANCELLED" }),
        },
      });
      prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
      const service = new DischargeBillingService(prisma as any);
      const result = await service.cancelBill(tenantId, "db1", "Changed mind", userId);
      expect(result).toBeDefined();
    });

    it("rejects cancelling a bill with payments", async () => {
      const bill = { id: "db1", tenantId, status: "FINALIZED", paidAmount: 5000 };
      const prisma = mockPrisma({
        dischargeBill: { findFirst: jest.fn().mockResolvedValue(bill) },
      });
      const service = new DischargeBillingService(prisma as any);
      await expect(service.cancelBill(tenantId, "db1", "reason", userId)).rejects.toThrow();
    });
  });

});
