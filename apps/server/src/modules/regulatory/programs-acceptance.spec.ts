/**
 * Programs block acceptance tests — specs §66–§72 / §75:
 * MSS evidence-gated compliance + CAPA, government medicine segregation,
 * Aama eligibility≠payment lifecycle, Sifaris verification gating,
 * disaster rapid intake/triage, offline idempotent sync + conflict policy,
 * bilingual structured prescription preservation.
 */
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { MssService } from "./mss.service";
import { ProgramsService } from "./programs.service";
import { DisasterOfflineService } from "./disaster-offline.service";
import { BilingualService } from "./bilingual.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

function makePrisma(over: any = {}) {
  return {
    mssStandardSet: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "set-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      ...over.mssStandardSet,
    },
    mssStandard: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      ...over.mssStandard,
    },
    mssAssessment: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "asm-1", assessmentDate: new Date(), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      ...over.mssAssessment,
    },
    mssEvidence: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "ev-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      ...over.mssEvidence,
    },
    correctiveAction: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "capa-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      ...over.correctiveAction,
    },
    inventoryItem: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "item-1", currentStock: data.quantity ?? 0, fundingSource: data.fundingSource ?? "PRIVATE_RETAIL", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      ...over.inventoryItem,
    },
    govProgramBatchMeta: {
      upsert: jest.fn().mockImplementation(({ create }) => ({ id: "meta-1", ...create })),
      ...over.govProgramBatchMeta,
    },
    govProgramUtilization: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "util-1", ...data })),
      ...over.govProgramUtilization,
    },
    aamaIncentiveCase: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "aama-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      ...over.aamaIncentiveCase,
    },
    sifarisDocument: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "sif-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      ...over.sifarisDocument,
    },
    disasterActivation: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "act-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      ...over.disasterActivation,
    },
    disasterCasualty: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "cas-1", status: "AWAITING_ASSESSMENT", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      ...over.disasterCasualty,
    },
    offlineSyncItem: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "sync-1", attemptCount: 0, ...data })),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, attemptCount: data.attemptCount?.increment ?? 1, ...data })),
      ...over.offlineSyncItem,
    },
    translationTerm: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "term-1", version: 1, ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      ...over.translationTerm,
    },
    regulatoryEvent: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    regulatoryException: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((ops) => Promise.all(ops)),
    ...over.root,
  };
}

function makeRuleService(prisma: any, ruleConfig: any = {}) {
  const rulePrisma = makePrisma({ root: {} });
  const svc = new RegulatoryRuleService(rulePrisma);
  jest.spyOn(svc, "resolve").mockImplementation(async (_t: string, ruleKey: string) => ({
    ruleId: `rule-${ruleKey}`,
    ruleKey,
    version: 7,
    config: ruleConfig[ruleKey] ?? {},
    effectiveFrom: new Date(),
    authority: "MoHP",
    legalReference: "test-ref",
  }));
  jest.spyOn(svc, "logEvent").mockResolvedValue(undefined as any);
  jest.spyOn(svc, "logException").mockResolvedValue(undefined as any);
  void prisma;
  return svc;
}

const TENANT = "t1";

// ================= §66 MSS =================

