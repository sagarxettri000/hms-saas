/**
 * National interoperability acceptance tests — specs §77–§83:
 * ICD-11 versioning + validation, interop gateway idempotency + failure
 * taxonomy, surveillance rule matching, vital-event lifecycle gates,
 * blood crossmatch safety net + transfusion rules, waste chain of custody.
 */
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { TerminologyService } from "./terminology.service";
import { InteropGatewayService } from "./interop-gateway.service";
import { PublicHealthService } from "./public-health.service";
import { BloodChainService } from "./blood-chain.service";
import { WasteService, WASTE_CATEGORIES } from "./waste.service";
import { RegulatoryRuleService } from "../regulatory/regulatory-rule.service";

const TENANT = "t1";

function makePrisma(over: any = {}) {
  const mk = (name: string, defaults: any = {}) => ({
    create: jest.fn().mockImplementation(({ data }) => ({ id: `${name}-1`, ...data })),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockImplementation(({ where, data }) => ({ id: where?.id ?? "x", ...data })),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
    ...defaults,
    ...(over[name] ?? {}),
  });
  return {
    icdCode: mk("icdCode"),
    fhirMapping: mk("fhirMapping"),
    surveillanceRule: mk("surveillanceRule"),
    interopTransaction: mk("interopTransaction"),
    vitalEvent: mk("vitalEvent"),
    bloodCrossmatch: mk("bloodCrossmatch"),
    bloodTransfusion: mk("bloodTransfusion"),
    bloodUnit: mk("bloodUnit"),
    wasteLedgerEntry: mk("wasteLedgerEntry"),
    wasteManifest: mk("wasteManifest"),
    diagnosis: mk("diagnosis"),
    $transaction: jest.fn((ops: any) => (Array.isArray(ops) ? Promise.all(ops) : Promise.resolve([]))),
    ...over.root,
  };
}

function makeRules(prisma: any) {
  const svc = new RegulatoryRuleService(makePrisma());
  jest.spyOn(svc, "resolve").mockImplementation(async (_t, ruleKey) => ({
    ruleId: `rule-${ruleKey}`, ruleKey, version: 3, config: {}, effectiveFrom: new Date(),
    authority: "MoHP", legalReference: null,
  }));
  jest.spyOn(svc, "resolveOrNull").mockImplementation(async (_t, ruleKey) => ({
    ruleId: `rule-${ruleKey}`, ruleKey, version: 3, config: {}, effectiveFrom: new Date(),
    authority: "MoHP", legalReference: null,
  }));
  jest.spyOn(svc, "logEvent").mockResolvedValue(undefined as any);
  jest.spyOn(svc, "logException").mockResolvedValue(undefined as any);
  void prisma;
  return svc;
}

// ================= §79 Terminology =================

