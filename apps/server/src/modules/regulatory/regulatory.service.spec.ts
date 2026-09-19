/**
 * Nepal Regulatory & Special Patient Management — acceptance tests
 * (spec §65.51–§65.56 core behaviors, §65.44–§65.45 rule versioning,
 * §65.12 SoD, §65.18 over-utilization, §65.32–§65.34 VIP gates).
 */
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { RegulatoryService, RULE_KEYS } from "./regulatory.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

function makePrisma(over: any = {}) {
  return {
    regulatoryRule: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ id: "rule-1", version: 1, ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...over.regulatoryRule,
    },
    freeBedAllocation: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => ({ id: "fba-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      ...over.freeBedAllocation,
    },
    bed: { count: jest.fn().mockResolvedValue(100), ...over.bed },
    ssuAssessment: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "ssu-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
      ...over.ssuAssessment,
    },
    ssuCommitteeDecision: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "dec-1", ...data })),
      ...over.ssuCommitteeDecision,
    },
    bipannaCase: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "bc-1", caseNumber: "BNK-2026-00001", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
      ...over.bipannaCase,
    },
    brainDeathCase: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "bdc-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      count: jest.fn().mockResolvedValue(0),
      ...over.brainDeathCase,
    },
    donorAlert: { create: jest.fn().mockImplementation(({ data }) => ({ id: "da-1", ...data })), count: jest.fn().mockResolvedValue(0), ...over.donorAlert },
    seniorQueueEntry: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "sq-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      count: jest.fn().mockResolvedValue(0),
      ...over.seniorQueueEntry,
    },
    vipClassification: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "vip-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      count: jest.fn().mockResolvedValue(0),
      ...over.vipClassification,
    },
    vipAccessLog: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0), ...over.vipAccessLog },
    subsidyLedgerEntry: { create: jest.fn().mockImplementation(({ data }) => ({ id: "sle-1", ...data })), findMany: jest.fn().mockResolvedValue([]), ...over.subsidyLedgerEntry },
    govSyncRecord: { create: jest.fn().mockResolvedValue({ id: "gsr-1" }), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), ...over.govSyncRecord },
    regulatoryEvent: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), ...over.regulatoryEvent },
    regulatoryException: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), ...over.regulatoryException },
    $transaction: jest.fn((ops) => Promise.all(ops)),
    ...over.root,
  };
}

function makeService(prisma: any) {
  const rules = new RegulatoryRuleService(prisma);
  return new RegulatoryService(prisma, rules);
}

/** Stub rule resolution to a fixed config (rule CONTENT is configuration). */
function stubRule(svc: RegulatoryService, key: string, config: any, version = 3) {
  (svc as any).rules.resolve = jest.fn().mockImplementation(async (_t: string, k: string) => {
    if (k !== key) throw new NotFoundException(`no rule ${k}`);
    return { ruleId: `rule-${key}`, ruleKey: key, version, config, effectiveFrom: new Date(), authority: "MoHP", legalReference: "Test" };
  });
  (svc as any).rules.resolveOrNull = jest.fn().mockImplementation(async (_t: string, k: string) => {
    if (k !== key) return null;
    return { ruleId: `rule-${key}`, ruleKey: key, version, config, effectiveFrom: new Date(), authority: "MoHP", legalReference: "Test" };
  });
}

const TENANT = "t1";