describe("MSS compliance engine (§66)", () => {
  function setup() {
    const prisma = makePrisma();
    const rules = makeRuleService(prisma);
    return { svc: new MssService(prisma, rules), prisma };
  }

  it("§66.1 publishes a set with declared count as metadata and loads standards", async () => {
    const { svc, prisma } = setup();
    const set = await svc.publishStandardSet(TENANT, {
      setName: "MoHP Secondary MSS 2026",
      facilityLevel: "SECONDARY",
      declaredCount: 1063,
      standards: [
        { standardCode: "S-001", standardName: "Emergency tray", domain: "Clinical" },
        { standardCode: "S-002", standardName: "Governance board", domain: "Governance" },
      ],
    });
    expect(set.declaredCount).toBe(1063);
    expect(prisma.mssStandard.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ standardCode: "S-001", domain: "Clinical" })]) }),
    );
  });

  it("§66.2 blocks self-declared COMPLIANT without verified evidence", async () => {
    const { svc } = setup();
    (svc as any).prisma.mssStandard.findFirst.mockResolvedValue({
      id: "st-1", standardCode: "S-001", isMandatory: true, evidenceRequired: true, weight: 1, domain: "Clinical",
    });
    (svc as any).prisma.mssEvidence.findMany.mockResolvedValue([]);
    await expect(
      svc.assessStandard(TENANT, "st-1", { proposedStatus: "COMPLIANT" }),
    ).rejects.toThrow(ConflictException);
  });

  it("§66.2 COMPLIANT succeeds with verified, unexpired evidence and snapshots it", async () => {
    const { svc } = setup();
    (svc as any).prisma.mssStandard.findFirst.mockResolvedValue({
      id: "st-1", standardCode: "S-001", isMandatory: true, evidenceRequired: true, weight: 1, domain: "Clinical",
    });
    (svc as any).prisma.mssEvidence.findMany.mockResolvedValue([
      { id: "ev-1", title: "License 2026", docType: "LICENSE", documentVersion: "v2", validTo: new Date(Date.now() + 86400000), status: "VERIFIED" },
    ]);
    const asm = await svc.assessStandard(TENANT, "st-1", { proposedStatus: "COMPLIANT" });
    expect(asm.status).toBe("COMPLIANT");
    expect((asm as any).evidenceSnapshot[0].id).toBe("ev-1");
  });

  it("§66.4 NON_COMPLIANT auto-creates a corrective action, HIGH for mandatory", async () => {
    const { svc, prisma } = setup();
    (svc as any).prisma.mssStandard.findFirst.mockResolvedValue({
      id: "st-1", standardCode: "S-009", isMandatory: true, evidenceRequired: false, weight: 2, domain: "Support",
    });
    const asm = await svc.assessStandard(TENANT, "st-1", { proposedStatus: "NON_COMPLIANT" });
    expect(prisma.correctiveAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assessmentId: asm.id, priority: "HIGH", status: "OPEN" }) }),
    );
  });

  it("§66.2 expired evidence cannot satisfy the gate", async () => {
    const { svc } = setup();
    (svc as any).prisma.mssStandard.findFirst.mockResolvedValue({
      id: "st-1", standardCode: "S-001", isMandatory: true, evidenceRequired: true, weight: 1, domain: "Clinical",
    });
    (svc as any).prisma.mssEvidence.findMany.mockResolvedValue([
      { id: "ev-old", title: "Old license", docType: "LICENSE", validTo: new Date(Date.now() - 86400000), status: "VERIFIED" },
    ]);
    await expect(
      svc.assessStandard(TENANT, "st-1", { proposedStatus: "COMPLIANT" }),
    ).rejects.toThrow(ConflictException);
  });
});

// ================= §67 Government medicine =================

