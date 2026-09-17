import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PharmacyService } from "./pharmacy.service";

interface Inv {
  id: string;
  storeId: string;
  medicineId: string | null;
  name: string;
  currentStock: number;
  salesRate: number;
  batchNumber?: string | null;
  sku?: string | null;
  expiryDate?: Date | null;
}

function makePrisma(overrides: any = {}) {
  return {
    store: { findFirst: jest.fn() },
    patient: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(overrides.tx)),
    ...overrides,
  };
}

const BASE_DTO = {
  patientId: "pat1",
  storeId: "st1",
  items: [
    { medicineId: "med1", quantity: 2, unitPrice: 100 },
  ],
};

describe("PharmacyService.sale", () => {
  const med1 = {
    id: "med1",
    tenantId: "t1",
    name: "Paracetamol",
    salesRate: 100,
  };

  function buildTx(initialStock: number) {
    let currentStock = initialStock;
    const created: any[] = [];
    const invTrans: any[] = [];
    return {
      inventoryItem: {
        findFirst: jest.fn(async ({ where }) =>
          where.medicineId === "med1"
            ? {
                id: "inv1",
                storeId: "st1",
                medicineId: "med1",
                name: "Paracetamol",
                currentStock,
                salesRate: 100,
                sku: "PCM",
                batchNumber: null,
                expiryDate: null,
              }
            : null,
        ),
        updateMany: jest.fn(async ({ where, data }) => {
          if (currentStock >= where.currentStock.gte) {
            currentStock = data.currentStock;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      inventoryTransaction: {
        create: jest.fn(async (args) => {
          invTrans.push(args.data);
          return args.data;
        }),
      },
      inventoryTransactions: invTrans,
      medicine: {
        findFirst: jest.fn(async () => med1),
      },
      invoice: {
        create: jest.fn(async ({ data }) => {
          created.push(data);
          return { ...data, id: "inv0" };
        }),
        findFirst: jest.fn(async () => null),
      },
      payment: {
        create: jest.fn(async ({ data }) => {
          created.push(data);
          return { ...data, id: "pay1" };
        }),
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async ({ where }) => ({
          id: where.id,
          paymentNumber: "PAY-1",
          amount: 200,
          method: "CASH",
        })),
      },
      financialTransaction: {
        create: jest.fn(async (a) => a.data),
        findFirst: jest.fn(async () => null),
      },
      prescription: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      auditLog: {
        create: jest.fn(async (a) => a.data),
      },
      get created() {
        return created;
      },
    };
  }

  function makeService(tx: any) {
    const prisma = makePrisma({
      tx,
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    });
    prisma.store.findFirst.mockResolvedValue({ id: "st1", name: "Main Store" });
    prisma.patient.findFirst.mockResolvedValue({
      id: "pat1",
      firstName: "John",
      lastName: "Doe",
    });
    prisma.tenantSetting = {
      findUnique: jest.fn(async () => null),
    };
    const settings = { set: jest.fn(async (_t: string, _k: string, v: unknown) => v) };
    const audit = { log: jest.fn(async () => undefined) };
    return new PharmacyService(prisma as any, settings as any, audit as any);
  }

  it("creates a paid PHARMACY invoice and deducts stock", async () => {
    const tx = buildTx(10);
    const service = makeService(tx);

    const res: any = await service.sale("t1", {
      ...BASE_DTO,
      paymentMethod: "CASH",
    } as any, "u1");

    expect(res.success).toBe(true);
    expect(res.invoice.type).toBe("PHARMACY");
    expect(res.invoice.status).toBe("PAID");
    expect(Number(res.invoice.totalAmount)).toBe(200);
    expect(Number(res.invoice.paidAmount)).toBe(200);
    expect(res.invoice.items.create).toHaveLength(1);
    expect(tx.created.some((c: any) => c.invoiceId === "inv0")).toBe(true);
  });

  it("creates a PENDING credit invoice without payment or stock deduction failure", async () => {
    const tx = buildTx(5);
    const service = makeService(tx);

    const res: any = await service.sale(
      "t1",
      { ...BASE_DTO, isCredit: true } as any,
      "u1",
    );

    expect(res.invoice.status).toBe("PENDING");
    expect(Number(res.invoice.paidAmount)).toBe(0);
    expect(Number(res.invoice.dueAmount)).toBe(200);
    expect(res.payment).toBeUndefined();
  });

  it("applies item tax without double-counting the total", async () => {
    const tx = buildTx(10);
    const service = makeService(tx);

    const res: any = await service.sale(
      "t1",
      {
        ...BASE_DTO,
        items: [{ medicineId: "med1", quantity: 1, unitPrice: 100, taxPercent: 10 }],
        paymentMethod: "CASH",
      } as any,
      "u1",
    );

    expect(Number(res.invoice.subtotal)).toBe(110);
    expect(Number(res.invoice.taxAmount)).toBe(10);
    expect(Number(res.invoice.totalAmount)).toBe(110);
    expect(Number(res.invoice.paidAmount)).toBe(110);
  });

  it("throws ConflictException when stock is insufficient and does not create invoice", async () => {
    const tx = buildTx(1);
    const service = makeService(tx);

    await expect(
      service.sale("t1", { ...BASE_DTO, items: [{ medicineId: "med1", quantity: 5, unitPrice: 100 }] } as any, "u1"),
    ).rejects.toThrow(ConflictException);

    expect(tx.created).toHaveLength(0);
    expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });

  it("throws BadRequestException for missing items", async () => {
    const tx = buildTx(10);
    const service = makeService(tx);
    await expect(service.sale("t1", { ...BASE_DTO, items: [] } as any, "u1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws NotFoundException for unknown store", async () => {
    const prisma = makePrisma({});
    prisma.store.findFirst.mockResolvedValue(null);
    prisma.tenantSetting = { findUnique: jest.fn(async () => null) };
    const service = new PharmacyService(
      prisma as any,
      { set: jest.fn() } as any,
      { log: jest.fn() } as any,
    );
    await expect(service.sale("t1", BASE_DTO as any, "u1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws NotFoundException for unknown medicine stock (no inventory item)", async () => {
    const tx = buildTx(10);
    tx.inventoryItem.findFirst.mockResolvedValue(null);
    const service = makeService(tx);
    await expect(service.sale("t1", BASE_DTO as any, "u1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("marks a prescription as DISPENSED when prescriptionId is provided", async () => {
    const tx = buildTx(10);
    const service = makeService(tx);
    await service.sale("t1", { ...BASE_DTO, prescriptionId: "rx1", paymentMethod: "CASH" } as any, "u1");
    expect(tx.prescription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "rx1", tenantId: "t1" }),
        data: { status: "DISPENSED" },
      }),
    );
  });

  it("assigns a unique barcode derived from the invoice number on every sale", async () => {
    const tx = buildTx(10);
    const service = makeService(tx);
    const res: any = await service.sale("t1", { ...BASE_DTO, paymentMethod: "CASH" } as any, "u1");
    expect(res.invoice.barcode).toBe(res.invoice.invoiceNumber);
    expect(res.invoice.barcode).toMatch(/^INV-\d{8}-\d{5}$/);
  });

  it("retries with a new number on P2002 barcode collision and still succeeds", async () => {
    const tx = buildTx(10);
    let attempts = 0;
    const realCreate = tx.invoice.create;
    tx.invoice.create = jest.fn(async (args: any) => {
      attempts++;
      if (attempts === 1) {
        const err: any = new Error("unique constraint");
        err.code = "P2002";
        throw err;
      }
      return realCreate(args);
    });
    const service = makeService(tx);
    const res: any = await service.sale("t1", { ...BASE_DTO, paymentMethod: "CASH" } as any, "u1");
    expect(attempts).toBe(2);
    expect(res.invoice.barcode).toBe(res.invoice.invoiceNumber);
  });

  it("gives up with ConflictException after repeated P2002 collisions", async () => {
    const tx = buildTx(10);
    (tx.invoice.create as any) = jest.fn(async (): Promise<any> => {
      const err: any = new Error("unique constraint");
      err.code = "P2002";
      throw err;
    });
    const service = makeService(tx);
    await expect(
      service.sale("t1", { ...BASE_DTO, paymentMethod: "CASH" } as any, "u1"),
    ).rejects.toThrow(ConflictException);
  });

  it("saves and audits Pharmacy VAT/PAN settings via the shared settings store", async () => {
    const tx = buildTx(10);
    const prisma = makePrisma({ tx, $transaction: jest.fn(async (fn: any) => fn(tx)) });
    prisma.store.findFirst.mockResolvedValue({ id: "st1", name: "Main Store" });
    prisma.patient.findFirst.mockResolvedValue({ id: "pat1", firstName: "John", lastName: "Doe" });
    prisma.tenantSetting = { findUnique: jest.fn(async () => null) };
    const settings = { set: jest.fn(async (_t: string, _k: string, v: unknown) => v) };
    const audit = { log: jest.fn(async () => undefined) };
    const service = new PharmacyService(prisma as any, settings as any, audit as any);

    const saved = await service.setBillingSettings("t1", { vatNumber: "601234567", panNumber: "123456789" }, "u1");
    expect(saved).toEqual({ vatNumber: "601234567", panNumber: "123456789" });
    expect(settings.set).toHaveBeenCalledWith("t1", "pharmacyBilling", { vatNumber: "601234567", panNumber: "123456789" }, "u1");
    expect(audit.log).toHaveBeenCalledWith(
      "t1",
      "u1",
      "TenantSetting",
      "pharmacyBilling",
      "UPDATE",
      expect.objectContaining({ scope: "PHARMACY_BILLING" }),
    );

    prisma.tenantSetting.findUnique.mockResolvedValue({
      value: { vatNumber: "601234567", panNumber: "123456789" },
    });
    await expect(service.getBillingSettings("t1")).resolves.toEqual({
      vatNumber: "601234567",
      panNumber: "123456789",
    });
  });
});