describe("Regulatory rule engine (§65.44/§65.45)", () => {
  it("throws when no active rule exists — never guesses", async () => {
    const prisma = makePrisma();
    const svc = new RegulatoryRuleService(prisma);
    await expect(svc.resolve(TENANT, "free_bed_quota")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("resolves the newest effective active rule", async () => {
    const prisma = makePrisma({
      regulatoryRule: {
        findMany: jest.fn().mockResolvedValue([
          { id: "r2", ruleKey: "k", version: 2, config: { a: 2 }, effectiveFrom: new Date("2026-02-01"), authority: null, legalReference: null },
          { id: "r1", ruleKey: "k", version: 1, config: { a: 1 }, effectiveFrom: new Date("2026-01-01"), authority: null, legalReference: null },
        ]),
      },
    });
    const svc = new RegulatoryRuleService(prisma);
    const rule = await svc.resolve(TENANT, "k");
    expect(rule.version).toBe(2);
  });

  it("SoD: the rule creator cannot approve their own rule (§65.12 principle)", async () => {
    const prisma = makePrisma({
      regulatoryRule: {
        findFirst: jest.fn().mockResolvedValue({ id: "r1", ruleKey: "k", version: 1, status: "DRAFT", createdBy: "user-1", effectiveFrom: new Date() }),
      },
    });
    const svc = new RegulatoryRuleService(prisma);
    await expect(svc.approve(TENANT, "r1", "user-1")).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("Free-bed quota (§65.2–§65.4, §65.51)", () => {
  it("calculates required quota from the RULE with configured rounding (no magic numbers)", async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.FREE_BED, { bedBase: 103, quotaPercent: 10, roundingMode: "FLOOR" });
    const q = await svc.computeRequiredFreeBeds(TENANT);
    expect(q.required).toBe(10); // floor(10.3)
    stubRule(svc, RULE_KEYS.FREE_BED, { bedBase: 103, quotaPercent: 10, roundingMode: "ROUND" });
    expect((await svc.computeRequiredFreeBeds(TENANT)).required).toBe(10);
    stubRule(svc, RULE_KEYS.FREE_BED, { bedBase: 105, quotaPercent: 10, roundingMode: "CEIL" });
    expect((await svc.computeRequiredFreeBeds(TENANT)).required).toBe(11); // ceil(10.5)
  });

  it("blocks assignment when the quota is exhausted and logs the exception", async () => {
    const prisma = makePrisma({
      freeBedAllocation: { count: jest.fn().mockResolvedValue(10) },
    });
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.FREE_BED, { bedBase: 100, quotaPercent: 10, roundingMode: "ROUND" });
    await expect(
      svc.assignFreeBed(TENANT, { patientId: "p1", eligibilityBasis: "POVERTY" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("assigns and releases with event + gov-sync + rule-version provenance", async () => {
    const store: any = { id: null };
    const prisma = makePrisma({
      freeBedAllocation: {
        create: jest.fn().mockImplementation(({ data }) => {
          Object.assign(store, { id: "fba-1", ...data });
          return store;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(store.id === where.id ? store : null),
        ),
        update: jest.fn().mockImplementation(({ where, data }) => {
          Object.assign(store, data);
          return store;
        }),
      },
    });
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.FREE_BED, { bedBase: 100, quotaPercent: 10, roundingMode: "ROUND" });
    const alloc = await svc.assignFreeBed(TENANT, { patientId: "p1", eligibilityBasis: "POVERTY", createdBy: "u1" });
    expect(alloc.ruleVersion).toBe(3);
    expect(prisma.govSyncRecord.create).toHaveBeenCalled();
    expect(prisma.regulatoryEvent.create).toHaveBeenCalled();
    await svc.releaseFreeBed(TENANT, (alloc as any).id, "u1");
    expect(prisma.freeBedAllocation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RELEASED" }) }),
    );
  });
});

describe("SSU (§65.10–§65.13, §65.52)", () => {
  it("caps the recommendation at the configured matrix ceiling (§65.11)", async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.SSU_SUBSIDY, {
      rows: [{ economicTier: "EXTREME_POOR", diseaseCategory: "CANCER", maxSubsidy: 80000 }],
    });
    await svc.createSsuAssessment(TENANT, {
      patientId: "p1",
      economicTier: "EXTREME_POOR",
      diseaseCategory: "CANCER",
      recommendedSubsidy: 150000, // over ceiling
      createdBy: "u1",
    });
    expect(prisma.ssuAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recommendedSubsidy: 80000 }) }),
    );
  });

  it("SoD: recommender cannot sit on the deciding committee (§65.12)", async () => {
    const prisma = makePrisma({
      ssuAssessment: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ssu-1", status: "RECOMMENDED", recommendedBy: "assessor-1", patientId: "p1",
        }),
      },
    });
    const svc = makeService(prisma);
    await expect(
      svc.decideSsuAssessment(TENANT, "ssu-1", {
        decision: "APPROVED",
        members: [{ userId: "assessor-1" }, { userId: "member-2" }],
        approvedAmount: 50000,
        decidedBy: "chair-1",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("approval writes the ledger and reconciliation flags the unreconciled gap (§65.13)", async () => {
    const store: any = {
      id: "ssu-1", status: "COMMITTEE_REVIEW", recommendedBy: "assessor-1",
      patientId: "p1", invoiceId: "inv-1", recommendedSubsidy: 50000, totalBillAmount: 150000,
    };
    const prisma = makePrisma({
      ssuAssessment: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(store)),
        update: jest.fn().mockImplementation(({ data }) => {
          Object.assign(store, data);
          return store;
        }),
      },
    });
    const svc = makeService(prisma);
    await svc.decideSsuAssessment(TENANT, "ssu-1", {
      decision: "APPROVED",
      members: [{ userId: "member-1" }, { userId: "member-2" }],
      approvedAmount: 50000,
      governmentContribution: 40000,
      patientContribution: 60000,
      decidedBy: "chair-1",
    });
    expect(prisma.subsidyLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entryType: "APPROVAL", amount: 50000 }) }),
    );
    const rec = await svc.reconcileSsu(TENANT, "ssu-1");
    expect(rec.total).toBe(150000);
    expect(rec.unreconciled).toBe(0);
    expect(prisma.regulatoryException.create).not.toHaveBeenCalled();

    // Now an unbalanced split → exception logged.
    Object.assign(store, {
      status: "APPROVED", totalBillAmount: 150000,
      governmentContribution: 10000, approvedSubsidy: 10000, patientContribution: 10000,
    });
    (prisma.regulatoryException.create as jest.Mock).mockClear();
    const rec2 = await svc.reconcileSsu(TENANT, "ssu-1");
    expect(rec2.unreconciled).toBe(120000);
    expect(prisma.regulatoryException.create).toHaveBeenCalled();
  });
});

