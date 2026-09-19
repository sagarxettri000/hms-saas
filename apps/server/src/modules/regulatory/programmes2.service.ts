import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "../regulatory/regulatory-rule.service";

/**
 * Programme-resilience engine (spec §1–45 gaps):
 *  - §24 unified government-programme ledger (append-oriented, reversal-based)
 *  - §4.1 operational (auto-derived) MSS compliance from live operational data
 *  - §12/§37 disaster deferred transactions (service capture now, billing later)
 *
 * Rule-driven: thresholds come from effective-dated RegulatoryRules, never
 * hardcoded (§2.1). Financial truth stays in central billing — this ledger
 * only tracks programme benefit utilization (§2.5).
 */

const DEFAULT_AUTO_COMPLIANCE = {
  staffingRatioThreshold: 2.0, // active clinical staff per operational bed
  medicineAvailabilityMinPct: 80, // % of tracked essentials in stock
  bloodUnitsMin: 4, // available units on hand
  wasteLedgerGraceDays: 1, // days before a missing daily entry counts
};

@Injectable()
export class Programmes2Service {
  constructor(
    private prisma: PrismaService,
    private rules: RegulatoryRuleService,
  ) {}

  // ------------------------------------------------------------------
  // §24 Unified government-programme ledger
  // ------------------------------------------------------------------

  /** Open a ledger entry for an approved benefit. Invariant: remaining = approved. */
  async openLedgerEntry(
    tenantId: string,
    data: {
      programme: string;
      programmeVersion?: string;
      patientId?: string;
      encounterId?: string;
      eligibilityCaseId?: string;
      benefitType: string;
      approvalRef?: string;
      approvedAmount: number;
      createdBy?: string;
    },
  ) {
    if (data.approvedAmount < 0) {
      throw new ConflictException("approvedAmount must be >= 0");
    }
    const entry = await this.prisma.governmentProgrammeLedger.create({
      data: {
        tenantId,
        programme: data.programme,
        programmeVersion: data.programmeVersion ?? null,
        patientId: data.patientId ?? null,
        encounterId: data.encounterId ?? null,
        eligibilityCaseId: data.eligibilityCaseId ?? null,
        benefitType: data.benefitType,
        approvalRef: data.approvalRef ?? null,
        approvedAmount: data.approvedAmount,
        remainingAmount: data.approvedAmount,
        createdBy: data.createdBy ?? null,
      },
    });
    await this.rules.logEvent(tenantId, "PROGRAMME_LEDGER_OPENED", "GovernmentProgrammeLedger", entry.id, {
      programme: data.programme,
      approvedAmount: data.approvedAmount,
    });
    return entry;
  }

  /** Record utilization against an entry. Invariant: utilized ≤ approved (reversals aside). */
  async utilizeLedger(
    tenantId: string,
    entryId: string,
    data: { amount: number; invoiceLineId?: string; serviceRef?: string; inventoryTxnId?: string },
  ) {
    const entry = await this.prisma.governmentProgrammeLedger.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) throw new NotFoundException("Ledger entry not found");
    if (entry.status !== "ACTIVE") {
      throw new ConflictException(`Ledger entry is ${entry.status}; utilization blocked`);
    }
    const utilized = Number(entry.utilizedAmount) + data.amount;
    const reversed = Number(entry.reversedAmount);
    if (utilized > Number(entry.approvedAmount) + reversed) {
      throw new ConflictException(
        `Utilization ${utilized} would exceed approved ${Number(entry.approvedAmount)} (+reversed ${reversed})`,
      );
    }
    if (utilized < 0) throw new ConflictException("Utilized amount cannot go negative");