describe("ICD-11 terminology service (§79)", () => {
  function setup() {
    const prisma = makePrisma();
    return { svc: new TerminologyService(prisma), prisma };
  }

  it("§79.2 imports a version and refuses duplicate version identifiers", async () => {
    const { svc, prisma } = setup();
    const res = await svc.importVersion(TENANT, {
      version: "2026-01",
      codes: [{ code: "1A00", display: "Cholera" }, { code: "1D01", display: "Dengue" }],
    });
    expect(res.imported).toBe(2);
    expect(prisma.icdCode.createMany).toHaveBeenCalled();

    (svc as any).prisma.icdCode.findFirst.mockResolvedValue({ id: "icd-1" });
    await expect(svc.importVersion(TENANT, { version: "2026-01", codes: [] })).rejects.toThrow(ConflictException);
  });

  it("§79.2 validation fails unknown codes and deprecated codes", async () => {
    const { svc } = setup();
    (svc as any).prisma.icdCode.findFirst.mockResolvedValue(null);
    const r1 = await svc.validate(TENANT, "XX00");
    expect(r1.valid).toBe(false);

    (svc as any).prisma.icdCode.findFirst.mockResolvedValue({
      code: "OLD1", display: "Old term", version: "2025-01", isActive: false, deprecatedAt: new Date(Date.now() - 1000),
    });
    const r2 = await svc.validate(TENANT, "OLD1");
    expect(r2.valid).toBe(false);
    expect(r2.reason).toMatch(/deprecated/i);
  });

  it("§79.3 coding pins the terminology version onto the diagnosis", async () => {
    const { svc, prisma } = setup();
    (svc as any).prisma.diagnosis.findFirst.mockResolvedValue({ id: "dx-1", name: "Fever" });
    (svc as any).prisma.icdCode.findFirst.mockResolvedValue({
      code: "1A00", display: "Cholera", version: "2026-01", isActive: true, deprecatedAt: null,
    });
    const dx = await svc.codeDiagnosis(TENANT, "dx-1", { icd11Code: "1A00" });
    expect(dx.icd11Version).toBe("2026-01");
    expect(prisma.diagnosis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ icd11Code: "1A00", icd11Display: "Cholera", icd11Version: "2026-01" }) }),
    );
  });

  it("§79 coding with an invalid code is refused", async () => {
    const { svc } = setup();
    (svc as any).prisma.diagnosis.findFirst.mockResolvedValue({ id: "dx-1" });
    (svc as any).prisma.icdCode.findFirst.mockResolvedValue(null);
    await expect(svc.codeDiagnosis(TENANT, "dx-1", { icd11Code: "BAD" })).rejects.toThrow(ConflictException);
  });
});

// ================= §84/§89 Gateway =================

describe("Interop gateway (§84/§89)", () => {
  function setup(adapterConfig: any = null) {
    const prisma = makePrisma();
    const rules = makeRules(prisma);
    if (adapterConfig !== null) {
      jest.spyOn(rules, "resolveOrNull").mockResolvedValue(adapterConfig as any);
    }
    const svc = new InteropGatewayService(prisma, rules);
    (svc as any).transport = jest.fn().mockResolvedValue({ ok: false, failureClass: "TRANSIENT", message: "test transport" });
    return { svc, prisma, rules };
  }

  it("§89 enqueue is idempotent on the same source event", async () => {
    const { svc, prisma } = setup();
    const existing = { id: "txn-0", status: "PENDING" };
    (svc as any).prisma.interopTransaction.findUnique.mockResolvedValue(existing);
    const res = await svc.enqueue(TENANT, {
      destination: "EWARS", purpose: "SURVEILLANCE", sourceModule: "encounters",
      sourceEntity: "Diagnosis", sourceEntityId: "dx-1", payload: { disease: "Dengue" },
    });
    expect(res.deduplicated).toBe(true);
    expect(prisma.interopTransaction.create).not.toHaveBeenCalled();
  });

  it("§80.5 validation failure never transmits and is classified VALIDATION", async () => {
    const { svc } = setup();
    (svc as any).prisma.interopTransaction.findFirst.mockResolvedValue({
      id: "txn-1", status: "PENDING", purpose: "SURVEILLANCE", destination: "EWARS",
      payload: { patientRef: "p1" }, // missing disease
    });
    const res = await svc.transmit(TENANT, "txn-1");
    expect(res.status).toBe("VALIDATION_FAILED");
  });

  it("§89 transient failures map to RETRY_PENDING and are retryable", async () => {
    const { svc } = setup();
    (svc as any).prisma.interopTransaction.findFirst
      .mockResolvedValueOnce({ id: "txn-2", status: "PENDING", purpose: "SURVEILLANCE", destination: "EWARS", payload: { disease: "Dengue", patientRef: "p1" } })
      .mockResolvedValue({ id: "txn-2", status: "VALIDATING", purpose: "SURVEILLANCE", destination: "EWARS", payload: { disease: "Dengue", patientRef: "p1" } });
    (svc as any).transport.mockResolvedValue({ ok: false, failureClass: "TRANSIENT", message: "endpoint down" });
    const res = await svc.transmit(TENANT, "txn-2");
    expect(res.status).toBe("RETRY_PENDING");
    const r2 = await svc.retry(TENANT, "txn-2");
    expect(r2.status).toBeDefined();
  });

  it("§89 distinct failure classes never collapse into one condition", async () => {
    const { svc } = setup();
    const base = { purpose: "SURVEILLANCE", destination: "EWARS", payload: { disease: "X", patientRef: "p1" } };
    const byId: Record<string, any> = {
      "txn-3": { id: "txn-3", status: "VALIDATING", ...base },
      "txn-4": { id: "txn-4", status: "VALIDATING", ...base },
      "txn-5": { id: "txn-5", status: "VALIDATING", ...base },
    };
    (svc as any).prisma.interopTransaction.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(byId[where.id] ?? null),
    );
    (svc as any).prisma.interopTransaction.update.mockImplementation(({ where, data }: any) =>
      Promise.resolve({ ...byId[where.id], ...data, status: data.status ?? byId[where.id].status }),
    );
    (svc as any).transport
      .mockResolvedValueOnce({ ok: false, failureClass: "BUSINESS_REJECTION", message: "bad payload content" })
      .mockResolvedValueOnce({ ok: false, failureClass: "AUTHORIZATION", message: "credentials rejected" })
      .mockResolvedValueOnce({ ok: false, failureClass: "DUPLICATE", message: "already received" });
    const r1 = await svc.transmit(TENANT, "txn-3");
    const r2 = await svc.transmit(TENANT, "txn-4");
    const r3 = await svc.transmit(TENANT, "txn-5");
    expect(r1.status).toBe("REJECTED");
    expect(r2.status).toBe("FAILED");
    expect(r3.status).toBe("ACKNOWLEDGED");
  });

  it("§84.3 reconciliation aggregates by status and flags outstanding", async () => {
    const { svc } = setup();
    (svc as any).prisma.interopTransaction.findMany.mockResolvedValue([
      { status: "ACKNOWLEDGED", purpose: "SURVEILLANCE", failureClass: null },
      { status: "RETRY_PENDING", purpose: "SURVEILLANCE", failureClass: "TRANSIENT" },
      { status: "VALIDATION_FAILED", purpose: "VITAL_EVENT", failureClass: "VALIDATION" },
    ]);
    const rec = await svc.reconciliation(TENANT, "EWARS");
    expect(rec.total).toBe(3);
    expect(rec.outstanding).toBe(1);
    expect(rec.unreconciled).toBe(1);
  });
});

