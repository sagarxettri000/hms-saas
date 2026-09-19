import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

/**
 * Nepal Regulatory, Social Care & Special Patient Management (spec §65).
 * All thresholds/amounts/percentages resolve from versioned rules — no
 * magic numbers in code (§65.17/§65.27/§65.45).
 */

// Rule keys (the VALUES live in the rules, never here).
export const RULE_KEYS = {
  FREE_BED: "free_bed_quota",
  SSU_SUBSIDY: "ssu_subsidy_matrix",
  BIPANNA: "bipanna_assistance",
  SENIOR: "senior_citizen",
  VIP: "vip_access_policy",
  PRIORITY: "queue_priority_order",
} as const;

export interface FreeBedRuleConfig {
  bedBase: number; // legally applicable bed base (not every physical bed)
  quotaPercent: number; // e.g. 10 for 10%
  roundingMode: "FLOOR" | "CEIL" | "ROUND"; // configured regulatory rounding (§65.3)
  warningThresholdPercent?: number; // e.g. 80 → warn before breach (§65.4)
}

export interface SeniorRuleConfig {
  minAge: number; // e.g. 60 (§65.27 — configured, not hard-coded)
}

@Injectable()
export class RegulatoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  // ------------------------------------------------------------------
  // Free-bed quota (§65.2–§65.4, §65.8–§65.9)
  // ------------------------------------------------------------------

  /** Required quota from the ACTIVE rule with configured rounding (§65.3). */
  async computeRequiredFreeBeds(tenantId: string): Promise<{
    required: number;
    bedBase: number;
    quotaPercent: number;
    warningThresholdPercent: number;
    ruleVersion: number;
  }> {
    const rule = await this.rules.resolve<FreeBedRuleConfig>(tenantId, RULE_KEYS.FREE_BED);
    const raw = (rule.config.bedBase * rule.config.quotaPercent) / 100;
    let required: number;
    switch (rule.config.roundingMode) {
      case "FLOOR": required = Math.floor(raw); break;
      case "CEIL": required = Math.ceil(raw); break;
      default: required = Math.round(raw);
    }
    return {
      required,
      bedBase: rule.config.bedBase,
      quotaPercent: rule.config.quotaPercent,
      warningThresholdPercent: rule.config.warningThresholdPercent ?? 80,
      ruleVersion: rule.version,
    };
  }

  async getFreeBedDashboard(tenantId: string) {
    const quota = await this.computeRequiredFreeBeds(tenantId);
    const [occupied, operationalBeds] = await Promise.all([
      this.prisma.freeBedAllocation.count({ where: { tenantId, status: "OCCUPIED" } }),
      this.prisma.bed.count({ where: { tenantId, status: { in: ["AVAILABLE", "OCCUPIED"] } } }),
    ]);
    const available = Math.max(0, quota.required - occupied);
    const utilizationPct = quota.required > 0 ? Math.round((occupied / quota.required) * 100) : 0;
    const compliant = occupied >= quota.required || available > 0;

    // §65.4: pre-breach warning threshold — the dashboard warns while the
    // program is still compliant but approaching the required quota.
    const warningThresholdPercent = quota.warningThresholdPercent ?? 80;
    const inWarning = compliant && occupied >= (quota.required * warningThresholdPercent) / 100;
    if (inWarning) {
      await this.rules.logException(
        tenantId,
        "FREE_BED_QUOTA_WARNING",
        { required: quota.required, occupied, available, thresholdPercent: warningThresholdPercent },
        `Free-bed quota nearing capacity: ${occupied}/${quota.required} engaged (threshold ${warningThresholdPercent}%)`,
      );
    }

    if (!compliant) {
      // §65.4: quota exception must be logged.
      await this.rules.logException(
        tenantId,
        "FREE_BED_QUOTA_EXCEPTION",
        { required: quota.required, occupied, available: 0 },
        `Free-bed quota exception: ${occupied}/${quota.required} occupied, none available`,
      );
    }

    return {
      applicableBeds: quota.bedBase,
      operationalBeds,
      requiredFreeBeds: quota.required,
      occupiedFreeBeds: occupied,
      availableFreeBeds: available,
      utilizationPercent: utilizationPct,
      complianceStatus: compliant ? "COMPLIANT" : "EXCEPTION",
      warningStatus: inWarning ? "WARNING" : compliant ? "OK" : "EXCEPTION",
      warningThresholdPercent,
      ruleVersion: quota.ruleVersion,
    };
  }

  /**
   * Assign an eligible patient to the free-bed program. Eligible → approved
   * → admitted are distinct states enforced by workflow (§65.8).
   */
  async assignFreeBed(
    tenantId: string,
    data: {
      patientId: string;
      encounterId?: string;
      admissionId?: string;
      bedId?: string;
      eligibilityBasis: string;
      verificationDocRef?: string;
      verificationAuthority?: string;
      createdBy?: string;
    },
  ) {
    const rule = await this.rules.resolve<FreeBedRuleConfig>(tenantId, RULE_KEYS.FREE_BED);
    const dashboard = await this.getFreeBedDashboard(tenantId);

    // §65.4: do not exceed the required quota — the quota is a legal
    // obligation, not a marketing pool. A failed assignment of an eligible
    // patient IS the compliance exception and must be logged.
    if (dashboard.occupiedFreeBeds >= dashboard.requiredFreeBeds) {
      await this.rules.logException(
        tenantId,
        "FREE_BED_QUOTA_EXCEPTION",
        { required: dashboard.requiredFreeBeds, occupied: dashboard.occupiedFreeBeds, patientId: data.patientId },
        `Eligible patient could not be admitted — free-bed quota exhausted (${dashboard.occupiedFreeBeds}/${dashboard.requiredFreeBeds})`,
        data.patientId,
      );
      throw new ConflictException(
        `Free-bed quota exhausted (${dashboard.occupiedFreeBeds}/${dashboard.requiredFreeBeds})`,
      );
    }

    const alloc = await this.prisma.freeBedAllocation.create({
      data: {
        tenantId,
        patientId: data.patientId,
        encounterId: data.encounterId,
        admissionId: data.admissionId,
        bedId: data.bedId,
        eligibilityBasis: data.eligibilityBasis,
        verificationDocRef: data.verificationDocRef,
        verificationAuthority: data.verificationAuthority,
        status: "OCCUPIED",
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        createdBy: data.createdBy,
      },
    });
    await this.rules.logEvent(tenantId, "FREE_BED_ASSIGNED", "FreeBedAllocation", alloc.id, {
      ruleVersion: rule.version,
    }, data.patientId, data.createdBy);
    await this.queueGovSync(tenantId, "FreeBedAllocation", alloc.id, data.createdBy);
    return alloc;
  }

  async releaseFreeBed(tenantId: string, allocationId: string, userId?: string) {
    const alloc = await this.prisma.freeBedAllocation.findFirst({
      where: { id: allocationId, tenantId },
    });
    if (!alloc) throw new NotFoundException("Free-bed allocation not found");
    if (alloc.status === "RELEASED") return alloc;
    const updated = await this.prisma.freeBedAllocation.update({
      where: { id: allocationId },
      data: { status: "RELEASED", dischargedAt: new Date() },
    });
    await this.rules.logEvent(tenantId, "FREE_BED_RELEASED", "FreeBedAllocation", allocationId, {}, alloc.patientId, userId);
    await this.queueGovSync(tenantId, "FreeBedAllocationRelease", allocationId, userId);
    return updated;
  }

  // ------------------------------------------------------------------
  // SSU (§65.10–§65.13)
  // ------------------------------------------------------------------

  async createSsuAssessment(
    tenantId: string,
    data: {
      patientId: string;
      encounterId?: string;
      invoiceId?: string;
      economicTier?: string;
      diseaseCategory?: string;
      treatmentCategory?: string;
      householdIncome?: number;
      assessmentNotes?: string;
      documents?: any;
      recommendedSubsidy?: number;
      totalBillAmount?: number;
      createdBy?: string;
    },
  ) {
    const rule = await this.rules.resolveOrNull<any>(tenantId, RULE_KEYS.SSU_SUBSIDY);
    // Cap the recommendation at the configured matrix ceiling (§65.11).
    let recommended = data.recommendedSubsidy ?? 0;
    if (rule && data.economicTier && data.diseaseCategory) {
      const row = (rule.config.rows ?? []).find(
        (r: any) => r.economicTier === data.economicTier && r.diseaseCategory === data.diseaseCategory,
      );
      if (row?.maxSubsidy != null && recommended > row.maxSubsidy) {
        recommended = row.maxSubsidy;
      }
    }
    const created = await this.prisma.ssuAssessment.create({
      data: {
        tenantId,
        patientId: data.patientId,
        encounterId: data.encounterId,
        invoiceId: data.invoiceId,
        economicTier: data.economicTier,
        diseaseCategory: data.diseaseCategory,
        treatmentCategory: data.treatmentCategory,
        householdIncome: data.householdIncome,
        assessmentNotes: data.assessmentNotes,
        documents: data.documents as any,
        recommendedSubsidy: recommended,
        totalBillAmount: data.totalBillAmount,
        status: "RECOMMENDED",
        recommendedBy: data.createdBy,
        recommendedAt: new Date(),
        ruleId: rule?.ruleId,
        ruleVersion: rule?.version,
        createdBy: data.createdBy,
      },
    });
    await this.rules.logEvent(tenantId, "SSU_ASSESSMENT_COMPLETED", "SsuAssessment", created.id, {}, data.patientId, data.createdBy);
    return created;
  }

  /** Committee decision (§65.12). Recommendation ≠ approval (SoD). */
  async decideSsuAssessment(
    tenantId: string,
    assessmentId: string,
    data: {
      decision: "APPROVED" | "REJECTED" | "RETURNED";
      members?: Array<{ userId: string; name?: string }>;
      approvedAmount?: number;
      reason?: string;
      decidedBy: string;
      governmentContribution?: number;
      hospitalContribution?: number;
      patientContribution?: number;
    },
  ) {
    const assessment = await this.prisma.ssuAssessment.findFirst({
      where: { id: assessmentId, tenantId },
    });
    if (!assessment) throw new NotFoundException("SSU assessment not found");
    if (["APPROVED", "REJECTED"].includes(assessment.status)) {
      throw new ConflictException(`Assessment already ${assessment.status}`);
    }
    // Segregation of duties: a recommender cannot sit on the deciding committee.
    const recommender = assessment.recommendedBy;
    if (recommender && (data.members ?? []).some((m) => m.userId === recommender)) {
      throw new ConflictException(
        "Segregation of duties: the assessor/recommender cannot approve their own recommendation",
      );
    }

    const decision = await this.prisma.ssuCommitteeDecision.create({
      data: {
        tenantId,
        assessmentId,
        members: (data.members ?? []) as any,
        decision: data.decision,
        approvedAmount: data.approvedAmount,
        reason: data.reason,
        decidedBy: data.decidedBy,
      },
    });

    if (data.decision === "APPROVED") {
      await this.prisma.ssuAssessment.update({
        where: { id: assessmentId },
        data: {
          status: "APPROVED",
          approvedSubsidy: data.approvedAmount ?? assessment.recommendedSubsidy ?? 0,
          governmentContribution: data.governmentContribution,
          hospitalContribution: data.hospitalContribution,
          patientContribution: data.patientContribution,
        },
      });
      const approved = Number(data.approvedAmount ?? assessment.recommendedSubsidy ?? 0);
      await this.recordSubsidyLedger(tenantId, {
        program: "SSU",
        ssuAssessmentId: assessmentId,
        patientId: assessment.patientId,
        invoiceId: assessment.invoiceId ?? undefined,
        entryType: "APPROVAL",
        amount: approved,
        funder: "SSU_COMMITTEE",
        createdBy: data.decidedBy,
      });
    } else {
      await this.prisma.ssuAssessment.update({
        where: { id: assessmentId },
        data: { status: data.decision },
      });
    }

    await this.rules.logEvent(
      tenantId,
      data.decision === "APPROVED" ? "SSU_SUBSIDY_APPROVED" : "SSU_SUBSIDY_REJECTED",
      "SsuAssessment",
      assessmentId,
      { approvedAmount: data.approvedAmount, reason: data.reason },
      assessment.patientId,
      data.decidedBy,
    );
    return decision;
  }

  // ------------------------------------------------------------------
  // Subsidy ledger (§65.13/§65.19/§65.50)
  // ------------------------------------------------------------------

  async recordSubsidyLedger(
    tenantId: string,
    data: {
      program: string;
      ssuAssessmentId?: string;
      bipannaCaseId?: string;
      patientId?: string;
      invoiceId?: string;
      entryType: "APPROVAL" | "UTILIZATION" | "REVERSAL" | "ADJUSTMENT" | "CLAIM" | "SETTLEMENT";
      amount: number;
      funder?: string;
      reference?: string;
      notes?: string;
      createdBy?: string;
    },
  ) {
    return this.prisma.subsidyLedgerEntry.create({
      data: {
        tenantId,
        program: data.program,
        ssuAssessmentId: data.ssuAssessmentId,
        bipannaCaseId: data.bipannaCaseId,
        patientId: data.patientId,
        invoiceId: data.invoiceId,
        entryType: data.entryType,
        amount: data.amount,
        funder: data.funder,
        reference: data.reference,
        notes: data.notes,
        createdBy: data.createdBy,
      },
    });
  }

  /** SSU bill reconciliation (§65.13): bill = gov + ssu + patient + other. */
  async reconcileSsu(tenantId: string, assessmentId: string) {
    const a = await this.prisma.ssuAssessment.findFirst({
      where: { id: assessmentId, tenantId },
    });
    if (!a) throw new NotFoundException("SSU assessment not found");
    const total = Number(a.totalBillAmount ?? 0);
    const gov = Number(a.governmentContribution ?? 0);
    const ssu = Number(a.approvedSubsidy ?? 0);
    const patient = Number(a.patientContribution ?? 0);
    const allocated = gov + ssu + patient;
    const unreconciled = total - allocated;
    if (Math.abs(unreconciled) > 0.009) {
      await this.rules.logException(
        tenantId,
        "SSU_UNRECONCILED",
        { assessmentId, total, allocated, unreconciled },
        `SSU bill unreconciled by ${unreconciled.toFixed(2)}`,
        a.patientId,
      );
    }
    return { total, government: gov, ssu, patient, unreconciled };
  }

  // ------------------------------------------------------------------
  // Bipanna Nagarik Kosh (§65.15–§65.19)
  // ------------------------------------------------------------------

  async createBipannaCase(
    tenantId: string,
    data: {
      patientId: string;
      diseaseCategory: string;
      diagnosis?: string;
      createdBy?: string;
    },
  ) {
    // Disease list + ceiling come from the ACTIVE rule (§65.15/§65.17).
    const rule = await this.rules.resolve<any>(tenantId, RULE_KEYS.BIPANNA);
    const cat = (rule.config.diseases ?? []).find((d: any) => d.category === data.diseaseCategory);
    if (!cat) {
      throw new ConflictException(
        `Disease category "${data.diseaseCategory}" is not in the active Bipanna program rule`,
      );
    }

    const caseNumber = await this.generateBipannaNumber(tenantId);
    const created = await this.prisma.bipannaCase.create({
      data: {
        tenantId,
        caseNumber,
        patientId: data.patientId,
        diseaseCategory: data.diseaseCategory,
        diagnosis: data.diagnosis,
        status: "ACTIVE",
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        createdBy: data.createdBy,
      },
    });
    await this.rules.logEvent(tenantId, "BIPANNA_CASE_CREATED", "BipannaCase", created.id, {
      diseaseCategory: data.diseaseCategory,
      ruleVersion: rule.version,
    }, data.patientId, data.createdBy);
    return created;
  }

  /** Approve assistance (ceiling enforced from the rule, §65.17). */
  async approveBipannaAssistance(
    tenantId: string,
    caseId: string,
    amount: number,
    userId?: string,
  ) {
    const bc = await this.prisma.bipannaCase.findFirst({ where: { id: caseId, tenantId } });
    if (!bc) throw new NotFoundException("Bipanna case not found");
    if (bc.status !== "ACTIVE") throw new ConflictException("Case is closed");

    const rule = await this.rules.resolve<any>(tenantId, RULE_KEYS.BIPANNA);
    const cat = (rule.config.diseases ?? []).find((d: any) => d.category === bc.diseaseCategory);
    const ceiling = cat?.maxAmount;
    if (ceiling != null && amount > ceiling) {
      throw new ConflictException(
        `Assistance ${amount} exceeds the configured ceiling ${ceiling} for ${bc.diseaseCategory}`,
      );
    }

    const updated = await this.prisma.bipannaCase.update({
      where: { id: caseId },
      data: { approvedAmount: amount },
    });
    await this.recordSubsidyLedger(tenantId, {
      program: "BIPANNA",
      bipannaCaseId: caseId,
      patientId: bc.patientId,
      entryType: "APPROVAL",
      amount,
      funder: "BIPANNA_NAGARIK_KOSH",
      createdBy: userId,
    });
    await this.rules.logEvent(tenantId, "BIPANNA_ASSISTANCE_APPROVED", "BipannaCase", caseId, { amount }, bc.patientId, userId);
    return updated;
  }

  /** Utilization against the approved amount — over-utilization blocked (§65.18). */
  async utilizeBipannaAssistance(
    tenantId: string,
    caseId: string,
    amount: number,
    reference?: string,
    userId?: string,
  ) {
    const bc = await this.prisma.bipannaCase.findFirst({ where: { id: caseId, tenantId } });
    if (!bc) throw new NotFoundException("Bipanna case not found");
    const remaining = Number(bc.approvedAmount) - Number(bc.utilizedAmount);
    if (amount > remaining) {
      throw new ConflictException(
        `Utilization ${amount} exceeds remaining assistance ${remaining} (approved ${bc.approvedAmount})`,
      );
    }
    const updated = await this.prisma.bipannaCase.update({
      where: { id: caseId },
      data: { utilizedAmount: { increment: amount } },
    });
    await this.recordSubsidyLedger(tenantId, {
      program: "BIPANNA",
      bipannaCaseId: caseId,
      patientId: bc.patientId,
      entryType: "UTILIZATION",
      amount,
      reference,
      createdBy: userId,
    });
    await this.rules.logEvent(tenantId, "BIPANNA_ASSISTANCE_UTILIZED", "BipannaCase", caseId, { amount, reference }, bc.patientId, userId);
    return updated;
  }

  /** Claim lifecycle: prepare → submit → approve/reject → settle (§65.19). */
  async submitBipannaClaim(
    tenantId: string,
    caseId: string,
    amount: number,
    userId?: string,
  ) {
    const bc = await this.prisma.bipannaCase.findFirst({ where: { id: caseId, tenantId } });
    if (!bc) throw new NotFoundException("Bipanna case not found");
    const utilized = Number(bc.utilizedAmount);
    if (amount > utilized) {
      throw new ConflictException(
        `Claim ${amount} exceeds utilized assistance ${utilized}`,
      );
    }
    const claimNumber = await this.generateBipannaClaimNumber(tenantId);
    const [claim, updated] = await this.prisma.$transaction([
      this.prisma.bipannaClaim.create({
        data: {
          tenantId,
          caseId,
          claimNumber,
          amount,
          patientId: bc.patientId,
          status: "SUBMITTED",
          submittedBy: userId,
        },
      }),
      this.prisma.bipannaCase.update({
        where: { id: caseId },
        data: { claimedAmount: { increment: amount } },
      }),
    ]);
    await this.recordSubsidyLedger(tenantId, {
      program: "BIPANNA",
      bipannaCaseId: caseId,
      patientId: bc.patientId,
      entryType: "CLAIM",
      amount,
      reference: claimNumber,
      createdBy: userId,
    });
    await this.queueGovSync(tenantId, "BipannaClaim", caseId, userId, { amount });
    await this.rules.logEvent(tenantId, "GOVERNMENT_CLAIM_SUBMITTED", "BipannaClaim", claim.id, { amount }, bc.patientId, userId);
    return { claim, case: updated };
  }

  async settleBipannaClaim(
    tenantId: string,
    caseId: string,
    data: { approvedClaim: number; received: number; rejected: number; userId?: string; claimId?: string },
  ) {
    const bc = await this.prisma.bipannaCase.findFirst({ where: { id: caseId, tenantId } });
    if (!bc) throw new NotFoundException("Bipanna case not found");
    const updated = await this.prisma.$transaction([
      this.prisma.bipannaCase.update({
        where: { id: caseId },
        data: {
          approvedClaimAmount: { increment: data.approvedClaim },
          receivedAmount: { increment: data.received },
          rejectedAmount: { increment: data.rejected },
        },
      }),
      this.prisma.bipannaClaim.updateMany({
        where: data.claimId
          ? { id: data.claimId, tenantId, caseId }
          : { caseId, tenantId, status: { in: ["SUBMITTED", "APPROVED"] } },
        data: {
          status: "SETTLED",
          approvedAmount: data.approvedClaim,
          rejectedAmount: data.rejected,
          settledAmount: data.received,
          settledAt: new Date(),
          approvalRef: `SETTLE-${Date.now()}`,
        },
      }),
    ]);
    await this.recordSubsidyLedger(tenantId, {
      program: "BIPANNA",
      bipannaCaseId: caseId,
      patientId: bc.patientId,
      entryType: "SETTLEMENT",
      amount: data.received,
      createdBy: data.userId,
    });
    await this.rules.logEvent(tenantId, "GOVERNMENT_CLAIM_SETTLED", "BipannaCase", caseId, {
      approvedClaim: data.approvedClaim,
      received: data.received,
      rejected: data.rejected,
    }, bc.patientId, data.userId);
    return updated[0];
  }

  /** §65.19 reconciliation: approved − utilized − rejected − returned = remaining. */
  reconcileBipanna(bc: {
    approvedAmount: any;
    utilizedAmount: any;
    rejectedAmount: any;
    returnedAmount: any;
  }) {
    const approved = Number(bc.approvedAmount);
    const remaining =
      approved - Number(bc.utilizedAmount) - Number(bc.rejectedAmount) - Number(bc.returnedAmount);
    return { approved, remaining };
  }

  private async generateBipannaNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.bipannaCase.count({ where: { tenantId } });
    return `BNK-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  private async generateBipannaClaimNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.bipannaClaim.count({ where: { tenantId } });
    return `CLM-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  // ------------------------------------------------------------------
  // Brain death & donor coordination (§65.20–§65.26)
  // ------------------------------------------------------------------

  async startBrainDeathProtocol(
    tenantId: string,
    data: { patientId: string; admissionId?: string; encounterId?: string; createdBy?: string },
  ) {
    const rule = await this.rules.resolveOrNull<any>(tenantId, "brain_death_protocol");
    const caseNumber = `BD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const created = await this.prisma.brainDeathCase.create({
      data: {
        tenantId,
        patientId: data.patientId,
        admissionId: data.admissionId,
        encounterId: data.encounterId,
        caseNumber,
        status: "UNDER_ASSESSMENT",
        checklist: rule?.config ?? { steps: [] },
        createdBy: data.createdBy,
      },
    });
    await this.rules.logEvent(tenantId, "BRAIN_DEATH_PROTOCOL_STARTED", "BrainDeathCase", created.id, {}, data.patientId, data.createdBy);
    return created;
  }

  /**
   * Advance the checklist. CERTIFIED requires configured sign-offs
   * (§65.22) — a checkbox alone can never certify.
   */
  async recordBrainDeathStep(
    tenantId: string,
    caseId: string,
    data: { status: string; step?: string; clinicianId?: string; notes?: string },
  ) {
    const bc = await this.prisma.brainDeathCase.findFirst({ where: { id: caseId, tenantId } });
    if (!bc) throw new NotFoundException("Brain-death case not found");
    if (["CLOSED", "NOT_ELIGIBLE"].includes(bc.status)) {
      throw new ConflictException("Case is closed");
    }

    const nextStatus = data.status as any;
    if (nextStatus === "CERTIFIED") {
      const rule = await this.rules.resolveOrNull<any>(tenantId, "brain_death_protocol");
      const requiredSignoffs: string[] = rule?.config?.certification?.requiredSignoffs ?? [];
      const completed: string[] = (bc.checklist as any)?.completedSteps ?? [];
      const missing = requiredSignoffs.filter((s) => !completed.includes(s));
      if (missing.length > 0) {
        throw new ConflictException(
          `Certification blocked — required sign-offs missing: ${missing.join(", ")}`,
        );
      }
    }

    const checklist: any = (bc.checklist as any) ?? {};
    const completedSteps = [...((bc.checklist as any)?.completedSteps ?? [])];
    if (data.step) completedSteps.push({ step: data.step, clinicianId: data.clinicianId, at: new Date(), notes: data.notes });

    const updated = await this.prisma.brainDeathCase.update({
      where: { id: caseId },
      data: {
        status: nextStatus,
        checklist: {
          ...checklist,
          completedSteps,
          ...(nextStatus === "CERTIFIED"
            ? { certifiedBy: data.clinicianId, certifiedAt: new Date() }
            : {}),
        } as any,
        ...(nextStatus === "CERTIFIED"
          ? { certifiedBy: data.clinicianId, certifiedAt: new Date() }
          : {}),
      },
    });
    await this.rules.logEvent(tenantId, "BRAIN_DEATH_STATUS_CHANGE", "BrainDeathCase", caseId, {
      from: bc.status,
      to: nextStatus,
      step: data.step,
    }, bc.patientId, data.clinicianId);

    // §65.23: donor alert only when the configured trigger status is reached.
    const trigger = await this.rules.resolveOrNull<any>(tenantId, "donor_alert_trigger");
    if (trigger?.config?.triggerStatus === nextStatus) {
      await this.sendDonorAlert(tenantId, caseId, data.clinicianId);
    }
    return updated;
  }

  /** §65.23/§65.25: alert authorized recipients only, fully audited. */
  async sendDonorAlert(tenantId: string, brainDeathCaseId: string, sentBy?: string) {
    const bc = await this.prisma.brainDeathCase.findFirst({ where: { id: brainDeathCaseId, tenantId } });
    if (!bc) throw new NotFoundException("Brain-death case not found");
    const trigger = await this.rules.resolveOrNull<any>(tenantId, "donor_alert_trigger");
    const recipients: string[] = trigger?.config?.authorizedRecipients ?? [];
    if (recipients.length === 0) {
      throw new ConflictException(
        "No authorized donor-alert recipients configured — alert cannot be sent",
      );
    }
    const alerts = [];
    for (const org of recipients) {
      alerts.push(
        this.prisma.donorAlert.create({
          data: {
            tenantId,
            brainDeathCaseId,
            trigger: trigger?.config?.triggerStatus ?? "CERTIFIED",
            recipientOrg: org,
            channel: trigger?.config?.channel ?? "INTERNAL",
            status: "SENT",
            sentBy,
          },
        }),
      );
    }
    const created = await this.prisma.$transaction(alerts);
    await this.rules.logEvent(tenantId, "DONOR_ALERT_SENT", "BrainDeathCase", brainDeathCaseId, {
      recipients,
    }, bc.patientId, sentBy);
    return created;
  }

  // ------------------------------------------------------------------
  // Senior citizen priority queue (§65.27–§65.30)
  // ------------------------------------------------------------------

  /** Age evaluated against the ACTIVE legal rule (§65.27). */
  async isSeniorCitizen(tenantId: string, dateOfBirth: Date, at: Date = new Date()) {
    const rule = await this.rules.resolveOrNull<SeniorRuleConfig>(tenantId, RULE_KEYS.SENIOR);
    if (!rule) return { eligible: false, ruleVersion: null as any, minAge: null as any };
    let age = at.getFullYear() - dateOfBirth.getFullYear();
    const m = at.getMonth() - dateOfBirth.getMonth();
    if (m < 0 || (m === 0 && at.getDate() < dateOfBirth.getDate())) age--;
    return { eligible: age >= rule.config.minAge, ruleVersion: rule.version, minAge: rule.config.minAge };
  }

  async enqueueSenior(
    tenantId: string,
    data: {
      patientId: string;
      servicePoint: string;
      encounterId?: string;
      dateOfBirth: Date;
      emergencyTriageLevel?: number;
      overrideReason?: string;
      handledBy?: string;
    },
  ) {
    const rule = await this.rules.resolveOrNull<SeniorRuleConfig>(tenantId, RULE_KEYS.SENIOR);
    const seniority = await this.isSeniorCitizen(tenantId, data.dateOfBirth);
    if (!seniority.eligible) {
      throw new ConflictException("Patient does not meet the active senior-citizen age rule");
    }
    // §65.28: emergency clinical triage always outranks senior priority.
    const priorityRule = await this.rules.resolveOrNull<any>(tenantId, RULE_KEYS.PRIORITY);
    const emergencyDominates: boolean = priorityRule?.config?.emergencyDominates ?? true;
    const priority =
      emergencyDominates && (data.emergencyTriageLevel ?? 99) <= (priorityRule?.config?.emergencyTriageCutoff ?? 2)
        ? "NORMAL" // clinical emergency path takes over; senior token not issued
        : "SENIOR_PRIORITY";

    const count = await this.prisma.seniorQueueEntry.count({
      where: { tenantId, servicePoint: data.servicePoint },
    });
    const token = `S-${104 + count}`;
    const created = await this.prisma.seniorQueueEntry.create({
      data: {
        tenantId,
        patientId: data.patientId,
        encounterId: data.encounterId,
        servicePoint: data.servicePoint,
        token,
        priority,
        ageAtEntry: this.ageAt(data.dateOfBirth),
        ruleId: rule?.ruleId ?? "",
        ruleVersion: seniority.ruleVersion ?? 0,
        overrideReason: data.overrideReason,
        handledBy: data.handledBy,
      },
    });
    await this.rules.logEvent(tenantId, "SENIOR_PRIORITY_GRANTED", "SeniorQueueEntry", created.id, {
      token,
      servicePoint: data.servicePoint,
    }, data.patientId, data.handledBy);
    return created;
  }

  async serveSeniorQueueEntry(tenantId: string, entryId: string, handledBy?: string) {
    const entry = await this.prisma.seniorQueueEntry.findFirst({ where: { id: entryId, tenantId } });
    if (!entry) throw new NotFoundException("Queue entry not found");
    const now = new Date();
    const updated = await this.prisma.seniorQueueEntry.update({
      where: { id: entryId },
      data: {
        servedAt: now,
        waitingSeconds: Math.floor((now.getTime() - entry.queuedAt.getTime()) / 1000),
        handledBy: handledBy ?? entry.handledBy,
      },
    });
    return updated;
  }

  private ageAt(dateOfBirth: Date, at: Date = new Date()): number {
    let age = at.getFullYear() - dateOfBirth.getFullYear();
    const m = at.getMonth() - dateOfBirth.getMonth();
    if (m < 0 || (m === 0 && at.getDate() < dateOfBirth.getDate())) age--;
    return age;
  }

  // ------------------------------------------------------------------
  // VIP / VVIP (§65.31–§65.37, §65.57–§65.58)
  // ------------------------------------------------------------------

  /** Authorized classification — needs designated authority (§65.31). */
  async classifyVip(
    tenantId: string,
    data: {
      patientId: string;
      level: string;
      authorizedBy: string;
      effectiveTo?: Date;
      accessPolicy?: any;
      createdBy?: string;
    },
  ) {
    const policyRule = await this.rules.resolveOrNull<any>(tenantId, RULE_KEYS.VIP);
    const allowedLevels: string[] = policyRule?.config?.allowedLevels ?? ["VIP", "VVIP"];
    if (!allowedLevels.includes(data.level)) {
      throw new ConflictException(`VIP level "${data.level}" is not configured`);
    }
    const created = await this.prisma.vipClassification.create({
      data: {
        tenantId,
        patientId: data.patientId,
        level: data.level,
        accessPolicy: (data.accessPolicy ?? policyRule?.config?.defaultPolicy ?? {}) as any,
        effectiveTo: data.effectiveTo,
        authorizedBy: data.authorizedBy,
        createdBy: data.createdBy,
      },
    });
    await this.prisma.vipAccessLog.create({
      data: {
        tenantId,
        patientId: data.patientId,
        vipClassificationId: created.id,
        userId: data.createdBy,
        action: "CLASSIFY",
        accessReason: `Classified ${data.level} by authority ${data.authorizedBy}`,
      },
    });
    await this.rules.logEvent(tenantId, "VIP_CLASSIFIED", "VipClassification", created.id, {
      level: data.level,
    }, data.patientId, data.createdBy);
    return created;
  }

  async getActiveVipClassification(tenantId: string, patientId: string) {
    return this.prisma.vipClassification.findFirst({
      where: {
        tenantId,
        patientId,
        status: "ACTIVE",
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * VIP record access gate (§65.32–§65.33). Need-to-know + purpose +
   * explicit allowlist; every access is logged immutably. Admins do NOT
   * automatically pass (§65.32).
   */
  async assertVipAccess(
    tenantId: string,
    patientId: string,
    user: { id: string; role?: string },
    data: { action: "VIEW" | "EXPORT" | "PRINT"; reason: string; module?: string; breakGlass?: boolean; ip?: string; sessionId?: string },
  ) {
    const vip = await this.getActiveVipClassification(tenantId, patientId);
    if (!vip) return null; // not a VIP record — normal visibility rules apply

    const policy: any = vip.accessPolicy ?? {};
    const allowedRoles: string[] = policy.allowedRoles ?? [];
    const allowedUsers: string[] = policy.allowedUsers ?? [];
    const isAllowed = allowedUsers.includes(user.id) || allowedRoles.includes(user.role ?? "");

    if (isAllowed) {
      await this.logVipAccess(tenantId, patientId, vip.id, user, data, false);
      return vip;
    }

    // §65.34 break-glass: explicit reason + high-priority audit event.
    if (data.breakGlass) {
      if (!data.reason || data.reason.trim().length < 10) {
        throw new ForbiddenException(
          "Break-glass access requires a substantive justification",
        );
      }
      await this.rules.logException(
        tenantId,
        "VIP_BREAK_GLASS",
        { patientId, userId: user.id, reason: data.reason, module: data.module },
        `BREAK-GLASS VIP access by ${user.id}: ${data.reason}`,
        patientId,
        "CRITICAL",
      );
      await this.logVipAccess(tenantId, patientId, vip.id, user, { ...data, action: "VIEW" }, true);
      await this.rules.logEvent(tenantId, "VIP_BREAK_GLASS_ACCESS", "VipClassification", vip.id, {
        userId: user.id,
        reason: data.reason,
      }, patientId, user.id);
      return vip;
    }

    await this.logVipAccess(tenantId, patientId, vip.id, user, data, false);
    throw new ForbiddenException(
      "This record is classified — you are not on the authorized access list (break-glass is available with justification)",
    );
  }

  private async logVipAccess(
    tenantId: string,
    patientId: string,
    vipId: string,
    user: { id: string; role?: string },
    data: { action: string; reason: string; module?: string; ip?: string; sessionId?: string; breakGlass?: boolean },
    breakGlass: boolean,
  ) {
    await this.prisma.vipAccessLog.create({
      data: {
        tenantId,
        patientId,
        vipClassificationId: vipId,
        userId: user.id,
        userRole: user.role,
        action: breakGlass ? "BREAK_GLASS" : (data.action as any),
        recordModule: data.module,
        ipAddress: data.ip,
        sessionId: data.sessionId,
        accessReason: data.reason,
      },
    });
  }

  async revokeVip(tenantId: string, classificationId: string, revokedBy: string) {
    const vip = await this.prisma.vipClassification.findFirst({
      where: { id: classificationId, tenantId },
    });
    if (!vip) throw new NotFoundException("Classification not found");
    const updated = await this.prisma.vipClassification.update({
      where: { id: classificationId },
      data: { status: "REVOKED" },
    });
    await this.prisma.vipAccessLog.create({
      data: {
        tenantId,
        patientId: vip.patientId,
        vipClassificationId: classificationId,
        userId: revokedBy,
        action: "REVOKE",
        accessReason: "Classification revoked",
      },
    });
    await this.rules.logEvent(tenantId, "VIP_REVOKED", "VipClassification", classificationId, {}, vip.patientId, revokedBy);
    return updated;
  }

  /** Watermarked export descriptor (§65.35) — rendering is the client's job. */
  buildExportWatermark(patientRef: string, user: { id: string; role?: string }, docId: string) {
    return {
      lines: [
        "CONFIDENTIAL",
        `Authorized Recipient: ${user.id} (${user.role ?? "unknown role"})`,
        `Patient Record: ${patientRef}`,
        `Generated: ${new Date().toISOString()}`,
        `Document ID: ${docId}`,
      ],
    };
  }

  // ------------------------------------------------------------------
  // Government sync (§65.5–§65.7, §65.42–§65.43)
  // ------------------------------------------------------------------

  /**
   * Queue a submission. The transport adapter is configured separately
   * (official portal only — no invented endpoints); until one is active,
   * records stay QUEUED, which is the correct compliance posture (§65.5).
   */
  async queueGovSync(
    tenantId: string,
    entityType: string,
    entityId: string,
    userId?: string,
    payload?: any,
  ) {
    if (!(this.prisma as any).govSyncRecord) return null;
    const requestId = `REQ-${entityType}-${entityId}-${Date.now()}`;
    return this.prisma.govSyncRecord
      .create({
        data: {
          tenantId,
          requestId,
          entityType,
          entityId,
          payloadVersion: "v1",
          payload: payload as any,
          status: "QUEUED",
          initiatedBy: userId,
        },
      })
      .catch(() => null);
  }

  /** Mark a submission acknowledged/accepted/rejected (portal callback or manual). */
  async updateGovSyncStatus(
    tenantId: string,
    requestId: string,
    status: "SUBMITTED" | "ACKNOWLEDGED" | "ACCEPTED" | "REJECTED" | "FAILED",
    externalTxnId?: string,
    errorMessage?: string,
  ) {
    const rec = await this.prisma.govSyncRecord.findFirst({ where: { tenantId, requestId } });
    if (!rec) throw new NotFoundException("Sync record not found");
    return this.prisma.govSyncRecord.update({
      where: { id: rec.id },
      data: {
        status,
        externalTxnId,
        errorMessage,
        lastAttemptAt: new Date(),
        lastSuccessAt: ["ACKNOWLEDGED", "ACCEPTED"].includes(status) ? new Date() : rec.lastSuccessAt,
      },
    });
  }

  // ------------------------------------------------------------------
  // Financial integration (§65.47–§65.50)
  // ------------------------------------------------------------------

  /**
   * Funding waterfall for a bill (§65.50). Reads the auditable ledger —
   * the single source of subsidy truth — never recomputes it.
   */
  async getFundingWaterfall(tenantId: string, invoiceId: string) {
    const entries = await this.prisma.subsidyLedgerEntry.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: "asc" },
    });
    const byFunder: Record<string, number> = {};
    for (const e of entries) {
      if (["APPROVAL", "UTILIZATION"].includes(e.entryType)) {
        byFunder[e.funder ?? e.program] = (byFunder[e.funder ?? e.program] ?? 0) + Number(e.amount);
      } else if (["REVERSAL", "ADJUSTMENT"].includes(e.entryType)) {
        byFunder[e.funder ?? e.program] = (byFunder[e.funder ?? e.program] ?? 0) - Number(e.amount);
      }
    }
    return { invoiceId, waterfall: byFunder, entries };
  }

  /**
   * §65.48 no-double-subsidy: flag when multiple government programs fund
   * the same invoice beyond what stacking policy permits.
   */
  async checkDoubleFunding(tenantId: string, invoiceId: string, maxStackablePrograms = 2) {
    const { waterfall } = await this.getFundingWaterfall(tenantId, invoiceId);
    const programs = Object.keys(waterfall).filter((k) => waterfall[k] > 0);
    if (programs.length > maxStackablePrograms) {
      await this.rules.logException(
        tenantId,
        "POTENTIAL_DUPLICATE_FUNDING",
        { invoiceId, programs },
        `Invoice ${invoiceId} is funded by ${programs.length} programs: ${programs.join(", ")}`,
      );
      return { flagged: true, programs };
    }
    return { flagged: false, programs };
  }

  // ------------------------------------------------------------------
  // Dashboards (§65.41)
  // ------------------------------------------------------------------

  async seniorQueueList(tenantId: string) {
    return this.prisma.seniorQueueEntry.findMany({
      where: { tenantId },
      orderBy: { queuedAt: "desc" },
      take: 200,
    });
  }

  async vipAccessLogList(tenantId: string, patientId: string) {
    return this.prisma.vipAccessLog.findMany({
      where: { tenantId, patientId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async govSyncList(tenantId: string) {
    return this.prisma.govSyncRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async regulatoryEventList(tenantId: string) {
    return this.prisma.regulatoryEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async exceptionList(tenantId: string) {
    return this.prisma.regulatoryException.findMany({
      where: { tenantId, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  // ------------------------------------------------------------------
  // List endpoints (SSU / Bipanna / free-beds / ledger)
  // ------------------------------------------------------------------

  async listSsuAssessments(
    tenantId: string,
    filter: { patientId?: string; status?: string } = {},
  ) {
    return this.prisma.ssuAssessment.findMany({
      where: {
        tenantId,
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.status ? { status: filter.status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async listBipannaCases(
    tenantId: string,
    filter: { patientId?: string; status?: string } = {},
  ) {
    return this.prisma.bipannaCase.findMany({
      where: {
        tenantId,
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.status ? { status: filter.status as any } : {}),
      },
      include: { claims: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async listBipannaClaims(
    tenantId: string,
    filter: { caseId?: string; status?: string } = {},
  ) {
    return this.prisma.bipannaClaim.findMany({
      where: {
        tenantId,
        ...(filter.caseId ? { caseId: filter.caseId } : {}),
        ...(filter.status ? { status: filter.status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async listFreeBedAllocations(
    tenantId: string,
    filter: { patientId?: string; status?: string } = {},
  ) {
    return this.prisma.freeBedAllocation.findMany({
      where: {
        tenantId,
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.status ? { status: filter.status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async listBenefitLedger(
    tenantId: string,
    patientId: string,
  ) {
    return this.prisma.subsidyLedgerEntry.findMany({
      where: { tenantId, patientId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async getComplianceDashboard(tenantId: string) {
    const [
      freeBeds,
      ssuPending,
      ssuApproved,
      ssuSubsidyAgg,
      bipannaActive,
      bipannaAgg,
      seniorVisits,
      seniorOverrides,
      bdInProgress,
      bdCertified,
      donorAlerts,
      vipActive,
      vipAccess,
      vipExports,
      breakGlass,
      openExceptions,
    ] = await Promise.all([
      this.getFreeBedDashboard(tenantId),
      this.prisma.ssuAssessment.count({ where: { tenantId, status: { in: ["RECOMMENDED", "COMMITTEE_REVIEW"] } } }),
      this.prisma.ssuAssessment.count({ where: { tenantId, status: "APPROVED" } }),
      this.prisma.ssuAssessment.aggregate({ where: { tenantId, status: "APPROVED" }, _sum: { approvedSubsidy: true } }),
      this.prisma.bipannaCase.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.bipannaCase.aggregate({
        where: { tenantId, status: "ACTIVE" },
        _sum: { approvedAmount: true, utilizedAmount: true, claimedAmount: true, receivedAmount: true },
      }),
      this.prisma.seniorQueueEntry.count({ where: { tenantId } }),
      this.prisma.seniorQueueEntry.count({ where: { tenantId, overrideReason: { not: null } } }),
      this.prisma.brainDeathCase.count({ where: { tenantId, status: { in: ["UNDER_ASSESSMENT", "PROTOCOL_IN_PROGRESS", "CERTIFICATION_PENDING"] } } }),
      this.prisma.brainDeathCase.count({ where: { tenantId, status: "CERTIFIED" } }),
      this.prisma.donorAlert.count({ where: { tenantId } }),
      this.prisma.vipClassification.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.vipAccessLog.count({ where: { tenantId } }),
      this.prisma.vipAccessLog.count({ where: { tenantId, action: { in: ["EXPORT", "PRINT"] } } }),
      this.prisma.vipAccessLog.count({ where: { tenantId, action: "BREAK_GLASS" } }),
      this.prisma.regulatoryException.count({ where: { tenantId, resolvedAt: null } }),
    ]);

    return {
      freeBeds,
      ssu: {
        pending: ssuPending,
        approved: ssuApproved,
        subsidyTotal: ssuSubsidyAgg._sum.approvedSubsidy ?? 0,
      },
      bipanna: {
        activeCases: bipannaActive,
        approved: bipannaAgg._sum.approvedAmount ?? 0,
        utilized: bipannaAgg._sum.utilizedAmount ?? 0,
        claimed: bipannaAgg._sum.claimedAmount ?? 0,
        received: bipannaAgg._sum.receivedAmount ?? 0,
      },
      seniorCitizens: { visits: seniorVisits, overrides: seniorOverrides },
      brainDeath: { inProgress: bdInProgress, certified: bdCertified, donorAlerts },
      vip: {
        activeCases: vipActive,
        accessEvents: vipAccess,
        exports: vipExports,
        breakGlassEvents: breakGlass,
      },
      openExceptions,
    };
  }
}
