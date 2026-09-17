import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { BillingService } from "./billing.service";

function makeService(prisma: any): BillingService {
  return new BillingService(prisma, { create: jest.fn().mockResolvedValue({}) } as any, {
    getBillingSettings: jest.fn().mockResolvedValue({}),
  } as any);
}

describe("BillingService", () => {
  describe("validateMoney", () => {
    const prisma = {} as any;
    const service = makeService(prisma);

    it("rejects NaN", () => {
      expect(() =>
        (service as any).validateMoney(NaN, { label: "Amount" }),
      ).toThrow(BadRequestException);
    });

    it("rejects non-numeric strings", () => {
      expect(() =>
        (service as any).validateMoney("abc", { label: "Amount" }),
      ).toThrow(BadRequestException);
    });

    it("rejects negative values when min is 0", () => {
      expect(() =>
        (service as any).validateMoney(-1, { min: 0, label: "Amount" }),
      ).toThrow(BadRequestException);
    });

    it("accepts valid values", () => {
      expect(
        (service as any).validateMoney(100, { min: 0, label: "Amount" }),
      ).toBe(100);
      expect(
        (service as any).validateMoney(0, { min: 0, label: "Amount" }),
      ).toBe(0);
    });

    it("rejects values above max", () => {
      expect(() =>
        (service as any).validateMoney(101, { max: 100, label: "Amount" }),
      ).toThrow(BadRequestException);
    });
  });

  describe("createPayment", () => {
    const prisma = {
      payment: {
        findUnique: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "pay1" })),
      },
      invoice: {
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => data),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(prisma)),
      generateNumber: undefined,
    };
    const service = makeService(prisma);
    jest.spyOn(service as any, "generateNumber").mockResolvedValue("PAY-0001");
    jest
      .spyOn(service as any, "recordFinancialTransaction")
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, "addCreditBalance").mockResolvedValue(undefined);

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.payment.findUnique.mockResolvedValue(null);
    });

    it("rejects NaN amount", async () => {
      await expect(
        service.createPayment("t1", { invoiceId: "i1", amount: NaN } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects overpayment beyond due amount", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "i1",
        tenantId: "t1",
        status: "PARTIAL",
        patientId: "p1",
        totalAmount: 100,
        paidAmount: 40,
        dueAmount: 60,
        isCredit: false,
      });
      await expect(
        service.createPayment("t1", { invoiceId: "i1", amount: 61 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("trusts invoice patientId over client-supplied patientId", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "i1",
        tenantId: "t1",
        status: "PARTIAL",
        patientId: "REAL_PATIENT",
        totalAmount: 100,
        paidAmount: 40,
        dueAmount: 60,
        isCredit: false,
      });
      const payment = await service.createPayment(
        "t1",
        { invoiceId: "i1", amount: 50, patientId: "EVIL_PATIENT" },
        "u1",
      );
      expect(payment.patientId).toBe("REAL_PATIENT");
    });

    it("returns the existing payment for a duplicate idempotency key", async () => {
      const existing = { id: "pay-existing", amount: 50 };
      prisma.payment.findUnique.mockResolvedValue(existing);
      const result = await service.createPayment(
        "t1",
        { invoiceId: "i1", amount: 50, idempotencyKey: "dup" },
        "u1",
      );
      expect(result).toBe(existing);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it("refuses payments on cancelled invoices", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "i1",
        tenantId: "t1",
        status: "CANCELLED",
        patientId: "p1",
        totalAmount: 100,
        paidAmount: 0,
        dueAmount: 100,
        isCredit: false,
      });
      await expect(
        service.createPayment("t1", { invoiceId: "i1", amount: 50 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("createRefund", () => {
    const prisma = {
      patient: {
        findFirst: jest.fn().mockResolvedValue({ id: "p1", tenantId: "t1" }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pay1",
          tenantId: "t1",
          patientId: "p1",
          amount: 100,
          refunds: [],
        }),
      },
      invoice: { findFirst: jest.fn() },
      refund: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "ref1" })),
      },
      findMany: undefined,
      $transaction: undefined,
    };
    const service = makeService(prisma);
    jest.spyOn(service as any, "generateNumber").mockResolvedValue("REF-0001");
    jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(service as any, "getRefundableAmount").mockResolvedValue(100);
      prisma.patient.findFirst.mockResolvedValue({ id: "p1", tenantId: "t1" });
    });

    it("rejects NaN amount", async () => {
      await expect(
        service.createRefund("t1", {
          patientId: "p1",
          amount: NaN,
          reason: "x",
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects refund exceeding refundable amount", async () => {
      jest.spyOn(service as any, "getRefundableAmount").mockResolvedValue(50);
      await expect(
        service.createRefund("t1", {
          patientId: "p1",
          paymentId: "pay1",
          amount: 51,
          reason: "x",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a refund for a valid amount", async () => {
      const refund = await service.createRefund(
        "t1",
        { patientId: "p1", paymentId: "pay1", amount: 40, reason: "overpaid" },
        "u1",
      );
      expect(refund.patientId).toBe("p1");
      expect(refund.amount).toBe(40);
    });
  });

  describe("getRefundableAmount", () => {
    it("caps at payment amount minus completed refunds", async () => {
      const prisma = {
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: "pay1",
            tenantId: "t1",
            amount: 100,
            refunds: [
              { status: "COMPLETED", amount: 30 },
              { status: "REQUESTED", amount: 999 },
            ],
          }),
        },
      };
      const service = makeService(prisma);
      expect(
        await (service as any).getRefundableAmount("t1", "pay1", null),
      ).toBe(70);
    });

    it("caps at invoice paidAmount minus completed refunds", async () => {
      const prisma = {
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv1",
            tenantId: "t1",
            paidAmount: 80,
            refunds: [{ status: "COMPLETED", amount: 20 }],
          }),
        },
      };
      const service = makeService(prisma);
      expect(
        await (service as any).getRefundableAmount("t1", null, "inv1"),
      ).toBe(60);
    });

    it("returns 0 when no payment or invoice", async () => {
      const service = makeService({});
      expect(await (service as any).getRefundableAmount("t1", null, null)).toBe(
        0,
      );
    });
  });

  describe("billing schemes", () => {
    const scheme = {
      id: "s1",
      tenantId: "t1",
      name: "Staff",
      code: "STAFF",
      discountPercent: 10,
      isActive: true,
    };
    const prisma = {
      billingScheme: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([scheme]),
        count: jest.fn().mockResolvedValue(1),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "s2" })),
        update: jest.fn().mockImplementation(({ data }) => data),
        delete: jest.fn().mockResolvedValue({ id: "s1" }),
      },
    };
    const service = makeService(prisma);
    jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

    beforeEach(() => jest.clearAllMocks());

    it("creates a scheme with a valid name", async () => {
      const created = await service.createBillingScheme("t1", {
        name: "General",
        discountPercent: 15,
      });
      expect(created.name).toBe("General");
      expect(created.discountPercent).toBe(15);
      expect(created.isActive).toBe(true);
    });

    it("rejects missing scheme name", async () => {
      await expect(
        service.createBillingScheme("t1", { name: "" } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects duplicate scheme name", async () => {
      prisma.billingScheme.findFirst.mockResolvedValue(scheme);
      await expect(
        service.createBillingScheme("t1", { name: "Staff" }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects discount percent outside 0-100", async () => {
      prisma.billingScheme.findFirst.mockResolvedValue(null);
      await expect(
        service.createBillingScheme("t1", { name: "X", discountPercent: 101 }),
      ).rejects.toThrow(BadRequestException);
      prisma.billingScheme.findFirst.mockResolvedValue(null);
      await expect(
        service.createBillingScheme("t1", { name: "X", discountPercent: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("updates an existing scheme", async () => {
      prisma.billingScheme.findFirst.mockResolvedValue(scheme);
      const updated = await service.updateBillingScheme("t1", "s1", {
        discountPercent: 20,
      });
      expect(updated.discountPercent).toBe(20);
    });

    it("throws when updating a missing scheme", async () => {
      prisma.billingScheme.findFirst.mockResolvedValue(null);
      await expect(
        service.updateBillingScheme("t1", "s1", { name: "X" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("removes a scheme", async () => {
      prisma.billingScheme.findFirst.mockResolvedValue(scheme);
      await expect(service.removeBillingScheme("t1", "s1")).resolves.toEqual({
        success: true,
      });
    });
  });

  describe("createInvoice scheme pricing", () => {
    it("applies scheme discount to the total", async () => {
      const prisma = {
        patient: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: "p1", tenantId: "t1" }),
        },
        billingService: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        billingScheme: {
          findFirst: jest.fn().mockResolvedValue({
            id: "s1",
            tenantId: "t1",
            name: "Staff",
            discountPercent: 10,
            isActive: true,
          }),
        },
        invoice: { create: jest.fn() },
        user: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn().mockImplementation(async (fn) => {
          const tx = {
            invoice: {
              create: jest.fn().mockImplementation(({ data }) => ({
                ...data,
                id: "inv1",
              })),
            },
            invoiceItem: { create: jest.fn() },
          };
          return fn(tx);
        }),
      };
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "generateInvoiceNumber").mockResolvedValue(
        "INV-0001",
      );
      jest.spyOn(service as any, "addCreditBalance").mockResolvedValue(undefined);
      jest.spyOn(service as any, "recordFinancialTransaction").mockResolvedValue(
        undefined,
      );
      jest.spyOn(service as any, "getBillingSettings").mockResolvedValue({
        taxConfig: { defaultTaxPercent: 0 },
        rounding: { enabled: false },
      });
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

      const invoice = await service.createInvoice(
        "t1",
        {
          patientId: "p1",
          type: "OPD",
          schemeId: "s1",
          items: [{ serviceName: "Consultation", quantity: 1, rate: 500 }],
        },
        "u1",
      );
      expect(invoice.subtotal).toBe(500);
      expect(invoice.discountAmount).toBe(50);
      expect(invoice.totalAmount).toBe(450);
      expect(invoice.schemeId).toBe("s1");
      expect(invoice.discountPercent).toBe(10);
      expect(invoice.discountReason).toContain("Staff");
    });
  });

  describe("refundDeposit", () => {
    const prisma = {
      deposit: {
        findFirst: jest.fn().mockResolvedValue({
          id: "d1",
          tenantId: "t1",
          patientId: "p1",
          depositNumber: "DEP-0001",
          balance: 100,
        }),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => {
        const tx = {
          deposit: { update: jest.fn().mockResolvedValue(undefined) },
          depositTransaction: { create: jest.fn().mockResolvedValue(undefined) },
          refund: {
            create: jest
              .fn()
              .mockImplementation(({ data }) => ({ ...data, id: "r1" })),
          },
        };
        return fn(tx);
      }),
    };
    const service = makeService(prisma as any);
    jest.spyOn(service as any, "generateNumber").mockResolvedValue("REF-0001");
    jest.spyOn(service as any, "recordFinancialTransaction").mockResolvedValue(
      undefined,
    );

    beforeEach(() => jest.clearAllMocks());

    it("rejects refunds exceeding the deposit balance", async () => {
      await expect(
        service.refundDeposit("t1", "d1", {
          amount: 101,
          reason: "over",
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a missing refund reason", async () => {
      await expect(
        service.refundDeposit("t1", "d1", { amount: 10, reason: "" } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("refunds a partial deposit", async () => {
      const result = await service.refundDeposit(
        "t1",
        "d1",
        { amount: 40, reason: "patient request" },
        "u1",
      );
      expect(result.refund.amount).toBe(40);
      expect(result.refund.status).toBe("COMPLETED");
      expect(result.depositBalance).toBe(60);
    });

    it("throws when the deposit is not found", async () => {
      prisma.deposit.findFirst.mockResolvedValue(null);
      await expect(
        service.refundDeposit("t1", "d1", { amount: 10, reason: "x" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("reprintInvoice", () => {
    it("increments the print counter", async () => {
      const prisma = {
        invoice: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: "i1", invoiceNumber: "INV-1" }),
          update: jest
            .fn()
            .mockResolvedValue({ id: "i1", printCount: 3 }),
        },
      };
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

      const result = await service.reprintInvoice("t1", "i1", "u1");
      expect(result.printCount).toBe(3);
      expect(result.invoiceNumber).toBe("INV-1");
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: "i1" },
        data: { printCount: { increment: 1 } },
      });
    });

    it("throws when the invoice is not found", async () => {
      const prisma = {
        invoice: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      };
      const service = makeService(prisma as any);
      await expect(service.reprintInvoice("t1", "i1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("applyDiscount (approval workflow)", () => {
    const baseInvoice = {
      id: "i1",
      tenantId: "t1",
      subtotal: 1000,
      totalAmount: 1000,
      dueAmount: 1000,
      paidAmount: 0,
      discountStatus: null,
      discountAmount: 0,
    };

    function makePrisma() {
      return {
        invoice: {
          findFirst: jest.fn().mockResolvedValue({ ...baseInvoice }),
          update: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...baseInvoice, ...data })),
        },
      };
    }

    it("auto-approves discounts at or below the threshold", async () => {
      const prisma = makePrisma();
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "getBillingSettings").mockResolvedValue({
        discountApproval: { requireApprovalAbove: 500 },
      });
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

      const result = await service.applyDiscount("t1", "i1", { amount: 100, reason: "loyalty" }, "u1");
      expect(result.discountStatus).toBe("APPROVED");
      expect(result.totalAmount).toBe(900);
    });

    it("flags discounts above the threshold as PENDING_APPROVAL without touching totals", async () => {
      const prisma = makePrisma();
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "getBillingSettings").mockResolvedValue({
        discountApproval: { requireApprovalAbove: 100 },
      });
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

      const result = await service.applyDiscount("t1", "i1", { amount: 300, reason: "big" }, "u1");
      expect(result.discountStatus).toBe("PENDING_APPROVAL");
      expect(result.discountAmount).toBe(300);
      expect((result as any).message).toContain("requires approval");
    });

    it("cannot discount an invoice that already has payments", async () => {
      const prisma = makePrisma();
      prisma.invoice.findFirst.mockResolvedValue({
        ...baseInvoice,
        paidAmount: 200,
      });
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "getBillingSettings").mockResolvedValue({
        discountApproval: { requireApprovalAbove: 0 },
      });

      await expect(
        service.applyDiscount("t1", "i1", { amount: 100 }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects zero/negative discount amounts", async () => {
      const prisma = makePrisma();
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "getBillingSettings").mockResolvedValue({
        discountApproval: { requireApprovalAbove: 0 },
      });
      await expect(
        service.applyDiscount("t1", "i1", { amount: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("approves a pending discount and applies totals", async () => {
      const prisma = makePrisma();
      prisma.invoice.findFirst.mockResolvedValue({
        ...baseInvoice,
        discountAmount: 300,
        discountStatus: "PENDING_APPROVAL",
      });
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

      const result = await service.approveDiscount("t1", "i1", { approve: true }, "approver");
      expect(result.discountStatus).toBe("APPROVED");
      expect(result.totalAmount).toBe(700);
      expect(result.dueAmount).toBe(700);
    });

    it("rejects an already-approved discount", async () => {
      const prisma = makePrisma();
      prisma.invoice.findFirst.mockResolvedValue({
        ...baseInvoice,
        discountStatus: "APPROVED",
      });
      const service = makeService(prisma as any);
      await expect(
        service.approveDiscount("t1", "i1", { approve: true }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects a pending discount request", async () => {
      const prisma = makePrisma();
      prisma.invoice.findFirst.mockResolvedValue({
        ...baseInvoice,
        discountAmount: 300,
        discountStatus: "PENDING_APPROVAL",
      });
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

      const result = await service.approveDiscount("t1", "i1", { approve: false, reason: "not allowed" }, "approver");
      expect(result.discountStatus).toBe("REJECTED");
      expect(result.discountRejectReason).toBe("not allowed");
    });
  });

  describe("applyDepositToInvoice (atomic balance guard)", () => {
    const deposit = {
      id: "d1",
      tenantId: "t1",
      patientId: "p1",
      balance: 100,
      method: "CASH",
    };
    const invoice = {
      id: "i1",
      tenantId: "t1",
      patientId: "p1",
      invoiceNumber: "INV-1",
      totalAmount: 500,
      paidAmount: 0,
      dueAmount: 500,
      status: "PENDING",
      isCredit: false,
    };

    function makePrisma() {
      const tx = {
        deposit: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn(),
        },
        depositTransaction: { create: jest.fn().mockResolvedValue({}) },
        payment: {
          create: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...data, id: "pay1" })),
        },
        invoice: { update: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        deposit: { findFirst: jest.fn().mockResolvedValue({ ...deposit }) },
        invoice: { findFirst: jest.fn().mockResolvedValue({ ...invoice }) },
        $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      };
      return { prisma, tx };
    }

    it("applies a deposit and settles the invoice", async () => {
      const { prisma, tx } = makePrisma();
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "generateNumber").mockResolvedValue("PAY-0001");
      jest.spyOn(service as any, "recordFinancialTransaction").mockResolvedValue(undefined);

      const payment = await service.applyDepositToInvoice("t1", "d1", "i1", 100, "u1");
      expect(payment.paymentType).toBe("DEPOSIT");
      expect(payment.amount).toBe(100);
      expect(tx.deposit.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "d1", balance: { gte: 100 } }),
        }),
      );
    });

    it("fails atomically when the balance was consumed concurrently", async () => {
      const { prisma, tx } = makePrisma();
      tx.deposit.updateMany.mockResolvedValue({ count: 0 });
      const service = makeService(prisma as any);
      jest.spyOn(service as any, "generateNumber").mockResolvedValue("PAY-0001");

      await expect(
        service.applyDepositToInvoice("t1", "d1", "i1", 100, "u1"),
      ).rejects.toThrow(ConflictException);
      expect(tx.payment.create).not.toHaveBeenCalled();
    });

    it("rejects applying a deposit to another patient's invoice", async () => {
      const { prisma } = makePrisma();
      prisma.invoice.findFirst.mockResolvedValue({
        ...invoice,
        patientId: "p2",
      });
      const service = makeService(prisma as any);
      await expect(
        service.applyDepositToInvoice("t1", "d1", "i1", 50),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects amounts exceeding the invoice due amount", async () => {
      const { prisma } = makePrisma();
      prisma.invoice.findFirst.mockResolvedValue({
        ...invoice,
        dueAmount: 50,
      });
      const service = makeService(prisma as any);
      await expect(
        service.applyDepositToInvoice("t1", "d1", "i1", 100),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("closeDay (reconciliation guard)", () => {
    function makePrisma(hasClosing: boolean) {
      const prisma = {
        invoice: {
          findMany: jest.fn().mockResolvedValue([
            { totalAmount: 1000, status: "PAID" },
          ]),
        },
        payment: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ amount: 400, method: "CASH" }]),
        },
        refund: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ amount: 50, refundMethod: "CASH" }]),
        },
        deposit: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ amount: 200, method: "CASH" }]),
        },
        dailyClosing: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              hasClosing ? { id: "c1", status: "CLOSED" } : null,
            ),
          upsert: jest
            .fn()
            .mockImplementation(({ create, update }) => ({ ...create, ...update, id: "c1" })),
        },
      };
      return prisma;
    }

    it("closes a day for the first time", async () => {
      const prisma = makePrisma(false);
      const service = makeService(prisma as any);
      (service as any).normalizeDate = jest.fn((d: string) => new Date(d || "2026-08-15"));
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

      const result = await service.closeDay("t1", { actualCash: 550 }, "u1");
      expect(result.expectedCash).toBe(550); // 400 cash + 200 deposits - 50 refunds
      expect(result.difference).toBe(0);
      expect(result.isReconciliation).toBe(false);
    });

    it("rejects re-closing without reconcile flag", async () => {
      const prisma = makePrisma(true);
      const service = makeService(prisma as any);
      (service as any).normalizeDate = jest.fn((d: string) => new Date(d || "2026-08-15"));

      await expect(
        service.closeDay("t1", { actualCash: 600 }, "u1"),
      ).rejects.toThrow(ConflictException);
    });

    it("allows reconciliation with the reconcile flag", async () => {
      const prisma = makePrisma(true);
      const service = makeService(prisma as any);
      (service as any).normalizeDate = jest.fn((d: string) => new Date(d || "2026-08-15"));
      jest.spyOn(service as any, "logAudit").mockResolvedValue(undefined);

      const result = await service.closeDay("t1", { actualCash: 600, reconcile: true }, "u1");
      expect(result.isReconciliation).toBe(true);
      expect(result.difference).toBe(50);
    });

    it("requires actual cash for reconciliation", async () => {
      const prisma = makePrisma(true);
      const service = makeService(prisma as any);
      (service as any).normalizeDate = jest.fn((d: string) => new Date(d || "2026-08-15"));

      await expect(
        service.closeDay("t1", { reconcile: true }, "u1"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("taxRegistrationBlock (Pharmacy VAT/PAN isolation)", () => {
    const hospital = { panNumber: "HOSP-PAN", vatNumber: "HOSP-VAT" };

    it("gives non-pharmacy documents only hospital values, never Pharmacy ones", async () => {
      const prisma = {} as any;
      const pharmacy = {
        getBillingSettings: jest.fn().mockResolvedValue({ panNumber: "PH-PAN", vatNumber: "PH-VAT" }),
      };
      const service = new BillingService(prisma, { create: jest.fn() } as any, pharmacy as any);
      const block = await (service as any).taxRegistrationBlock("t1", "OPD", hospital);
      expect(block).toEqual({ panNumber: "HOSP-PAN", vatNumber: "HOSP-VAT" });
      expect(pharmacy.getBillingSettings).not.toHaveBeenCalled();
    });

    it("uses Pharmacy-scoped values for pharmacy documents", async () => {
      const prisma = {} as any;
      const pharmacy = {
        getBillingSettings: jest.fn().mockResolvedValue({ panNumber: "PH-PAN", vatNumber: "PH-VAT" }),
      };
      const service = new BillingService(prisma, { create: jest.fn() } as any, pharmacy as any);
      const block = await (service as any).taxRegistrationBlock("t1", "PHARMACY", hospital);
      expect(block).toEqual({ panNumber: "PH-PAN", vatNumber: "PH-VAT" });
    });

    it("falls back to hospital values when Pharmacy numbers are unset", async () => {
      const prisma = {} as any;
      const pharmacy = { getBillingSettings: jest.fn().mockResolvedValue({}) };
      const service = new BillingService(prisma, { create: jest.fn() } as any, pharmacy as any);
      const block = await (service as any).taxRegistrationBlock("t1", "PHARMACY", hospital);
      expect(block).toEqual({ panNumber: "HOSP-PAN", vatNumber: "HOSP-VAT" });
    });
  });
});