// ================= §80 Surveillance =================

describe("Surveillance (§80)", () => {
  function setup() {
    const prisma = makePrisma();
    const rules = makeRules(prisma);
    const gateway = new InteropGatewayService(prisma, rules);
    jest.spyOn(gateway, "enqueue").mockImplementation(async (_t, d) => ({ txn: { id: "txn-new", ...d }, deduplicated: false }));
    return { svc: new PublicHealthService(prisma, gateway, rules), prisma, rules };
  }

  it("§80.2 a new rule version supersedes the old", async () => {
    const { svc, prisma } = setup();
    (svc as any).prisma.surveillanceRule.findFirst.mockResolvedValue({ id: "sr-old", ruleVersion: 2 });
    const rule = await svc.upsertSurveillanceRule(TENANT, { diseaseName: "Dengue", urgency: "IMMEDIATE" });
    expect(rule.ruleVersion).toBe(3);
    expect(prisma.surveillanceRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
    );
  });

  it("§80.1/§80.3 a matching diagnosis creates an EWARS transaction with origin recorded", async () => {
    const { svc } = setup();
    (svc as any).prisma.surveillanceRule.findMany.mockResolvedValue([
      { id: "sr-1", diseaseName: "Dengue", triggerIcd10: "A90", urgency: "IMMEDIATE", destination: "EWARS", ruleVersion: 1 },
    ]);
    const res = await svc.evaluateDiagnosis(TENANT, {
      diagnosisId: "dx-1", patientId: "p1", icd10Code: "A90", diagnosisName: "Dengue fever", origin: "CLINICIAN",
    });
    expect(res.matched).toEqual(["Dengue"]);
    expect(res.transactions[0].payload.trigger.origin).toBe("CLINICIAN");
    expect(res.transactions[0].payload.patientRef).toBe("p1");
    // §80.4 minimum necessary: no full chart in the payload
    expect(Object.keys(res.transactions[0].payload)).not.toContain("clinicalNotes");
  });

  it("§80.3 non-reportable diagnoses create nothing", async () => {
    const { svc } = setup();
    (svc as any).prisma.surveillanceRule.findMany.mockResolvedValue([
      { id: "sr-1", diseaseName: "Dengue", triggerIcd10: "A90", urgency: "DAILY", destination: "EWARS", ruleVersion: 1 },
    ]);
    const res = await svc.evaluateDiagnosis(TENANT, {
      diagnosisId: "dx-2", patientId: "p1", icd10Code: "J06", diagnosisName: "Common cold", origin: "AUTOMATIC",
    });
    expect(res.matched).toEqual([]);
    expect(res.transactions).toHaveLength(0);
  });
});