describe("Government medicine segregation (§67)", () => {
  function setup(ruleConfig: any = {}) {
    const prisma = makePrisma();
    const rules = makeRuleService(prisma, ruleConfig);
    return { svc: new ProgramsService(prisma, rules), prisma, rules };
  }

  it("§67.3 dispenses from government stock, records utilization, blocks charging", async () => {
    const { svc, prisma } = setup();
    (svc as any).prisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-1", fundingSource: "GOVERNMENT_FREE_PROGRAM", programName: "Free Essential Drugs",
      currentStock: 50, batchNumber: "GOV-B1", expiryDate: null, govBatchMeta: { programName: "Free Essential Drugs" },
    });
    const res = await svc.dispenseGov(TENANT, { itemId: "item-1", patientId: "p1", quantity: 5 });
    expect(res.chargePatient).toBe(false);
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStock: { decrement: 5 } } }),
    );
    expect(prisma.govProgramUtilization.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 5, batchNumber: "GOV-B1", programName: "Free Essential Drugs" }) }),
    );
  });

  it("§67.2/§75 refuses the government path for private stock", async () => {
    const { svc } = setup();
    (svc as any).prisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-2", fundingSource: "PRIVATE_RETAIL", currentStock: 10, expiryDate: null,
    });
    await expect(svc.dispenseGov(TENANT, { itemId: "item-2", quantity: 1 })).rejects.toThrow(ConflictException);
  });

  it("§75 expired government stock cannot be dispensed and logs an exception", async () => {
    const { svc, rules } = setup();
    (svc as any).prisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-3", fundingSource: "GOVERNMENT_FREE_PROGRAM", currentStock: 10,
      expiryDate: new Date(Date.now() - 86400000), batchNumber: "GOV-EXP",
    });
    await expect(svc.dispenseGov(TENANT, { itemId: "item-3", quantity: 1 })).rejects.toThrow(ConflictException);
    expect(rules.logException).toHaveBeenCalledWith(TENANT, "GOV_EXPIRED_STOCK_DISPENSE_ATTEMPT", expect.anything(), expect.anything());
  });

  it("§67.3 no silent substitution when government stock is insufficient", async () => {
    const { svc } = setup();
    (svc as any).prisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-4", fundingSource: "GOVERNMENT_FREE_PROGRAM", currentStock: 2, expiryDate: null,
    });
    await expect(svc.dispenseGov(TENANT, { itemId: "item-4", quantity: 10 })).rejects.toThrow(/no silent substitution/);
  });

  it("§67.3 private retail path cannot touch government lots", async () => {
    const { svc } = setup();
    (svc as any).prisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-5", fundingSource: "GOVERNMENT_FREE_PROGRAM",
    });
    await expect(svc.assertPrivateDispenseAllowed(TENANT, "item-5")).rejects.toThrow(ConflictException);
  });

  it("§67.2 registerGovBatch refuses to reclassify an existing private batch", async () => {
    const { svc } = setup();
    (svc as any).prisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-6", fundingSource: "PRIVATE_RETAIL",
    });
    await expect(
      svc.registerGovBatch(TENANT, { itemId: "item-6", name: "X", storeId: "s1", quantity: 5, programName: "P" }),
    ).rejects.toThrow(/segregation/);
  });
});

// ================= §68 Aama =================

describe("Aama / Safe Motherhood (§68)", () => {
  function setup(ruleConfig: any = {}) {
    const prisma = makePrisma();
    const rules = makeRuleService(prisma, { AAMA_PROGRAM: ruleConfig });
    return { svc: new ProgramsService(prisma, rules), prisma };
  }

  it("§68.4 case creation is idempotent on caseNumber", async () => {
    const { svc, prisma } = setup();
    const existing = { id: "aama-0", caseNumber: "AAMA-2026-0001", paymentStatus: "ELIGIBILITY_PENDING" };
    (svc as any).prisma.aamaIncentiveCase.findFirst.mockResolvedValue(existing);
    const res = await svc.createAamaCase(TENANT, { patientId: "p1", caseNumber: "AAMA-2026-0001" });
    expect(res.id).toBe("aama-0");
    expect(prisma.aamaIncentiveCase.create).not.toHaveBeenCalled();
  });

  it("§68.1 eligibility fails without institutional delivery and records the rule version", async () => {
    const { svc } = setup({ institutionalDeliveryRequired: true, ancRequiredVisits: 4 });
    (svc as any).prisma.aamaIncentiveCase.findFirst.mockResolvedValue({
      id: "aama-1", deliveryDate: null, ancMilestones: [], paymentStatus: "ELIGIBILITY_PENDING",
    });
    const res = await svc.assessAamaEligibility(TENANT, "aama-1");
    expect(res.paymentStatus).toBe("NOT_ELIGIBLE");
    expect(res.ruleVersion).toBe(7);
    expect(res.eligibilityStatus).toContain("No institutional delivery");
  });

  it("§68.1 eligible when ANC milestones met and delivery recorded", async () => {
    const { svc } = setup({ ancRequiredVisits: 4 });
    (svc as any).prisma.aamaIncentiveCase.findFirst.mockResolvedValue({
      id: "aama-2", deliveryDate: new Date(), facilityName: "District Hospital",
      ancMilestones: [{}, {}, {}, {}], paymentStatus: "ELIGIBILITY_PENDING",
    });
    const res = await svc.assessAamaEligibility(TENANT, "aama-2");
    expect(res.paymentStatus).toBe("ELIGIBLE");
  });

  it("§68.3 approval before eligibility is rejected", async () => {
    const { svc } = setup();
    (svc as any).prisma.aamaIncentiveCase.findFirst.mockResolvedValue({
      id: "aama-3", paymentStatus: "ELIGIBILITY_PENDING",
    });
    await expect(svc.approveAama(TENANT, "aama-3", 5000, "u1")).rejects.toThrow(ConflictException);
  });

  it("§68.1/§74 approval above the rule ceiling is rejected", async () => {
    const { svc } = setup({ incentiveCeiling: 3000 });
    (svc as any).prisma.aamaIncentiveCase.findFirst.mockResolvedValue({
      id: "aama-4", paymentStatus: "ELIGIBLE",
    });
    await expect(svc.approveAama(TENANT, "aama-4", 5000, "u1")).rejects.toThrow(/ceiling/);
  });

  it("§68.3 payment lifecycle: eligible ≠ paid; FAILED requires a reason and is retryable", async () => {
    const { svc } = setup();
    (svc as any).prisma.aamaIncentiveCase.findFirst
      .mockResolvedValueOnce({ id: "aama-5", paymentStatus: "APPROVED" })
      .mockResolvedValueOnce({ id: "aama-5", paymentStatus: "SUBMITTED" });
    await svc.submitAamaPayment(TENANT, "aama-5", "REF-1");
    (svc as any).prisma.aamaIncentiveCase.findFirst.mockResolvedValue({ id: "aama-5", paymentStatus: "SUBMITTED" });
    await expect(svc.recordAamaPayment(TENANT, "aama-5", "FAILED", {})).rejects.toThrow(BadRequestException);
    (svc as any).prisma.aamaIncentiveCase.findFirst.mockResolvedValue({ id: "aama-5", paymentStatus: "FAILED" });
    const retried = await svc.retryAamaPayment(TENANT, "aama-5");
    expect(retried.paymentStatus).toBe("SUBMITTED");
  });
});

