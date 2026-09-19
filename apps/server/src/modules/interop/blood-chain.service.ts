import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "../regulatory/regulatory-rule.service";

/**
 * Blood chain-of-trust extension (§82): crossmatch records, transfusion
 * episodes, and reaction escalation. Works on the EXISTING BloodUnit model —
 * no parallel inventory. Issue gating is rule-configured
 * (BLOOD_ISSUE_REQUIRES_CROSSMATCH) so hospitals without the workflow keep
 * working, while rule-on hospitals get the §82.4 safety gate.
 */

/**
 * ABO/Rh compatibility — canonical keys AND values use the schema's
 * BloodGroup enum spelling (O_NEG, O_POS, …). Inputs in either spelling
 * are normalized before lookup, so an O- patient matches an O_NEG unit.
 */
const ABO_COMPAT: Record<string, string[]> = {
  O_NEG: ["O_NEG"],
  O_POS: ["O_NEG", "O_POS"],
  A_NEG: ["O_NEG", "A_NEG"],
  A_POS: ["O_NEG", "O_POS", "A_NEG", "A_POS"],
  B_NEG: ["O_NEG", "B_NEG"],
  B_POS: ["O_NEG", "O_POS", "B_NEG", "B_POS"],
  AB_NEG: ["O_NEG", "A_NEG", "B_NEG", "AB_NEG"],
  AB_POS: ["O_NEG", "O_POS", "A_NEG", "A_POS", "B_NEG", "B_POS", "AB_NEG", "AB_POS"],
};

/** Normalize either spelling ("O-" / "O_NEG") to the canonical enum value. */
function normalizeGroup(g: string): string {
  const m: Record<string, string> = {
    "O-": "O_NEG", "O+": "O_POS", "A-": "A_NEG", "A+": "A_POS",
    "B-": "B_NEG", "B+": "B_POS", "AB-": "AB_NEG", "AB+": "AB_POS",
  };
  return m[g] ?? g;
}