// ================= §81 Vital events =================

describe("Vital events (§81)", () => {
  function setup() {
    const prisma = makePrisma();
    const rules = makeRules(prisma);
    const gateway = new InteropGatewayService(prisma, rules);
    jest.spyOn(gateway, "enqueue").mockImplementation(async (_t, d) => ({ txn: { id: "txn-ve", ...d }, deduplicated: false }));
    return { svc: new PublicHealthService(prisma, gateway, rules), prisma, rules };
  }

  it("§81.1 birth registration is duplicate-prevented per patient", async () => {
    const { svc, prisma } = setup();
    const res1 = await svc.registerBirth(TENANT, { patientId: "p1", eventDateTime: new Date() });
    expect(res1.duplicatePrevented).toBe(false);
    (svc as any).prisma.vitalEvent.findFirst.mockResolvedValue({ id: "ve-0", eventType: "BIRTH" });
    const res2 = await svc.registerBirth(TENANT, { patientId: "p1", eventDateTime: new Date() });
    expect(res2.duplicatePrevented).toBe(true);
    expect(prisma.vitalEvent.create).toHaveBeenCalledTimes(1);
  });

  it("§81.2 certification requires a recorded cause of death", async () => {
    const { svc } = setup();
    (svc as any).prisma.vitalEvent.findFirst.mockResolvedValue({
      id: "ve-1", eventType: "DEATH", certificationStatus: "UNCERTIFIED", underlyingCause: null, immediateCause: null,
    });
    await expect(svc.certifyDeath(TENANT, "ve-1", "dr-1")).rejects.toThrow(ConflictException);
  });

  it("§81 submission before certification is refused", async () => {
    const { svc } = setup();
    (svc as any).prisma.vitalEvent.findFirst.mockResolvedValue({
      id: "ve-2", eventType: "DEATH", certificationStatus: "UNCERTIFIED", causeOfDeathIcd11: "1A00", registrationStatus: "NOT_SUBMITTED",
    });
    await expect(svc.submitVitalEvent(TENANT, "ve-2")).rejects.toThrow(ConflictException);
  });

  it("§81 submission requires the ICD-11 cause-of-death code", async () => {
    const { svc } = setup();
    (svc as any).prisma.vitalEvent.findFirst.mockResolvedValue({
      id: "ve-3", eventType: "DEATH", certificationStatus: "CERTIFIED", causeOfDeathIcd11: null, registrationStatus: "NOT_SUBMITTED",
    });
    await expect(svc.submitVitalEvent(TENANT, "ve-3")).rejects.toThrow(/ICD-11/);
  });

  it("§81.3 a certified death with ICD-11 cause submits with lineage", async () => {
    const { svc } = setup();
    (svc as any).prisma.vitalEvent.findFirst.mockResolvedValue({
      id: "ve-4", eventType: "DEATH", certificationStatus: "CERTIFIED", causeOfDeathIcd11: "1A00",
      underlyingCause: "Cholera", registrationStatus: "NOT_SUBMITTED", patientId: "p1", amendments: [],
    });
    const res = await svc.submitVitalEvent(TENANT, "ve-4");
    expect(res.deduplicated).toBe(false);
    expect(res.txn.payload.causeOfDeathIcd11).toBe("1A00");
    expect(res.txn.lineage.chain).toContain("VitalEvent");
    expect(res.event.registrationStatus).toBe("SUBMITTED");
  });
});