// ================= §69 Sifaris =================

describe("Sifaris recommendations (§69)", () => {
  function setup() {
    const prisma = makePrisma();
    const rules = makeRuleService(prisma);
    return { svc: new ProgramsService(prisma, rules), prisma };
  }

  it("§69.3 unverified Sifaris does not qualify for benefits", async () => {
    const { svc } = setup();
    (svc as any).prisma.sifarisDocument.findFirst.mockResolvedValue({
      id: "sif-1", status: "PENDING_VERIFICATION", validFrom: null, validTo: null,
    });
    await expect(svc.assertSifarisEligible(TENANT, "sif-1")).rejects.toThrow(ConflictException);
  });

  it("§69.3 expired Sifaris is marked EXPIRED and rejected", async () => {
    const { svc, prisma } = setup();
    (svc as any).prisma.sifarisDocument.findFirst.mockResolvedValue({
      id: "sif-2", status: "VERIFIED", validFrom: null, validTo: new Date(Date.now() - 86400000),
    });
    await expect(svc.assertSifarisEligible(TENANT, "sif-2")).rejects.toThrow(/expired/);
    expect(prisma.sifarisDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED" } }),
    );
  });

  it("§69.3 verified, in-window Sifaris qualifies", async () => {
    const { svc } = setup();
    (svc as any).prisma.sifarisDocument.findFirst.mockResolvedValue({
      id: "sif-3", status: "VERIFIED", validFrom: null, validTo: new Date(Date.now() + 86400000),
    });
    const doc = await svc.assertSifarisEligible(TENANT, "sif-3");
    expect(doc.status).toBe("VERIFIED");
  });
});

// ================= §70 Disaster =================

