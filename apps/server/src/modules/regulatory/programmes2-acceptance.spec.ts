/**
 * Programmes-resilience acceptance tests (spec §1–45 gaps):
 * unified programme ledger invariants (utilized ≤ approved, claimed ≤ utilized,
 * paid ≤ claimed, reversal-based corrections), operational MSS compliance
 * derivation, disaster deferred-transaction lifecycle.
 */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Programmes2Service } from "./programmes2.service";
import { RegulatoryRuleService } from "../regulatory/regulatory-rule.service";

function makePrisma(over: any = {}): any {
  return {
    governmentProgrammeLedger: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: "led-1",
        status: "ACTIVE",
        utilizedAmount: 0,
        claimedAmount: 0,
        paidAmount: 0,
        reversedAmount: 0,
        remainingAmount: data.approvedAmount,
        ...data,
      })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      ...over.governmentProgrammeLedger,
    },
    mssStandardSet: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...over.mssStandardSet,
    },
    user: { count: jest.fn().mockResolvedValue(10), ...over.user },
    bed: { count: jest.fn().mockResolvedValue(5), ...over.bed },
    inventoryItem: { count: jest.fn().mockResolvedValue(8), ...over.inventoryItem },
    bloodUnit: { count: jest.fn().mockResolvedValue(6), ...over.bloodUnit },
    wasteLedgerEntry: { groupBy: jest.fn().mockResolvedValue([]), ...over.wasteLedgerEntry },
    disasterActivation: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...over.disasterActivation,
    },
    disasterDeferredTransaction: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "dtx-1", status: "PENDING", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      updateMany: jest.fn().mockImplementation(({ where }) => ({ count: (where.id?.in ?? []).length })),
      groupBy: jest.fn().mockResolvedValue([]),
      ...over.disasterDeferredTransaction,
    },
  };
}

function makeRules(over: any = {}) {
  const rules = new RegulatoryRuleService({} as any);
  jest.spyOn(rules, "logEvent").mockResolvedValue(undefined as any);
  jest.spyOn(rules, "resolveOrNull").mockResolvedValue(null as any);
  Object.assign(rules, over);
  return rules;
}