// ================= §82 Blood chain =================

describe("Blood chain (§82)", () => {
  function setup(ruleConfig: any) {
    const prisma = makePrisma();
    const rules = makeRules(prisma);
    if (ruleConfig !== null) {
      jest.spyOn(rules, "resolveOrNull").mockImplementation(async (_t, key) => ({
        ruleId: `rule-${key}`, ruleKey: key, version: 1, config: ruleConfig, effectiveFrom: new Date(), authority: "MoHP", legalReference: null,
      }));
    }
    return { svc: new BloodChainService(prisma, rules), prisma, rules };
  }

  it("§82.4 ABO-incompatible COMPATIBLE result is refused (hard safety net)", async () => {
    const { svc } = setup(null);
    (svc as any).prisma.bloodUnit.findFirst.mockResolvedValue({ id: "u1", bloodGroup: "A+", component: "PACKED_RBC" });
    await expect(
      svc.recordCrossmatch(TENANT, { patientId: "p1", unitId: "u1", patientGroup: "O-", result: "COMPATIBLE" }),
    ).rejects.toThrow(ConflictException);
  });

  it("§82.4 compatible crossmatch is recorded", async () => {
    const { svc } = setup(null);
    (svc as any).prisma.bloodUnit.findFirst.mockResolvedValue({ id: "u1", bloodGroup: "O-", component: "PACKED_RBC" });
    const xm = await svc.recordCrossmatch(TENANT, { patientId: "p1", unitId: "u1", patientGroup: "O-", result: "COMPATIBLE" });
    expect(xm.result).toBe("COMPATIBLE");
    expect(xm.donorGroup).toBe("O_NEG"); // canonical enum spelling
  });

  it("§82.4 issue gate: rule on + no valid crossmatch blocks the issue", async () => {
    const { svc } = setup({ required: true });
    (svc as any).prisma.bloodCrossmatch.findFirst.mockResolvedValue(null);
    await expect(svc.assertIssueAllowed(TENANT, "u1", "p1")).rejects.toThrow(ConflictException);
  });

  it("§82.4 issue gate: valid COMPATIBLE crossmatch allows the issue", async () => {
    const { svc } = setup({ required: true });
    (svc as any).prisma.bloodCrossmatch.findFirst.mockResolvedValue({ id: "xm-1", result: "COMPATIBLE" });
    const res = await svc.assertIssueAllowed(TENANT, "u1", "p1");
    expect(res.allowed).toBe(true);
    expect(res.crossmatchId).toBe("xm-1");
  });

  it("§82.5 transfusion only from ISSUED units", async () => {
    const { svc } = setup(null);
    (svc as any).prisma.bloodUnit.findFirst.mockResolvedValue({ id: "u2", status: "AVAILABLE" });
    await expect(
      svc.recordTransfusion(TENANT, { patientId: "p1", unitId: "u2" }),
    ).rejects.toThrow(ConflictException);
  });

  it("§82.6 bedside scan mismatch refuses the transfusion", async () => {
    const { svc } = setup(null);
    (svc as any).prisma.bloodUnit.findFirst.mockResolvedValue({ id: "u3", status: "ISSUED" });
    await expect(
      svc.recordTransfusion(TENANT, { patientId: "p1", unitId: "u3", bedsideScan: { matched: false } }),
    ).rejects.toThrow(ConflictException);
  });

  it("§82.7 a reaction quarantines the unit and raises a CRITICAL exception", async () => {
    const { svc, prisma, rules } = setup(null);
    const logException = jest.spyOn(rules, "logException").mockResolvedValue(undefined as any);
    (svc as any).prisma.bloodTransfusion.findFirst.mockResolvedValue({
      id: "tf-1", unitId: "u4", patientId: "p1", reaction: null,
    });
    await svc.recordReaction(TENANT, "tf-1", { reaction: "Febrile", severity: "MODERATE" });
    expect(prisma.bloodUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "QUARANTINED" } }),
    );
    expect(logException).toHaveBeenCalledWith(TENANT, "TRANSFUSION_REACTION", expect.anything(), expect.anything(), "p1", "CRITICAL");
  });
});