describe("Disaster / HEOC mode (§70)", () => {
  function setup() {
    const prisma = makePrisma();
    const rules = makeRuleService(prisma);
    return { svc: new DisasterOfflineService(prisma, rules), prisma };
  }

  it("§70.1 refuses a second concurrent activation", async () => {
    const { svc } = setup();
    (svc as any).prisma.disasterActivation.findFirst.mockResolvedValue({ id: "act-0", mode: "DISASTER_MODE" });
    await expect(
      svc.activate(TENANT, { mode: "MASS_CASUALTY_MODE", activatedBy: "u1" }),
    ).rejects.toThrow(ConflictException);
  });

  it("§70.2 rapid intake works with minimal identity and defaults to UNIDENTIFIED_CASUALTY", async () => {
    const { svc } = setup();
    (svc as any).prisma.disasterActivation.findFirst.mockResolvedValue({ id: "act-1", mode: "MASS_CASUALTY_MODE" });
    const cas = await svc.rapidIntake(TENANT, { displayName: "Unknown male", createdBy: "u1" });
    expect(cas.tempCasualtyId).toMatch(/^MC-/);
    expect(cas.payerClass).toBe("UNIDENTIFIED_CASUALTY");
    expect(cas.patientId).toBeUndefined();
  });

  it("§70.2 intake without an active activation is blocked", async () => {
    const { svc } = setup();
    (svc as any).prisma.disasterActivation.findFirst.mockResolvedValue(null);
    await expect(svc.rapidIntake(TENANT, { createdBy: "u1" })).rejects.toThrow(ConflictException);
  });

  it("§70.3/§75 triage history is append-only and attributed", async () => {
    const { svc } = setup();
    (svc as any).prisma.disasterCasualty.findFirst.mockResolvedValue({
      id: "cas-1", currentCategory: null, status: "AWAITING_ASSESSMENT", triageHistory: [],
    });
    const res = await svc.recordTriage(TENANT, "cas-1", { category: "RED", triageOfficer: "nurse-1" });
    expect(res.currentCategory).toBe("RED");
    const hist = (res.triageHistory ?? []) as any[];
    expect(hist).toHaveLength(1);
    expect(hist[0].triageOfficer).toBe("nurse-1");
    expect(res.status).toBe("IN_TREATMENT");
  });

  it("§70.5 identity reconciliation links the definitive patient", async () => {
    const { svc } = setup();
    (svc as any).prisma.disasterCasualty.findFirst.mockResolvedValue({
      id: "cas-2", tempCasualtyId: "MC-X", patientId: null, payerClass: "UNIDENTIFIED_CASUALTY",
    });
    const res = await svc.reconcileIdentity(TENANT, "cas-2", "pat-9");
    expect(res.patientId).toBe("pat-9");
  });
});

// ================= §71 Offline sync =================

describe("Offline store-and-forward sync (§71)", () => {
  function setup() {
    const prisma = makePrisma();
    const rules = makeRuleService(prisma);
    return { svc: new DisasterOfflineService(prisma, rules), prisma };
  }

  it("§71.4 duplicate enqueue with the same localTxnId is deduplicated", async () => {
    const { svc, prisma } = setup();
    (svc as any).prisma.offlineSyncItem.findUnique.mockResolvedValue({ id: "sync-0", localTxnId: "LT-1" });
    const res = await svc.enqueue(TENANT, {
      localTxnId: "LT-1", localNodeId: "node-1", entityType: "Patient", entityId: "p1", operationType: "CREATE",
    });
    expect(res.deduplicated).toBe(true);
    expect(prisma.offlineSyncItem.create).not.toHaveBeenCalled();
  });

  it("§71.4 re-uploading a synced batch changes nothing", async () => {
    const { svc, prisma } = setup();
    (svc as any).prisma.offlineSyncItem.findFirst.mockResolvedValue({
      id: "sync-1", localTxnId: "LT-1", syncState: "SYNCED", entityType: "Patient",
    });
    const res = await svc.syncBatch(TENANT, [{ localTxnId: "LT-1" }]);
    expect(res[0].syncState).toBe("SYNCED");
    expect(res[0].note).toMatch(/no duplicate/);
    expect(prisma.offlineSyncItem.update).not.toHaveBeenCalled();
  });

  it("§71.5 checksum mismatch on a FINANCIAL entity forces MANUAL_REVIEW, never overwrite", async () => {
    const { svc } = setup();
    (svc as any).prisma.offlineSyncItem.findFirst.mockResolvedValue({
      id: "sync-2", localTxnId: "LT-2", syncState: "QUEUED", entityType: "Invoice", checksum: "aaa",
    });
    const res = await svc.syncBatch(TENANT, [{ localTxnId: "LT-2", checksum: "bbb" }]);
    expect(res[0].syncState).toBe("MANUAL_REVIEW");
  });

  it("§71.5 ACCEPT_LOCAL on a financial conflict is refused", async () => {
    const { svc } = setup();
    (svc as any).prisma.offlineSyncItem.findFirst.mockResolvedValue({
      id: "sync-3", syncState: "MANUAL_REVIEW", entityType: "Payment",
    });
    await expect(svc.resolveConflict(TENANT, "sync-3", "ACCEPT_LOCAL", "u1")).rejects.toThrow(/adjustment/);
  });

  it("§71.5 non-financial conflicts can be resolved by an authorized user", async () => {
    const { svc } = setup();
    (svc as any).prisma.offlineSyncItem.findFirst.mockResolvedValue({
      id: "sync-4", syncState: "CONFLICT", entityType: "Patient", conflictDetail: null,
    });
    const res = await svc.resolveConflict(TENANT, "sync-4", "ACCEPT_LOCAL", "u1", "verified locally");
    expect(res.syncState).toBe("SYNCED");
  });

  it("§75 unknown transactions from a node are REJECTED, not accepted blindly", async () => {
    const { svc } = setup();
    (svc as any).prisma.offlineSyncItem.findFirst.mockResolvedValue(null);
    const res = await svc.syncBatch(TENANT, [{ localTxnId: "GHOST-1" }]);
    expect(res[0].syncState).toBe("REJECTED");
  });
});