    const updated = await this.prisma.governmentProgrammeLedger.update({
      where: { id: entryId },
      data: {
        utilizedAmount: utilized,
        remainingAmount: Number(entry.approvedAmount) + reversed - utilized,
        invoiceLineId: data.invoiceLineId ?? entry.invoiceLineId,
        serviceRef: data.serviceRef ?? entry.serviceRef,
        inventoryTxnId: data.inventoryTxnId ?? entry.inventoryTxnId,
      },
    });
    await this.rules.logEvent(tenantId, "PROGRAMME_LEDGER_UTILIZED", "GovernmentProgrammeLedger", entryId, {
      amount: data.amount,
      remaining: updated.remainingAmount,
    });
    return updated;
  }

  /** Record a government claim against utilized amounts. claimed ≤ utilized. */
  async claimLedger(tenantId: string, entryId: string, data: { amount: number; governmentReference?: string }) {
    const entry = await this.prisma.governmentProgrammeLedger.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) throw new NotFoundException("Ledger entry not found");
    const claimed = Number(entry.claimedAmount) + data.amount;
    if (claimed > Number(entry.utilizedAmount)) {
      throw new ConflictException(`Claim ${claimed} exceeds utilized ${Number(entry.utilizedAmount)}`);
    }
    const updated = await this.prisma.governmentProgrammeLedger.update({
      where: { id: entryId },
      data: {
        claimedAmount: claimed,
        governmentReference: data.governmentReference ?? entry.governmentReference,
      },
    });
    await this.rules.logEvent(tenantId, "PROGRAMME_LEDGER_CLAIMED", "GovernmentProgrammeLedger", entryId, {
      claimedAmount: claimed,
    });
    return updated;
  }

  /** Record government payment. paid ≤ claimed. */
  async payLedger(tenantId: string, entryId: string, data: { amount: number }) {
    const entry = await this.prisma.governmentProgrammeLedger.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) throw new NotFoundException("Ledger entry not found");
    const paid = Number(entry.paidAmount) + data.amount;
    if (paid > Number(entry.claimedAmount)) {
      throw new ConflictException(`Payment ${paid} exceeds claimed ${Number(entry.claimedAmount)}`);
    }
    const updated = await this.prisma.governmentProgrammeLedger.update({
      where: { id: entryId },
      data: {
        paidAmount: paid,
        status: paid >= Number(entry.claimedAmount) && claimedGreaterThanZero(Number(entry.claimedAmount)) ? "SETTLED" : entry.status,
      },
    });
    await this.rules.logEvent(tenantId, "PROGRAMME_LEDGER_PAID", "GovernmentProgrammeLedger", entryId, {
      paidAmount: paid,
    });
    return updated;
  }

  /** Authorized reversal — new remaining flows from reversed amounts; never a destructive edit. */
  async reverseLedger(tenantId: string, entryId: string, data: { amount: number; reason: string }) {
    if (!data.reason || !data.reason.trim()) {
      throw new ConflictException("Reversal requires a reason");
    }
    const entry = await this.prisma.governmentProgrammeLedger.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) throw new NotFoundException("Ledger entry not found");
    const utilized = Number(entry.utilizedAmount);
    const reversed = Number(entry.reversedAmount);
    const reverseAmount = Math.min(data.amount, utilized - reversed);
    if (reverseAmount <= 0) {
      throw new ConflictException("Nothing left to reverse on this entry");
    }
    const updated = await this.prisma.governmentProgrammeLedger.update({
      where: { id: entryId },
      data: {
        reversedAmount: reversed + reverseAmount,
        remainingAmount: Number(entry.approvedAmount) - (utilized - (reversed + reverseAmount)),
        status: "ADJUSTED",
      },
    });
    await this.rules.logEvent(tenantId, "PROGRAMME_LEDGER_REVERSED", "GovernmentProgrammeLedger", entryId, {
      reversedAmount: reverseAmount,
      reason: data.reason,
    });
    return updated;
  }

  async listLedger(
    tenantId: string,
    filters: { programme?: string; patientId?: string; status?: string },
  ) {
    return this.prisma.governmentProgrammeLedger.findMany({
      where: {
        tenantId,
        programme: filters.programme || undefined,
        patientId: filters.patientId || undefined,
        status: filters.status || undefined,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  // ------------------------------------------------------------------
  // §4.1 Operational (auto-derived) MSS compliance
  // ------------------------------------------------------------------

  private async autoComplianceConfig(tenantId: string) {
    const resolved = await this.rules.resolveOrNull<{ staffingRatioThreshold?: number; medicineAvailabilityMinPct?: number; bloodUnitsMin?: number; wasteLedgerGraceDays?: number }>(
      tenantId,
      "MSS_AUTO_COMPLIANCE",
    );
    if (resolved?.config && typeof resolved.config === "object") {
      return { ...DEFAULT_AUTO_COMPLIANCE, ...resolved.config };
    }
    // rule absent → defaults (rule-driven with sensible fallback, §2.1)
    return DEFAULT_AUTO_COMPLIANCE;
  }

  /**
   * Derive compliance signals from live operational data for the standards
   * whose measurementMethod is tagged "OPERATIONAL:<signal>". Returns the
   * machine evidence; does NOT self-mark COMPLIANT — an officer still records
   * the assessment, but now with system-derived proof attached (§4.1 keeps
   * manual assessment for what cannot be derived).
   */
  async deriveOperationalCompliance(tenantId: string, facilityLevel: string) {
    const cfg = await this.autoComplianceConfig(tenantId);
    const set = await this.prisma.mssStandardSet.findFirst({
      where: { tenantId, facilityLevel, status: "ACTIVE" },
      orderBy: { effectiveFrom: "desc" },
      include: { standards: { where: { status: "ACTIVE" } } },
    });
    if (!set) throw new NotFoundException(`No active MSS set for facility level ${facilityLevel}`);

    const signals: Record<string, { value: number; threshold: number; pass: boolean; detail: any }> = {};

    // Staffing: active clinical staff vs operational beds
    const [activeStaff, operationalBeds] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, isActive: true, status: "ACTIVE" } }),
      this.prisma.bed.count({ where: { tenantId, isActive: true, status: { notIn: ["BLOCKED", "MAINTENANCE"] } } }),
    ]);
    const ratio = operationalBeds > 0 ? activeStaff / operationalBeds : activeStaff > 0 ? 99 : 0;
    signals.staffing = {
      value: Math.round(ratio * 100) / 100,
      threshold: cfg.staffingRatioThreshold,
      pass: ratio >= cfg.staffingRatioThreshold,
      detail: { activeStaff, operationalBeds },
    };

    // Medicine availability: % of active medicine items in stock above zero
    const [inStock, totalMedicines] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { tenantId, isActive: true, currentStock: { gt: 0 } } }),
      this.prisma.inventoryItem.count({ where: { tenantId, isActive: true } }),
    ]);
    const medPct = totalMedicines > 0 ? (inStock / totalMedicines) * 100 : 0;
    signals.medicine_availability = {
      value: Math.round(medPct * 10) / 10,
      threshold: cfg.medicineAvailabilityMinPct,
      pass: medPct >= cfg.medicineAvailabilityMinPct,
      detail: { inStock, totalMedicines },
    };

    // Blood-bank availability
    const availableUnits = await this.prisma.bloodUnit.count({
      where: { tenantId, status: "AVAILABLE" },
    });
    signals.blood_availability = {
      value: availableUnits,
      threshold: cfg.bloodUnitsMin,
      pass: availableUnits >= cfg.bloodUnitsMin,
      detail: { availableUnits },
    };

    // Waste-ledger continuity: every recent day (minus grace) has ≥1 entry
    const since = new Date(Date.now() - 7 * 86400000);
    const wasteDays = await this.prisma.wasteLedgerEntry.groupBy({
      by: ["entryDate"],
      where: { tenantId, entryDate: { gte: since } },
      _count: { _all: true },
    });
    const dayKeys = new Set(wasteDays.map((d) => d.entryDate.toISOString().slice(0, 10)));
    let expected = 0;
    let present = 0;
    for (let i = cfg.wasteLedgerGraceDays; i < 7; i++) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      expected++;
      if (dayKeys.has(day)) present++;
    }
    signals.waste_ledger_continuity = {
      value: expected > 0 ? Math.round((present / expected) * 100) : 100,
      threshold: 100,
      pass: present === expected,
      detail: { present, expected },
    };

    // Map signals onto tagged standards: measurementMethod === "OPERATIONAL:<signal>"
    const tagged = set.standards.filter((s) => s.scoringMethod?.startsWith("OPERATIONAL:"));
    const derived = tagged.map((s) => {
      const key = (s.scoringMethod || "").slice("OPERATIONAL:".length);
      const signal = signals[key];
      return {
        standardId: s.id,
        standardCode: s.standardCode,
        signal: key,
        available: !!signal,
        pass: signal?.pass ?? false,
        value: signal?.value ?? null,
        threshold: signal?.threshold ?? null,
      };
    });

    return {
      setId: set.id,
      setName: set.setName,
      facilityLevel,
      signals,
      derived,
      derivedAt: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------------
  // §12 / §37 Disaster deferred transactions
  // ------------------------------------------------------------------

  /** Capture a service rendered during an active disaster without billing. */
  async recordDeferredService(
    tenantId: string,
    data: {
      activationId: string;
      casualtyId?: string;
      tempPatientId?: string;
      patientId?: string;
      serviceCode: string;
      description?: string;
      quantity?: number;
      clinicianRef?: string;
      location?: string;
      amount?: number;
      createdBy?: string;
    },
  ) {
    const activation = await this.prisma.disasterActivation.findFirst({
      where: { id: data.activationId, tenantId },
    });
    if (!activation) throw new NotFoundException("Disaster activation not found");
    if (!activation.isActive) {
      // Stand-down blocks new deferred capture — post-incident services go
      // through normal registration/billing (§37: services during disaster
      // must be capturable, but the incident must be ACTIVE at capture time).
      throw new ConflictException("Disaster activation is not active; use normal billing");
    }
    if (!data.tempPatientId && !data.patientId && !data.casualtyId) {
      throw new ConflictException("Deferred service requires tempPatientId, patientId, or casualtyId");
    }
    const txn = await this.prisma.disasterDeferredTransaction.create({
      data: {
        tenantId,
        activationId: data.activationId,
        casualtyId: data.casualtyId ?? null,
        tempPatientId: data.tempPatientId ?? null,
        patientId: data.patientId ?? null,
        serviceCode: data.serviceCode,
        description: data.description ?? null,
        quantity: data.quantity ?? 1,
        clinicianRef: data.clinicianRef ?? null,
        location: data.location ?? null,
        amount: data.amount ?? null,
        createdBy: data.createdBy ?? null,
      },
    });
    await this.rules.logEvent(tenantId, "DISASTER_SERVICE_DEFERRED", "DisasterDeferredTransaction", txn.id, {
      serviceCode: data.serviceCode,
      activationId: data.activationId,
    });
    return txn;
  }

  /**
   * Reconcile deferred transactions into a real encounter/invoice after
   * identification (§12: identity → encounter linking → bill generation).
   * Idempotent per transaction: RECONCILED rows are refused.
   */
  async reconcileDeferred(
    tenantId: string,
    data: { transactionIds: string[]; encounterId: string; patientId?: string; invoiceId?: string; reconciledBy?: string },
  ) {
    if (!data.transactionIds.length) {
      throw new ConflictException("No transactions selected for reconciliation");
    }
    const rows = await this.prisma.disasterDeferredTransaction.findMany({
      where: { id: { in: data.transactionIds }, tenantId },
    });
    if (rows.length !== data.transactionIds.length) {
      throw new NotFoundException("One or more deferred transactions not found");
    }
    const blocked = rows.filter((r) => r.status !== "PENDING");
    if (blocked.length) {
      throw new ConflictException(
        `${blocked.length} transaction(s) are ${blocked.map((b) => b.status).join(",")}; only PENDING rows reconcile`,
      );
    }
    const updated = await this.prisma.disasterDeferredTransaction.updateMany({
      where: { id: { in: data.transactionIds }, tenantId, status: "PENDING" },
      data: {
        status: "RECONCILED",
        encounterId: data.encounterId,
        patientId: data.patientId ?? undefined,
        invoiceId: data.invoiceId ?? undefined,
        reconciledAt: new Date(),
        reconciledBy: data.reconciledBy ?? null,
      },
    });
    await this.rules.logEvent(tenantId, "DISASTER_DEFERRED_RECONCILED", "DisasterDeferredTransaction", data.transactionIds.join(","), {
      count: updated.count,
      encounterId: data.encounterId,
    });
    return { reconciled: updated.count };
  }

  /** Authorized write-off for unrecoverable deferred services (audit-reasoned). */
  async writeOffDeferred(
    tenantId: string,
    transactionId: string,
    data: { reason: string; approvedBy?: string },
  ) {
    if (!data.reason || !data.reason.trim()) {
      throw new ConflictException("Write-off requires an authorized reason");
    }
    const row = await this.prisma.disasterDeferredTransaction.findFirst({
      where: { id: transactionId, tenantId },
    });
    if (!row) throw new NotFoundException("Deferred transaction not found");
    if (row.status !== "PENDING") {
      throw new ConflictException(`Transaction is ${row.status}; only PENDING rows can be written off`);
    }
    const updated = await this.prisma.disasterDeferredTransaction.update({
      where: { id: transactionId },
      data: {
        status: "WRITTEN_OFF",
        writeOffReason: data.reason,
        reconciledAt: new Date(),
        reconciledBy: data.approvedBy ?? null,
      },
    });
    await this.rules.logEvent(tenantId, "DISASTER_DEFERRED_WRITTEN_OFF", "DisasterDeferredTransaction", transactionId, {
      reason: data.reason,
      approvedBy: data.approvedBy,
    });
    return updated;
  }

  /** §27 Disaster command + finance view: pending deferred services per incident. */
  async deferredSummary(tenantId: string, activationId?: string) {
    const where = { tenantId, ...(activationId ? { activationId } : {}) };
    const [byStatus, pendingRows] = await Promise.all([
      this.prisma.disasterDeferredTransaction.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      this.prisma.disasterDeferredTransaction.findMany({
        where: { ...where, status: "PENDING" },
        select: { id: true, serviceCode: true, quantity: true, amount: true, serviceAt: true, tempPatientId: true, patientId: true },
        orderBy: { serviceAt: "asc" },
        take: 100,
      }),
    ]);
    return {
      counts: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      pending: pendingRows,
    };
  }
}

function claimedGreaterThanZero(n: number) {
  return n > 0;
}