describe("Unified government-programme ledger (§24, §36)", () => {
  const entry = (over: any = {}) => ({
    id: "led-1",
    status: "ACTIVE",
    approvedAmount: 1000,
    utilizedAmount: 0,
    claimedAmount: 0,
    paidAmount: 0,
    reversedAmount: 0,
    remainingAmount: 1000,
    ...over,
  });

  it("opens an entry with remaining = approved", async () => {
    const prisma = makePrisma();
    const svc = new Programmes2Service(prisma, makeRules());
    const res = await svc.openLedgerEntry("t1", {
      programme: "AAMA", benefitType: "DELIVERY_INCENTIVE", approvedAmount: 5000,
    });
    expect(res.remainingAmount).toBe(5000);
    expect(res.status).toBe("ACTIVE");
  });

  it("refuses a negative approved amount", async () => {
    const svc = new Programmes2Service(makePrisma(), makeRules());
    await expect(
      svc.openLedgerEntry("t1", { programme: "AAMA", benefitType: "X", approvedAmount: -1 }),
    ).rejects.toThrow(ConflictException);
  });

  it("utilization within approved reduces remaining", async () => {
    const prisma = makePrisma({ governmentProgrammeLedger: { findFirst: jest.fn().mockResolvedValue(entry()) } });
    const svc = new Programmes2Service(prisma, makeRules());
    const res = await svc.utilizeLedger("t1", "led-1", { amount: 400 });
    expect(res.utilizedAmount).toBe(400);
    expect(res.remainingAmount).toBe(600);
  });

  it("utilization beyond approved is refused (§36)", async () => {
    const prisma = makePrisma({ governmentProgrammeLedger: { findFirst: jest.fn().mockResolvedValue(entry()) } });
    const svc = new Programmes2Service(prisma, makeRules());
    await expect(svc.utilizeLedger("t1", "led-1", { amount: 1500 })).rejects.toThrow(ConflictException);
  });

  it("utilization on a settled entry is refused", async () => {
    const prisma = makePrisma({
      governmentProgrammeLedger: { findFirst: jest.fn().mockResolvedValue(entry({ status: "SETTLED" })) },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    await expect(svc.utilizeLedger("t1", "led-1", { amount: 100 })).rejects.toThrow(ConflictException);
  });

  it("claim cannot exceed utilized (§36)", async () => {
    const prisma = makePrisma({
      governmentProgrammeLedger: { findFirst: jest.fn().mockResolvedValue(entry({ utilizedAmount: 400 })) },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    await expect(svc.claimLedger("t1", "led-1", { amount: 500 })).rejects.toThrow(ConflictException);
  });

  it("payment cannot exceed claimed (§36)", async () => {
    const prisma = makePrisma({
      governmentProgrammeLedger: { findFirst: jest.fn().mockResolvedValue(entry({ claimedAmount: 300 })) },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    await expect(svc.payLedger("t1", "led-1", { amount: 400 })).rejects.toThrow(ConflictException);
  });

  it("full payment settles the entry", async () => {
    const prisma = makePrisma({
      governmentProgrammeLedger: { findFirst: jest.fn().mockResolvedValue(entry({ claimedAmount: 300 })) },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    const res = await svc.payLedger("t1", "led-1", { amount: 300 });
    expect(res.status).toBe("SETTLED");
  });

  it("reversal recomputes remaining and never goes destructive", async () => {
    const prisma = makePrisma({
      governmentProgrammeLedger: {
        findFirst: jest.fn().mockResolvedValue(entry({ utilizedAmount: 800, claimedAmount: 800 })),
      },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    const res = await svc.reverseLedger("t1", "led-1", { amount: 300, reason: "duplicate claim" });
    expect(res.reversedAmount).toBe(300);
    // remaining = approved − (utilized − reversed) = 1000 − 500
    expect(res.remainingAmount).toBe(500);
    expect(res.status).toBe("ADJUSTED");
  });

  it("reversal requires a reason", async () => {
    const svc = new Programmes2Service(makePrisma(), makeRules());
    await expect(svc.reverseLedger("t1", "led-1", { amount: 10, reason: " " })).rejects.toThrow(ConflictException);
  });
});

describe("Operational MSS compliance (§4.1)", () => {
  const setWithTags = (standards: any[]) => ({
    id: "set-1",
    setName: "MSS Primary",
    facilityLevel: "PRIMARY",
    standards,
  });

  it("derives pass/fail signals for OPERATIONAL-tagged standards only", async () => {
    const prisma = makePrisma({
      mssStandardSet: {
        findFirst: jest.fn().mockResolvedValue(
          setWithTags([
            { id: "s1", standardCode: "GOV-01", status: "ACTIVE", scoringMethod: "OPERATIONAL:staffing" },
            { id: "s2", standardCode: "SUP-07", status: "ACTIVE", scoringMethod: "OPERATIONAL:medicine_availability" },
            { id: "s3", standardCode: "MAN-01", status: "ACTIVE", scoringMethod: "MANUAL_CHECKLIST" },
          ]),
        ),
      },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    const res = await svc.deriveOperationalCompliance("t1", "PRIMARY");
    // user.count=10, bed.count=5 → ratio 2.0 ≥ 2.0 pass
    expect(res.signals.staffing.pass).toBe(true);
    expect(res.signals.staffing.value).toBe(2);
    // inventoryItem.count=8 in stock of 8 total → 100% ≥ 80% pass
    expect(res.signals.medicine_availability.pass).toBe(true);
    const derived = res.derived as any[];
    expect(derived).toHaveLength(2); // manual standard not derived
    expect(derived.every((d) => d.available)).toBe(true);
  });

  it("marks a failing signal when the threshold is not met", async () => {
    const prisma = makePrisma({
      bloodUnit: { count: jest.fn().mockResolvedValue(1) },
      mssStandardSet: {
        findFirst: jest.fn().mockResolvedValue(
          setWithTags([{ id: "s9", standardCode: "CLI-12", status: "ACTIVE", scoringMethod: "OPERATIONAL:blood_availability" }]),
        ),
      },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    const res = await svc.deriveOperationalCompliance("t1", "PRIMARY");
    expect(res.signals.blood_availability.pass).toBe(false);
    expect((res.derived as any[])[0].pass).toBe(false);
  });

  it("thresholds come from the effective-dated rule when present (§2.1)", async () => {
    const prisma = makePrisma({
      mssStandardSet: {
        findFirst: jest.fn().mockResolvedValue(setWithTags([{ id: "s1", standardCode: "GOV-01", status: "ACTIVE", scoringMethod: "OPERATIONAL:staffing" }])),
      },
    });
    const rules = makeRules();
    jest.spyOn(rules, "resolveOrNull").mockResolvedValue({ config: { staffingRatioThreshold: 3.0 } } as any);
    const svc = new Programmes2Service(prisma, rules);
    const res = await svc.deriveOperationalCompliance("t1", "PRIMARY");
    expect(res.signals.staffing.pass).toBe(false); // 2.0 < 3.0 under the rule
  });

  it("refuses to derive without an active MSS set", async () => {
    const svc = new Programmes2Service(makePrisma(), makeRules());
    await expect(svc.deriveOperationalCompliance("t1", "PRIMARY")).rejects.toThrow(NotFoundException);
  });
});

describe("Disaster deferred transactions (§12, §37)", () => {
  const activation = (over: any = {}) => ({ id: "act-1", isActive: true, ...over });

  it("captures a service during an active disaster without billing", async () => {
    const prisma = makePrisma({ disasterActivation: { findFirst: jest.fn().mockResolvedValue(activation()) } });
    const svc = new Programmes2Service(prisma, makeRules());
    const res = await svc.recordDeferredService("t1", {
      activationId: "act-1", tempPatientId: "MC-001", serviceCode: "SUTURING", quantity: 1,
    });
    expect(res.status).toBe("PENDING");
  });

  it("refuses capture on a stood-down incident", async () => {
    const prisma = makePrisma({
      disasterActivation: { findFirst: jest.fn().mockResolvedValue(activation({ isActive: false })) },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    await expect(
      svc.recordDeferredService("t1", { activationId: "act-1", tempPatientId: "MC-001", serviceCode: "X" }),
    ).rejects.toThrow(ConflictException);
  });

  it("requires some patient reference", async () => {
    const prisma = makePrisma({ disasterActivation: { findFirst: jest.fn().mockResolvedValue(activation()) } });
    const svc = new Programmes2Service(prisma, makeRules());
    await expect(
      svc.recordDeferredService("t1", { activationId: "act-1", serviceCode: "X" }),
    ).rejects.toThrow(ConflictException);
  });

  it("reconciles pending rows into an encounter (idempotent)", async () => {
    const rows = [{ id: "d1", status: "PENDING" }, { id: "d2", status: "PENDING" }];
    const prisma = makePrisma({
      disasterDeferredTransaction: {
        findMany: jest.fn().mockResolvedValue(rows),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    const res = await svc.reconcileDeferred("t1", {
      transactionIds: ["d1", "d2"], encounterId: "enc-1", invoiceId: "inv-1",
    });
    expect(res.reconciled).toBe(2);
  });

  it("refuses re-reconciliation of non-pending rows", async () => {
    const prisma = makePrisma({
      disasterDeferredTransaction: { findMany: jest.fn().mockResolvedValue([{ id: "d1", status: "RECONCILED" }]) },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    await expect(
      svc.reconcileDeferred("t1", { transactionIds: ["d1"], encounterId: "enc-1" }),
    ).rejects.toThrow(ConflictException);
  });

  it("write-off requires an authorized reason and touches only pending rows", async () => {
    const prisma = makePrisma({
      disasterDeferredTransaction: { findFirst: jest.fn().mockResolvedValue({ id: "d1", status: "PENDING" }) },
    });
    const svc = new Programmes2Service(prisma, makeRules());
    await expect(svc.writeOffDeferred("t1", "d1", { reason: "unidentified casualty, unrecoverable" })).resolves.toMatchObject({
      status: "WRITTEN_OFF",
    });
    await expect(svc.writeOffDeferred("t1", "d1", { reason: "" })).rejects.toThrow(ConflictException);
  });
});