describe("Bipanna Nagarik Kosh (§65.15–§65.19, §65.53)", () => {
  it("rejects disease categories not in the active program rule (§65.15)", async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.BIPANNA, { diseases: [{ category: "CANCER", maxAmount: 100000 }] });
    await expect(
      svc.createBipannaCase(TENANT, { patientId: "p1", diseaseCategory: "FLU" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("enforces the configured ceiling — raising it needs only a rule change (§65.17)", async () => {
    const prisma = makePrisma({
      bipannaCase: {
        findFirst: jest.fn().mockResolvedValue({
          id: "bc-1", status: "ACTIVE", diseaseCategory: "CANCER", patientId: "p1", approvedAmount: 0,
        }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: "bc-1", ...data })),
      },
    });
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.BIPANNA, { diseases: [{ category: "CANCER", maxAmount: 100000 }] });
    await expect(
      svc.approveBipannaAssistance(TENANT, "bc-1", 150000, "u1"),
    ).rejects.toBeInstanceOf(ConflictException);
    // Government raises the ceiling to 200k via a NEW RULE VERSION — code unchanged.
    stubRule(svc, RULE_KEYS.BIPANNA, { diseases: [{ category: "CANCER", maxAmount: 200000 }] }, 4);
    await svc.approveBipannaAssistance(TENANT, "bc-1", 150000, "u1");
    expect(prisma.bipannaCase.update).toHaveBeenCalled();
  });

  it("prevents utilization beyond the approved amount (§65.18)", async () => {
    const prisma = makePrisma({
      bipannaCase: {
        findFirst: jest.fn().mockResolvedValue({
          id: "bc-1", status: "ACTIVE", patientId: "p1", approvedAmount: 100000, utilizedAmount: 90000,
        }),
      },
    });
    const svc = makeService(prisma);
    await expect(
      svc.utilizeBipannaAssistance(TENANT, "bc-1", 20000, "svc-1", "u1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("claim cannot exceed utilization; settlement reconciles the ledger (§65.19)", async () => {
    const prisma = makePrisma({
      bipannaCase: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: "bc-1", status: "ACTIVE", patientId: "p1", utilizedAmount: 50000, claimedAmount: 0, approvedAmount: 100000 })
          .mockResolvedValue({ id: "bc-1", status: "ACTIVE", patientId: "p1", utilizedAmount: 50000, approvedAmount: 100000 }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: "bc-1", ...data })),
      },
    });
    const svc = makeService(prisma);
    await expect(svc.submitBipannaClaim(TENANT, "bc-1", 60000, "u1")).rejects.toBeInstanceOf(ConflictException);
    await svc.submitBipannaClaim(TENANT, "bc-1", 50000, "u1");
    await svc.settleBipannaClaim(TENANT, "bc-1", { approvedClaim: 45000, received: 45000, rejected: 5000, userId: "u1" });
    expect(prisma.bipannaCase.update).toHaveBeenCalledTimes(2);
    const rec = svc.reconcileBipanna({ approvedAmount: 100000, utilizedAmount: 50000, rejectedAmount: 5000, returnedAmount: 0 });
    expect(rec.remaining).toBe(45000);
  });
});

