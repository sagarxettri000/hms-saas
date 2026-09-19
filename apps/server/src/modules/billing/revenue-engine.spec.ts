import { Test } from "@nestjs/testing";
import {
  round,
  allocate,
  resolveRule,
  validateRuleShares,
  RuleValidationError,
  splitLine,
  allSplitsValid,
  RevenueSplitRule,
  LineParticipant,
} from "@hms/shared";

describe("Revenue engine (shared finance)", () => {
  const at = "2026-09-19T10:00:00Z";
  const baseRule = (over: Partial<RevenueSplitRule> = {}): RevenueSplitRule => ({
    id: "r1",
    version: 1,
    basis: "NET_EXCL_TAX",
    allowUnallocated: false,
    participants: [
      { type: "PRIMARY_DOCTOR", shareType: "PERCENTAGE", shareValue: 50 },
      { type: "TECHNICIAN", shareType: "PERCENTAGE", shareValue: 5 },
      { type: "HOSPITAL", shareType: "PERCENTAGE", shareValue: 45 },
    ],
    effectiveFrom: "2026-01-01",
    priority: 0,
    isActive: true,
    ...over,
  });

  it("rounds half-up deterministically", () => {
    expect(round(2.005)).toBe(2.01);
    expect(round(-2.005)).toBe(-2.01);
  });

  it("allocates with exact sum (largest remainder)", () => {
    const parts = allocate(10000, [50, 5, 45]);
    const sum = parts.reduce((a, v) => a + v, 0);
    expect(sum).toBe(10000);
    expect(parts[0]).toBe(5000);
    expect(parts[1]).toBe(500);
    expect(parts[2]).toBe(4500);
  });

  it("resolves the most specific tier and highest priority", () => {
    const rules = [
      baseRule({ id: "default" }),
      baseRule({ id: "specific", schemeId: "s1", serviceId: "svc", priority: 5 }),
      baseRule({ id: "specific-low", schemeId: "s1", serviceId: "svc", priority: 1 }),
    ];
    const res = resolveRule(rules, { schemeId: "s1", serviceId: "svc", at });
    expect(res.status).toBe("RESOLVED");
    if (res.status === "RESOLVED") {
      expect(res.rule.id).toBe("specific");
      expect(res.tier).toBe("SCHEME_SERVICE");
    }
  });

  it("flags CONFLICT on tier ties instead of guessing", () => {
    const rules = [
      baseRule({ id: "a", schemeId: "s1", serviceId: "svc" }),
      baseRule({ id: "b", schemeId: "s1", serviceId: "svc" }),
    ];
    const res = resolveRule(rules, { schemeId: "s1", serviceId: "svc", at });
    expect(res.status).toBe("CONFLICT");
  });

  it("returns MISSING when nothing matches or is expired", () => {
    expect(resolveRule([], { at }).status).toBe("MISSING");
    const expired = [
      baseRule({ effectiveFrom: "2020-01-01", effectiveTo: "2025-01-01" }),
    ];
    expect(resolveRule(expired, { at }).status).toBe("MISSING");
  });

  it("rejects rules whose percentage shares do not total 100", () => {
    const bad = baseRule({
      participants: [
        { type: "A", shareType: "PERCENTAGE", shareValue: 50 },
        { type: "B", shareType: "PERCENTAGE", shareValue: 30 },
      ],
    });
    expect(() => validateRuleShares(bad)).toThrow(RuleValidationError);
  });

  it("splits a line per the rule and freezes rule version on allocations", () => {
    const rules = [baseRule({ version: 7 })];
    const line = {
      lineId: "L0",
      quantity: 1,
      rate: 10000,
      discountAmount: 0,
      taxAmount: 900,
      participants: [
        { type: "PRIMARY_DOCTOR", participantId: "dr-a" },
        { type: "TECHNICIAN", participantId: "tech-x" },
        { type: "HOSPITAL", participantId: "hospital" },
      ],
    };
    const res = splitLine(line, rules, { at, schemeId: null, billingMode: "ONCO" });
    expect(res.status).toBe("OK");
    if (res.status === "OK") {
      expect(res.ruleVersion).toBe(7);
      const doctor = res.allocations.find((a) => a.participantType === "PRIMARY_DOCTOR");
      const hospital = res.allocations.find((a) => a.participantType === "HOSPITAL");
      // Basis is NET_EXCL_TAX (900 tax excluded): 10000 net → 50% = 5000.
      expect(doctor?.calculatedAmount).toBe(5000);
      expect(hospital?.calculatedAmount).toBe(4500);
      const total = res.allocations.reduce((a, v) => a + v.calculatedAmount, 0);
      expect(total).toBe(10000);
      expect(doctor?.explanation).toContain("v7");
    }
  });

  it("never shares tax: doctor share computed on net-excl-tax basis", () => {
    const rules = [baseRule()];
    const line = {
      lineId: "L0",
      quantity: 1,
      rate: 10000,
      discountAmount: 1000,
      taxAmount: 900,
      participants: [
        { type: "PRIMARY_DOCTOR", participantId: "dr-a" },
        { type: "TECHNICIAN", participantId: "tech-x" },
        { type: "HOSPITAL", participantId: "hospital" },
      ],
    };
    const res = splitLine(line, rules, { at });
    if (res.status === "OK") {
      const doctor = res.allocations.find((a) => a.participantType === "PRIMARY_DOCTOR");
      expect(doctor?.calculatedAmount).toBe(4500); // 50% of 9000, not of 9900
    } else {
      fail("expected OK split");
    }
  });

  it("blocks lines whose participants are not documented (no guessing)", () => {
    const rules = [baseRule()];
    const line = {
      lineId: "L0",
      quantity: 1,
      rate: 1000,
      discountAmount: 0,
      taxAmount: 0,
      participants: [] as LineParticipant[],
    };
    const res = splitLine(line, rules, { at });
    expect(res.status).toBe("INVALID");
  });

  it("allSplitsValid gates finalization", () => {
    expect(allSplitsValid([{ status: "NO_PARTICIPANTS", lineId: "x" }])).toBe(true);
    expect(
      allSplitsValid([
        { status: "MISSING_RULE", lineId: "x", message: "REVENUE SPLIT RULE MISSING" },
      ]),
    ).toBe(false);
  });
});