@Injectable()
export class BloodChainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  /** §82.4: record compatibility testing. ABO/Rh check is a hard safety net. */
  async recordCrossmatch(
    tenantId: string,
    data: {
      patientId: string;
      encounterId?: string;
      unitId: string;
      patientGroup: string;
      units?: number;
      method?: string;
      result: "COMPATIBLE" | "INCOMPATIBLE" | "INCONCLUSIVE";
      testedBy?: string;
      expiresAt?: Date;
      approvedBy?: string;
    },
  ) {
    const unit = await this.prisma.bloodUnit.findFirst({ where: { id: data.unitId, tenantId } });
    if (!unit) throw new NotFoundException("Blood unit not found");

    // §82.4 hard safety net: donor group must be ABO/Rh-compatible.
    const patientGroup = normalizeGroup(data.patientGroup);
    const donorGroup = normalizeGroup(unit.bloodGroup);
    const compatible = ABO_COMPAT[patientGroup]?.includes(donorGroup) ?? false;
    if (data.result === "COMPATIBLE" && !compatible) {
      throw new ConflictException(
        `ABO/Rh mismatch: patient ${data.patientGroup} cannot receive ${unit.bloodGroup} — COMPATIBLE refused (§82.4)`,
      );
    }
    if (data.result === "INCOMPATIBLE" && compatible && patientGroup === donorGroup) {
      throw new ConflictException(
        "Identical group marked INCOMPATIBLE contradicts serology — record INCONCLUSIVE instead",
      );
    }

    const xm = await this.prisma.bloodCrossmatch.create({
      data: {
        tenantId,
        patientId: data.patientId,
        encounterId: data.encounterId,
        unitId: data.unitId,
        requestedComponent: unit.component,
        patientGroup,
        donorGroup,
        units: data.units ?? 1,
        method: data.method,
        result: data.result,
        testedBy: data.testedBy,
        expiresAt: data.expiresAt,
        approvedBy: data.approvedBy,
      },
    });
    await this.rules.logEvent(tenantId, "BLOOD_CROSSMATCHED", "BloodCrossmatch", xm.id, {
      unitNumber: unit.unitNumber,
      patientGroup,
      donorGroup: unit.bloodGroup,
      result: data.result,
    }, data.patientId);
    return xm;
  }

  /**
   * §82.4: the safety gate used by issue flows. When the rule is on, a
   * COMPATIBLE, unexpired crossmatch must exist for the unit+patient.
   */
  async assertIssueAllowed(tenantId: string, unitId: string, patientId: string) {
    const cfg = await this.rules.resolveOrNull<any>(tenantId, "BLOOD_ISSUE_REQUIRES_CROSSMATCH");
    if (!cfg || cfg.config?.required !== true) return { allowed: true, reason: "Crossmatch not required by rule" };

    const xm = await this.prisma.bloodCrossmatch.findFirst({
      where: {
        tenantId,
        unitId,
        patientId,
        result: "COMPATIBLE",
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      orderBy: { testedAt: "desc" },
    });
    if (!xm) {
      throw new ConflictException(
        "No valid COMPATIBLE crossmatch for this unit+patient — issue blocked by BLOOD_ISSUE_REQUIRES_CROSSMATCH (§82.4)",
      )
    }
    return { allowed: true, crossmatchId: xm.id };
  }

  /** §82.5: record a transfusion episode against an ISSUED unit. */
  async recordTransfusion(
    tenantId: string,
    data: {
      patientId: string;
      encounterId?: string;
      unitId: string;
      crossmatchId?: string;
      startedAt?: Date;
      volumeMl?: number;
      administeredBy?: string;
      verifiedBy?: string;
      bedsideScan?: { patientWristband?: string; unitBarcode?: string; staffId?: string; matched?: boolean };
      location?: string;
      indication?: string;
      createdBy?: string;
    },
  ) {
    const unit = await this.prisma.bloodUnit.findFirst({ where: { id: data.unitId, tenantId } });
    if (!unit) throw new NotFoundException("Blood unit not found");
    if (unit.status !== "ISSUED") {
      throw new ConflictException(`Unit status is ${unit.status} — only ISSUED units can be transfused (§82.3)`);
    }
    // §82.6: bedside verification must match before transfusion when provided.
    if (data.bedsideScan && data.bedsideScan.matched === false) {
      throw new ConflictException("Bedside scan mismatch — transfusion refused (§82.6)");
    }
    const tf = await this.prisma.bloodTransfusion.create({
      data: {
        tenantId,
        patientId: data.patientId,
        encounterId: data.encounterId,
        unitId: data.unitId,
        crossmatchId: data.crossmatchId,
        startedAt: data.startedAt ?? new Date(),
        volumeMl: data.volumeMl,
        administeredBy: data.administeredBy,
        verifiedBy: data.verifiedBy,
        bedsideScan: data.bedsideScan,
        location: data.location,
        indication: data.indication,
      },
    });
    await this.rules.logEvent(tenantId, "BLOOD_TRANSFUSED", "BloodTransfusion", tf.id, {
      unitNumber: unit.unitNumber,
      location: data.location,
    }, data.patientId);
    return tf;
  }

  /** Complete a transfusion (times, vitals, outcome). */
  async completeTransfusion(
    tenantId: string,
    transfusionId: string,
    data: { endedAt?: Date; vitals?: any; outcome?: string },
  ) {
    const tf = await this.prisma.bloodTransfusion.findFirst({ where: { id: transfusionId, tenantId } });
    if (!tf) throw new NotFoundException("Transfusion not found");
    if (tf.endedAt) throw new ConflictException("Transfusion already completed");
    return this.prisma.bloodTransfusion.update({
      where: { id: transfusionId },
      data: {
        endedAt: data.endedAt ?? new Date(),
        vitals: data.vitals,
        outcome: data.outcome,
      },
    });
  }

  /**
   * §82.7: a suspected reaction links unit + patient + episode, escalates
   * the unit to QUARANTINED so it cannot issue again, and raises an exception.
   */
  async recordReaction(
    tenantId: string,
    transfusionId: string,
    data: { reaction: string; severity: string; intervention?: string; outcome?: string; reportedBy?: string },
  ) {
    const tf = await this.prisma.bloodTransfusion.findFirst({ where: { id: transfusionId, tenantId } });
    if (!tf) throw new NotFoundException("Transfusion not found");
    if (tf.reaction) throw new ConflictException("Reaction already recorded for this transfusion");

    const updated = await this.prisma.bloodTransfusion.update({
      where: { id: transfusionId },
      data: {
        reaction: data.reaction,
        reactionSeverity: data.severity,
        intervention: data.intervention,
        outcome: data.outcome,
      },
    });
    // Escalation: quarantine the unit so it cannot be re-issued.
    await this.prisma.bloodUnit.updateMany({
      where: { id: tf.unitId, tenantId },
      data: { status: "QUARANTINED" },
    });
    await this.rules.logException(
      tenantId, "TRANSFUSION_REACTION", {
        transfusionId,
        unitId: tf.unitId,
        patientId: tf.patientId,
        severity: data.severity,
        reaction: data.reaction,
      },
      `Transfusion reaction (${data.severity}): ${data.reaction}`,
      tf.patientId ?? undefined,
      "CRITICAL",
    );
    await this.rules.logEvent(tenantId, "TRANSFUSION_REACTION_RECORDED", "BloodTransfusion", transfusionId, {
      severity: data.severity,
    }, tf.patientId ?? undefined);
    return updated;
  }

  /**
   * Spec #33: unused-unit return to the bank. The unit's issued state is
   * rolled back so it re-enters inventory; the return is recorded as a
   * first-class traceability event, distinct from discard/wastage.
   */
  async returnUnit(
    tenantId: string,
    unitId: string,
    data: { reason?: string; returnedBy?: string },
  ) {
    const unit = await this.prisma.bloodUnit.findFirst({
      where: { id: unitId, tenantId },
    });
    if (!unit) throw new NotFoundException("Blood unit not found");
    if (!["ISSUED", "RESERVED", "CROSSMATCHED"].includes(unit.status)) {
      throw new ConflictException(
        `Unit status ${unit.status} is not returnable; only ISSUED/RESERVED/CROSSMATCHED units can be returned`,
      );
    }
    const ret = await this.prisma.bloodUnitReturn.create({
      data: {
        tenantId,
        unitId,
        reason: data.reason ?? null,
        returnedBy: data.returnedBy ?? null,
      },
    });
    await this.prisma.bloodUnit.update({
      where: { id: unitId },
      data: {
        status: "AVAILABLE",
        issuedTo: null,
        issuedAt: null,
        issuedBy: null,
        crossMatchTo: null,
      },
    });
    await this.rules.logEvent(tenantId, "BLOOD_UNIT_RETURNED", "BloodUnit", unitId, {
      returnId: ret.id,
      reason: data.reason,
    }, unit.issuedTo ?? undefined);
    return ret;
  }
}