// ================= §83 Waste =================

describe("Waste ledger (§83)", () => {
  function setup() {
    const prisma = makePrisma();
    const rules = makeRules(prisma);
    return { svc: new WasteService(prisma, rules), prisma };
  }

  it("§83.1 unknown categories are refused (config-driven list)", async () => {
    const { svc } = setup();
    await expect(
      svc.recordEntry(TENANT, { entryDate: new Date(), department: "Ward A", category: "MAGIC", weightKg: 1 }),
    ).rejects.toThrow(BadRequestException);
    expect(WASTE_CATEGORIES).toContain("SHARPS");
  });

  it("§83.2 same-day re-entry corrects the weight and appends the trail", async () => {
    const { svc, prisma } = setup();
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    (svc as any).prisma.wasteLedgerEntry.findFirst.mockResolvedValue({
      id: "wl-1", weightKg: 2, custodyTrail: [{ action: "GENERATED" }],
    });
    const e = await svc.recordEntry(TENANT, { entryDate: day, department: "Ward A", category: "SHARPS", weightKg: 5 });
    expect(Number(e.weightKg)).toBe(5);
    expect(e.custodyTrail).toHaveLength(2);
    expect(prisma.wasteLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("§83.3 custody transitions are timestamped and attributed", async () => {
    const { svc } = setup();
    (svc as any).prisma.wasteLedgerEntry.findFirst.mockResolvedValue({ id: "wl-2", custodyTrail: [] });
    const e = await svc.custodyTransition(TENANT, "wl-2", { action: "COLLECTED", by: "staff-1" });
    const trail = e.custodyTrail as any[];
    expect(trail[0].action).toBe("COLLECTED");
    expect(trail[0].by).toBe("staff-1");
    expect(trail[0].at).toBeTruthy();
    expect(e.collectedAt).toBeTruthy();
  });

  it("§83.4 manifest lifecycle enforces status order", async () => {
    const { svc } = setup();
    (svc as any).prisma.wasteManifest.findFirst
      .mockResolvedValueOnce({ id: "wm-1", status: "PREPARED" })
      .mockResolvedValueOnce({ id: "wm-1", status: "CONFIRMED" });
    await svc.dispatchManifest(TENANT, "wm-1");
    await expect(svc.dispatchManifest(TENANT, "wm-1")).rejects.toThrow(ConflictException);
  });

  it("§83.5 exception monitoring flags uncollected waste", async () => {
    const { svc } = setup();
    (svc as any).prisma.wasteLedgerEntry.findMany
      .mockResolvedValueOnce([
        { department: "Ward A", entryDate: new Date(), weightKg: 1, collectedAt: null, manifestId: null, custodyTrail: [] },
      ])
      .mockResolvedValueOnce([]);
    const res = await svc.exceptions(TENANT);
    expect(res.exceptions.some((x) => x.kind === "UNCOLLECTED_WASTE")).toBe(true);
    expect(res.exceptions.some((x) => x.kind === "AWAITING_MANIFEST")).toBe(true);
  });

  it("§83.6 inspection dashboard aggregates by ward, category, and day", async () => {
    const { svc } = setup();
    (svc as any).prisma.wasteLedgerEntry.findMany.mockResolvedValue([
      { entryDate: new Date(), department: "Ward A", category: "SHARPS", weightKg: 3, treatmentMethod: "AUTOCLAVE", disposalMethod: null, manifestId: "wm-1" },
      { entryDate: new Date(), department: "OT", category: "INFECTIOUS", weightKg: 6, treatmentMethod: null, disposalMethod: null, manifestId: null },
    ]);
    (svc as any).prisma.wasteManifest.count.mockResolvedValue(1);
    const dash = await svc.inspectionDashboard(TENANT);
    expect(dash.totalKg).toBe(9);
    expect(dash.byDepartment["Ward A"]).toBe(3);
    expect(dash.byCategory["INFECTIOUS"]).toBe(6);
    expect(dash.treatedKg).toBe(3);
  });
});