describe("BillingService.finalizeInvoice + refund reversal", () => {
  function makeService(prisma: any) {
    const { BillingService } = require("./billing.service");
    return new BillingService(
      prisma,
      { create: jest.fn().mockResolvedValue({}) } as any,
      { getBillingSettings: jest.fn().mockResolvedValue({}) } as any,
    );
  }

  function ruleRow(over: any = {}) {
    return {
      id: "rule-1",
      version: 2,
      schemeId: null,
      billingMode: null,
      encounterType: null,
      serviceId: null,
      serviceCategoryId: null,
      basis: "NET_EXCL_TAX",
      participants: [
        { type: "PRIMARY_DOCTOR", shareType: "PERCENTAGE", shareValue: 50 },
        { type: "HOSPITAL", shareType: "PERCENTAGE", shareValue: 45 },
        { type: "TECHNICIAN", shareType: "PERCENTAGE", shareValue: 5 },
      ],
      allowUnallocated: false,
      priority: 0,
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
      isActive: true,
      ...over,
    };
  }

  function invoiceRow(over: any = {}) {
    return {
      id: "inv-1",
      tenantId: "t1",
      invoiceNumber: "INV-1",
      schemeId: null,
      billingMode: null,
      finalizedAt: null,
      status: "PENDING",
      totalAmount: 10000,
      paidAmount: 10000,
      refunds: [],
      items: [
        {
          id: "item-1",
          tenantId: "t1",
          serviceName: "CT Scan",
          quantity: 1,
          rate: 10000,
          discountAmount: 0,
          taxAmount: 900,
          lineTotal: 10900,
          doctorId: "dr-a",
          serviceId: null,
          participants: [
            { type: "PRIMARY_DOCTOR", participantId: "dr-a" },
            { type: "TECHNICIAN", participantId: "tech-x" },
            { type: "HOSPITAL", participantId: "hospital" },
          ],
        },
      ],
      ...over,
    };
  }

  function makePrisma(over: any = {}) {
    const revenueAllocation = {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([
        { id: "ra-1", invoiceItemId: "item-1", participantType: "PRIMARY_DOCTOR", participantId: "dr-a", shareType: "PERCENTAGE", shareValue: 50, basis: "NET_EXCL_TAX", basisAmount: 10000, calculatedAmount: 5000, ruleId: "rule-1", ruleVersion: 2, ruleTier: "DEFAULT" },
        { id: "ra-2", invoiceItemId: "item-1", participantType: "HOSPITAL", participantId: "hospital", shareType: "PERCENTAGE", shareValue: 45, basis: "NET_EXCL_TAX", basisAmount: 10000, calculatedAmount: 4500, ruleId: "rule-1", ruleVersion: 2, ruleTier: "DEFAULT" },
      ]),
      update: jest.fn().mockResolvedValue({}),
    };
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoiceRow()),
        findUnique: jest.fn().mockResolvedValue(invoiceRow()),
        update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      },
      revenueSplitRule: {
        findMany: jest.fn().mockResolvedValue([ruleRow()]),
      },
      serviceCategory: { findMany: jest.fn().mockResolvedValue([]) },
      billingService: { findMany: jest.fn().mockResolvedValue([]) },
      revenueAllocation,
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      ...over,
    } as any;
    // Transactions execute against the same mock object.
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    return prisma;
  }

  it("finalizes: persists per-line allocations and freezes the invoice", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    const result = await service.finalizeInvoice("t1", "inv-1", "user-1");

    expect(prisma.revenueAllocation.createMany).toHaveBeenCalledTimes(1);
    const rows = prisma.revenueAllocation.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    // Frozen rule provenance on every allocation
    expect(rows[0].ruleId).toBe("rule-1");
    expect(rows[0].ruleVersion).toBe(2);
    expect(rows[0].explanation).toContain("50% of NET_EXCL_TAX");
    // Invoice frozen
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FINALIZED" }) }),
    );
    expect(result.status).toBe("FINALIZED");
  });

  it("rejects finalization when a line has no matching rule", async () => {
    // Rule exists but is scoped to another scheme — the line cannot match.
    const prisma = makePrisma({
      revenueSplitRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([ruleRow({ schemeId: "other-scheme" })]),
      },
    });
    const service = makeService(prisma);
    await expect(service.finalizeInvoice("t1", "inv-1", "user-1")).rejects.toThrow(
      /REVENUE SPLIT RULE MISSING/,
    );
  });

  it("applies an encounterType-scoped rule (OP follow-up vs initial pricing)", async () => {
    // A FOLLOWUP encounter linked to the invoice must engage the
    // ENCOUNTER_TYPE_SERVICE tier instead of the DEFAULT tier.
    const prisma = makePrisma({
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            invoiceRow({ encounterId: "enc-9", type: "OPD" }),
          ),
        update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      },
      encounter: {
        findUnique: jest.fn().mockResolvedValue({ type: "FOLLOWUP" }),
      },
      revenueSplitRule: {
        findMany: jest.fn().mockResolvedValue([
          ruleRow({
            encounterType: "FOLLOWUP",
            serviceId: "svc-1",
            participants: [
              { type: "PRIMARY_DOCTOR", shareType: "PERCENTAGE", shareValue: 60 },
              { type: "HOSPITAL", shareType: "PERCENTAGE", shareValue: 40 },
            ],
          }),
        ]),
      },
      billingService: {
        findMany: jest.fn().mockResolvedValue([{ id: "svc-1", categoryId: "cat-1" }]),
      },
    });
    // Stick the service onto the line so the ENCOUNTER_TYPE_SERVICE tier matches.
    prisma.invoice.findFirst.mockResolvedValue(
      invoiceRow({
        encounterId: "enc-9",
        type: "OPD",
        items: [
          {
            id: "item-1",
            tenantId: "t1",
            serviceName: "Consultation",
            quantity: 1,
            rate: 10000,
            discountAmount: 0,
            taxAmount: 900,
            lineTotal: 10900,
            doctorId: "dr-a",
            serviceId: "svc-1",
            participants: [
              { type: "PRIMARY_DOCTOR", participantId: "dr-a" },
              { type: "HOSPITAL", participantId: "hospital" },
            ],
          },
        ],
      }),
    );
    const service = makeService(prisma);
    await service.finalizeInvoice("t1", "inv-1", "user-1");

    const rows = prisma.revenueAllocation.createMany.mock.calls[0][0].data as any[];
    expect(rows).toHaveLength(2);
    const doctor = rows.find((r) => r.participantType === "PRIMARY_DOCTOR");
    const hospital = rows.find((r) => r.participantType === "HOSPITAL");
    // FOLLOWUP encounter engaged ENCOUNTER_TYPE_SERVICE: 60/40 on 10000 net.
    expect(doctor.ruleTier).toBe("ENCOUNTER_TYPE_SERVICE");
    expect(doctor.calculatedAmount).toBe(6000);
    expect(hospital.calculatedAmount).toBe(4000);
  });

  it("rejects finalization of an already-finalized invoice", async () => {
    const prisma = makePrisma({
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoiceRow({ finalizedAt: new Date() })),
        update: jest.fn(),
      },
    });
    const service = makeService(prisma);
    await expect(service.finalizeInvoice("t1", "inv-1", "user-1")).rejects.toThrow(
      "already finalized",
    );
  });

  it("refund approval creates reversal rows referencing the originals", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma) as any;

    const refund = {
      id: "rf-1",
      tenantId: "t1",
      invoiceId: "inv-1",
      paymentId: null,
      patientId: "pat-1",
      amount: 5000,
      status: "REQUESTED",
    };
    prisma.refund = {
      findFirst: jest.fn().mockResolvedValue(refund),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(refund),
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma.invoice.findUnique.mockResolvedValue(invoiceRow());
    prisma.payment = {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    prisma.financialTransaction = { create: jest.fn().mockResolvedValue({}) };
    prisma.financialTransaction.count = jest.fn().mockResolvedValue(0);
    prisma.financialTransaction.findFirst = jest
      .fn()
      .mockResolvedValue({ txnNumber: "FT-1" });

    await service.approveRefund("t1", "rf-1", "user-1");

    // Two reversal rows created (one per original allocation), each referencing
    // its original allocation id — never recalculated from today's rules.
    const creates = prisma.revenueAllocation.create.mock.calls.map(
      (c: any[]) => c[0].data,
    );
    expect(creates.length).toBe(2);
    expect(creates[0].reversalOfId).toBe("ra-1");
    expect(creates[1].reversalOfId).toBe("ra-2");
    expect(Number(creates[0].calculatedAmount)).toBeLessThan(0);
  });
});