// ================= §72 Bilingual =================

describe("Bilingual engine (§72)", () => {
  function setup() {
    const prisma = makePrisma();
    const rules = makeRuleService(prisma);
    return { svc: new BilingualService(prisma, rules), prisma };
  }

  it("§72.2/§72.6 structured medication values are preserved verbatim (no free translation)", async () => {
    const { svc } = setup();
    (svc as any).prisma.translationTerm.findMany.mockResolvedValue([
      { sourceText: "After food", translatedText: "खाना पछि" },
    ]);
    const res = await svc.localizePrescription(TENANT, {
      medicineName: "Amoxicillin", strength: "500 mg", dosage: "1 capsule", afterFood: true,
    });
    const byKey = Object.fromEntries(res.fields.map((f) => [f.key, f]));
    expect(byKey.strength.localized).toBe("500 mg");
    expect(byKey.dosage.localized).toBe("1 capsule");
    expect(byKey.afterFood.localized).toBe("खाना पछि");
    expect(byKey.medicineName.localized).toBe("Amoxicillin"); // no dictionary hit → verbatim
  });

  it("§72.4 thermal receipt translates known terms and falls back for unknown", async () => {
    const { svc } = setup();
    (svc as any).prisma.translationTerm.findMany.mockResolvedValue([
      { sourceText: "Receipt No", translatedText: "रसिद नं" },
      { sourceText: "Date", translatedText: "मिति" },
    ]);
    const res = await svc.buildThermalReceipt(TENANT, {
      receiptNumber: "R-1001",
      dateTime: new Date("2026-09-19T10:00:00Z"),
      facilityName: "Hospital",
      cashier: "Sita",
      paymentMethod: "Cash",
      lines: [{ label: "Registration fee", amount: 100 }],
      total: 100,
    });
    expect(res.header.join("\n")).toContain("रसिद नं: R-1001");
    expect(res.body[0].labelLocalized).toBe("Registration fee"); // fallback to source
    expect(res.total).toBe("NPR 100.00");
  });

  it("§72.3 upserting an existing term bumps the version instead of duplicating", async () => {
    const { svc, prisma } = setup();
    (svc as any).prisma.translationTerm.findFirst.mockResolvedValue({
      id: "term-1", domain: "billing", sourceText: "Receipt No", language: "ne", translatedText: "रसिद नं", version: 3,
    });
    await svc.upsertTerm(TENANT, { domain: "billing", sourceText: "Receipt No", translatedText: "रसिद नं." });
    expect(prisma.translationTerm.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { translatedText: "रसिद नं.", version: { increment: 1 } } }),
    );
  });
});