describe("Brain death & donor coordination (§65.20–§65.26, §65.54)", () => {
  it("blocks certification until all configured sign-offs exist (§65.22)", async () => {
    const prisma = makePrisma({
      brainDeathCase: {
        findFirst: jest.fn().mockResolvedValue({
          id: "bdc-1", status: "CERTIFICATION_PENDING", patientId: "p1",
          checklist: { completedSteps: ["APNEA_TEST"] },
        }),
      },
    });
    const svc = makeService(prisma);
    stubRule(svc, "brain_death_protocol", { certification: { requiredSignoffs: ["APNEA_TEST", "SECOND_EXAM"] } });
    await expect(
      svc.recordBrainDeathStep(TENANT, "bdc-1", { status: "CERTIFIED", clinicianId: "doc-1" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("donor alert requires configured authorized recipients and records the audit (§65.23/§65.25)", async () => {
    const prisma = makePrisma({
      brainDeathCase: {
        findFirst: jest.fn().mockResolvedValue({ id: "bdc-1", status: "CERTIFIED", patientId: "p1" }),
      },
    });
    const svc = makeService(prisma);
    stubRule(svc, "donor_alert_trigger", { triggerStatus: "CERTIFIED", authorizedRecipients: ["SDNTC", "TRANSPLANT_UNIT"] });
    await svc.sendDonorAlert(TENANT, "bdc-1", "u1");
    expect(prisma.donorAlert.create).toHaveBeenCalledTimes(2);
    expect(prisma.regulatoryEvent.create).toHaveBeenCalled();
  });
});

describe("Senior citizen priority (§65.27–§65.30, §65.55)", () => {
  const dob62 = new Date();
  dob62.setFullYear(dob62.getFullYear() - 62);
  const dob40 = new Date();
  dob40.setFullYear(dob40.getFullYear() - 40);

  it("age evaluated against the ACTIVE rule — threshold change is config-only (§65.27)", async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.SENIOR, { minAge: 60 });
    expect((await svc.isSeniorCitizen(TENANT, dob62)).eligible).toBe(true);
    expect((await svc.isSeniorCitizen(TENANT, dob40)).eligible).toBe(false);
    // Law changes to 65+ → new rule version, zero code change.
    stubRule(svc, RULE_KEYS.SENIOR, { minAge: 65 }, 4);
    expect((await svc.isSeniorCitizen(TENANT, dob62)).eligible).toBe(false);
  });

  it("emergency triage dominates senior priority (§65.28)", async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.SENIOR, { minAge: 60 });
    (svc as any).rules.resolveOrNull.mockImplementation(async (_t: string, k: string) => {
      if (k === RULE_KEYS.SENIOR) return { ruleId: "r", ruleKey: k, version: 1, config: { minAge: 60 }, effectiveFrom: new Date(), authority: null, legalReference: null };
      if (k === RULE_KEYS.PRIORITY) return { ruleId: "r", ruleKey: k, version: 1, config: { emergencyDominates: true, emergencyTriageCutoff: 2 }, effectiveFrom: new Date(), authority: null, legalReference: null };
      return null;
    });
    const entry = await svc.enqueueSenior(TENANT, {
      patientId: "p1", servicePoint: "OPD", dateOfBirth: dob62, emergencyTriageLevel: 1, handledBy: "u1",
    });
    expect(entry.priority).toBe("NORMAL");
  });

  it("issues priority token, records waiting time on serve (§65.29/§65.30)", async () => {
    const prisma = makePrisma({
      seniorQueueEntry: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: "sq-1", queuedAt: new Date(Date.now() - 60000), ...data })),
        findFirst: jest.fn().mockResolvedValue({ id: "sq-1", queuedAt: new Date(Date.now() - 60000), handledBy: null }),
        update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      },
    });
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.SENIOR, { minAge: 60 });
    const entry = await svc.enqueueSenior(TENANT, { patientId: "p1", servicePoint: "PHARMACY", dateOfBirth: dob62, handledBy: "u1" });
    expect(entry.token).toMatch(/^S-\d+$/);
    expect(entry.priority).toBe("SENIOR_PRIORITY");
    const served = await svc.serveSeniorQueueEntry(TENANT, "sq-1", "u2");
    expect(served.waitingSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe("VIP/VVIP (§65.31–§65.34, §65.56)", () => {
  it("classification requires a configured level and logs the act (§65.31)", async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    stubRule(svc, RULE_KEYS.VIP, { allowedLevels: ["VIP", "VVIP"] });
    await svc.classifyVip(TENANT, { patientId: "p1", level: "VVIP", authorizedBy: "minister", createdBy: "u1" });
    expect(prisma.vipAccessLog.create).toHaveBeenCalled();
    await expect(
      svc.classifyVip(TENANT, { patientId: "p1", level: "CELEBRITY", authorizedBy: "x", createdBy: "u1" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("need-to-know: unauthorized user denied even if admin; every attempt logged (§65.32/§65.33)", async () => {
    const prisma = makePrisma({
      vipClassification: {
        findFirst: jest.fn().mockResolvedValue({
          id: "vip-1", level: "VVIP", patientId: "p1",
          accessPolicy: { allowedRoles: ["CONSULTANT"], allowedUsers: ["doctor-9"] },
        }),
      },
    });
    const svc = makeService(prisma);
    await expect(
      svc.assertVipAccess(TENANT, "p1", { id: "admin-1", role: "HOSPITAL_ADMIN" }, { action: "VIEW", reason: "curiosity" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.vipAccessLog.create).toHaveBeenCalled();
  });

  it("authorized user passes and the access is logged (§65.33)", async () => {
    const prisma = makePrisma({
      vipClassification: {
        findFirst: jest.fn().mockResolvedValue({
          id: "vip-1", level: "VVIP", patientId: "p1",
          accessPolicy: { allowedUsers: ["doctor-9"] },
        }),
      },
    });
    const svc = makeService(prisma);
    const vip = await svc.assertVipAccess(TENANT, "p1", { id: "doctor-9", role: "DOCTOR" }, { action: "VIEW", reason: "treating consultant" });
    expect(vip).toBeTruthy();
    expect(prisma.vipAccessLog.create).toHaveBeenCalled();
  });

  it("break-glass requires a substantive reason and raises a CRITICAL exception (§65.34)", async () => {
    const prisma = makePrisma({
      vipClassification: {
        findFirst: jest.fn().mockResolvedValue({
          id: "vip-1", level: "VVIP", patientId: "p1", accessPolicy: { allowedUsers: [] },
        }),
      },
    });
    const svc = makeService(prisma);
    await expect(
      svc.assertVipAccess(TENANT, "p1", { id: "er-1", role: "EMERGENCY_STAFF" }, { action: "VIEW", reason: "urgent", breakGlass: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const vip = await svc.assertVipAccess(TENANT, "p1", { id: "er-1", role: "EMERGENCY_STAFF" }, {
      action: "VIEW",
      reason: "Unconscious VIP in ER requiring immediate treatment access",
      breakGlass: true,
    });
    expect(vip).toBeTruthy();
    expect(prisma.regulatoryException.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "VIP_BREAK_GLASS", severity: "CRITICAL" }) }),
    );
  });

  it("non-VIP patients pass without any gate (§65.39 separation)", async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const result = await svc.assertVipAccess(TENANT, "p1", { id: "u1", role: "NURSE" }, { action: "VIEW", reason: "care" });
    expect(result).toBeNull();
  });
});

describe("Funding waterfall & double-funding (§65.48–§65.50)", () => {
  it("builds the waterfall from the ledger and flags excessive stacking", async () => {
    const prisma = makePrisma({
      subsidyLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          { entryType: "APPROVAL", amount: 40000, funder: "BIPANNA_NAGARIK_KOSH" },
          { entryType: "APPROVAL", amount: 20000, funder: "SSU_COMMITTEE" },
          { entryType: "APPROVAL", amount: 10000, funder: "FREE_BED" },
        ]),
      },
    });
    const svc = makeService(prisma);
    const wf = await svc.getFundingWaterfall(TENANT, "inv-1");
    expect(wf.waterfall["BIPANNA_NAGARIK_KOSH"]).toBe(40000);
    const check = await svc.checkDoubleFunding(TENANT, "inv-1", 2);
    expect(check.flagged).toBe(true);
    expect(check.programs).toHaveLength(3);
    expect(prisma.regulatoryException.create).toHaveBeenCalled();
  });
});
