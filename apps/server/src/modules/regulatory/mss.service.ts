import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

/**
 * MSS digital compliance engine (spec §66).
 *
 * Standard-set metadata (including the declared standard COUNT) is versioned
 * configuration (§66.1) — a future MoHP revision changes the set, not the
 * code. Compliance is evidence-gated (§66.2): a standard cannot be marked
 * COMPLIANT without verified evidence when evidence is mandatory. Every
 * assessment is an immutable snapshot (§66.5).
 */

export interface MssScores {
  overall: number;
  governance: number;
  clinical: number;
  support: number;
  mandatoryFailures: number;
  evidenceCompleteness: number;
}

const MAX_SCORE = 100;

@Injectable()
export class MssService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  /** Publish a new standard-set version with its standards (§66.1). */
  async publishStandardSet(
    tenantId: string,
    data: {
      setName: string;
      facilityLevel: string;
      declaredCount: number;
      authority?: string;
      sourceRef?: string;
      standards: Array<{
        standardCode: string;
        standardName: string;
        domain: string;
        requirement?: string;
        isMandatory?: boolean;
        evidenceRequired?: boolean;
        evidenceTypes?: any;
        responsibleDept?: string;
        responsibleRole?: string;
        scoringMethod?: string;
        weight?: number;
        complianceThreshold?: number;
        reviewFrequency?: string;
        sourceRef?: string;
      }>;
      createdBy?: string;
    },
  ) {
    const set = await this.prisma.mssStandardSet.create({
      data: {
        tenantId,
        setName: data.setName,
        facilityLevel: data.facilityLevel,
        declaredCount: data.declaredCount,
        authority: data.authority,
        sourceRef: data.sourceRef,
        effectiveFrom: new Date(),
        status: "ACTIVE",
      },
    });
    await this.prisma.mssStandard.createMany({
      data: data.standards.map((st) => ({
        tenantId,
        setId: set.id,
        standardCode: st.standardCode,
        standardName: st.standardName,
        domain: st.domain,
        requirement: st.requirement,
        isMandatory: st.isMandatory ?? true,
        evidenceRequired: st.evidenceRequired ?? true,
        evidenceTypes: st.evidenceTypes as any,
        responsibleDept: st.responsibleDept,
        responsibleRole: st.responsibleRole,
        scoringMethod: st.scoringMethod,
        weight: st.weight ?? 1,
        complianceThreshold: st.complianceThreshold,
        reviewFrequency: st.reviewFrequency,
        sourceRef: st.sourceRef,
      })),
    });
    await this.rules.logEvent(tenantId, "MSS_SET_PUBLISHED", "MssStandardSet", set.id, {
      facilityLevel: data.facilityLevel,
      declaredCount: data.declaredCount,
      loadedStandards: data.standards.length,
    });
    return set;
  }

  /** Load the applicable set for a facility level (active, newest first). */
  async getActiveSet(tenantId: string, facilityLevel: string) {
    const set = await this.prisma.mssStandardSet.findFirst({
      where: {
        tenantId,
        facilityLevel,
        status: "ACTIVE",
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
      include: { standards: { where: { status: "ACTIVE" } } },
    });
    if (!set) throw new NotFoundException(`No active MSS set for facility level ${facilityLevel}`);
    return set;
  }

  /** §66.2: evidence-verified compliance — no self-declared compliance. */
  async assessStandard(
    tenantId: string,
    standardId: string,
    data: {
      proposedStatus: string;
      score?: number;
      comments?: string;
      assessedBy?: string;
    },
  ) {
    const standard = await this.prisma.mssStandard.findFirst({
      where: { id: standardId, tenantId },
    });
    if (!standard) throw new NotFoundException("MSS standard not found");

    let finalStatus = data.proposedStatus;
    let evidenceSnapshot: any = null;

    if (finalStatus === "COMPLIANT" && standard.evidenceRequired) {
      const evidence = await this.prisma.mssEvidence.findMany({
        where: { tenantId, standardId, status: "VERIFIED" },
      });
      const valid = evidence.filter(
        (e) => !e.validTo || e.validTo >= new Date(),
      );
      if (valid.length === 0) {
        throw new ConflictException(
          "Evidence-gated compliance: no VERIFIED, unexpired evidence linked to this standard",
        );
      }
      evidenceSnapshot = valid.map((e) => ({
        id: e.id,
        title: e.title,
        docType: e.docType,
        documentVersion: e.documentVersion,
        validTo: e.validTo,
      }));
    }

    const assessment = await this.prisma.mssAssessment.create({
      data: {
        tenantId,
        standardId,
        standardVersion: 1,
        score: data.score,
        status: finalStatus as any,
        evidenceSnapshot: evidenceSnapshot as any,
        comments: data.comments,
        assessedBy: data.assessedBy,
      },
    });

    // §66.4: failed standards create a corrective action automatically.
    if (["NON_COMPLIANT", "PARTIALLY_COMPLIANT"].includes(finalStatus)) {
      await this.prisma.correctiveAction.create({
        data: {
          tenantId,
          assessmentId: assessment.id,
          priority: standard.isMandatory ? "HIGH" : "MEDIUM",
          status: "OPEN",
        },
      });
      await this.rules.logEvent(tenantId, "MSS_CAPA_OPENED", "MssAssessment", assessment.id, {
        standardCode: standard.standardCode,
        status: finalStatus,
      });
    }

    await this.rules.logEvent(tenantId, "MSS_ASSESSED", "MssAssessment", assessment.id, {
      standardCode: standard.standardCode,
      status: finalStatus,
    });
    return assessment;
  }

  /** Weighted domain scoring over the LATEST assessment per standard (§66.2). */
  async computeScores(tenantId: string, facilityLevel: string): Promise<MssScores> {
    const set = await this.getActiveSet(tenantId, facilityLevel);
    const standards = set.standards;

    const latest = new Map<string, any>();
    if (standards.length > 0) {
      const assessments = await this.prisma.mssAssessment.findMany({
        where: { tenantId, standardId: { in: standards.map((s) => s.id) } },
        orderBy: { assessmentDate: "desc" },
      });
      for (const a of assessments) {
        if (!latest.has(a.standardId)) latest.set(a.standardId, a);
      }
    }

    const domainWeights: Record<string, { got: number; total: number }> = {
      Governance: { got: 0, total: 0 },
      Clinical: { got: 0, total: 0 },
      Support: { got: 0, total: 0 },
    };
    let mandatoryFailures = 0;
    let evidenceTotal = 0;
    let evidenceHave = 0;

    for (const st of standards) {
      const w = Number(st.weight) || 1;
      const bucket = domainWeights[st.domain] ?? domainWeights.Support;
      const a = latest.get(st.id);
      bucket.total += w;
      const applicable = a && a.status !== "NOT_APPLICABLE" && a.status !== "NOT_STARTED";
      if (applicable) {
        const score =
          a.status === "COMPLIANT" ? MAX_SCORE
          : a.status === "PARTIALLY_COMPLIANT" ? (a.score != null ? Number(a.score) : MAX_SCORE / 2)
          : 0;
        bucket.got += (score / MAX_SCORE) * w;
        if (a.status === "NON_COMPLIANT" && st.isMandatory) mandatoryFailures++;
      }
      if (st.evidenceRequired) {
        evidenceTotal += 1;
        if (a?.evidenceSnapshot) evidenceHave += 1;
      }
    }

    const pct = (g: number, t: number) => (t > 0 ? Math.round((g / t) * 100) : 100);
    return {
      overall: pct(
        Object.values(domainWeights).reduce((s, b) => s + b.got, 0),
        Object.values(domainWeights).reduce((s, b) => s + b.total, 0),
      ),
      governance: pct(domainWeights.Governance.got, domainWeights.Governance.total),
      clinical: pct(domainWeights.Clinical.got, domainWeights.Clinical.total),
      support: pct(domainWeights.Support.got, domainWeights.Support.total),
      mandatoryFailures,
      evidenceCompleteness: evidenceTotal > 0 ? Math.round((evidenceHave / evidenceTotal) * 100) : 100,
    };
  }

  /** §66.5: historical trend — append-only assessments, reproducible. */
  async getTrend(tenantId: string, facilityLevel: string, days = 90) {
    const since = new Date(Date.now() - days * 86400000);
    return this.prisma.mssAssessment.findMany({
      where: {
        tenantId,
        assessmentDate: { gte: since },
        standard: { set: { facilityLevel } },
      },
      orderBy: { assessmentDate: "asc" },
      select: {
        assessmentDate: true,
        status: true,
        score: true,
        standardId: true,
      },
    });
  }

  async uploadEvidence(
    tenantId: string,
    standardId: string,
    data: {
      title: string;
      docType: string;
      documentRef?: string;
      documentVersion?: string;
      validFrom?: Date;
      validTo?: Date;
      uploadedBy?: string;
    },
  ) {
    return this.prisma.mssEvidence.create({
      data: {
        tenantId,
        standardId,
        title: data.title,
        docType: data.docType,
        documentRef: data.documentRef,
        documentVersion: data.documentVersion,
        validFrom: data.validFrom,
        validTo: data.validTo,
        status: "PENDING_VERIFICATION",
        uploadedBy: data.uploadedBy,
        auditTrail: [
          { action: "UPLOADED", by: data.uploadedBy, at: new Date() },
        ] as any,
      },
    });
  }

  async verifyEvidence(
    tenantId: string,
    evidenceId: string,
    data: { decision: "VERIFIED" | "REJECTED"; reviewerId?: string; notes?: string },
  ) {
    const ev = await this.prisma.mssEvidence.findFirst({ where: { id: evidenceId, tenantId } });
    if (!ev) throw new NotFoundException("Evidence not found");
    const updated = await this.prisma.mssEvidence.update({
      where: { id: evidenceId },
      data: {
        status: data.decision,
        reviewedBy: data.reviewerId,
        reviewDate: new Date(),
        reviewNotes: data.notes,
        auditTrail: [
          ...(Array.isArray(ev.auditTrail) ? ev.auditTrail : []),
          { action: data.decision, by: data.reviewerId, at: new Date() },
        ] as any,
      },
    });
    return updated;
  }

  async listCapa(tenantId: string, includeOverdue = true) {
    const now = new Date();
    return this.prisma.correctiveAction.findMany({
      where: {
        tenantId,
        ...(includeOverdue
          ? {
              OR: [
                { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW"] } },
                { dueDate: { lt: now }, status: { notIn: ["CLOSED"] } },
              ],
            }
          : {}),
      },
      orderBy: [{ dueDate: "asc" }],
      include: { assessment: { include: { standard: { select: { standardCode: true, standardName: true, domain: true } } } } },
    });
  }

  async closeCapa(
    tenantId: string,
    capaId: string,
    data: { reviewNotes?: string; closedBy?: string },
  ) {
    const capa = await this.prisma.correctiveAction.findFirst({ where: { id: capaId, tenantId } });
    if (!capa) throw new NotFoundException("Corrective action not found");
    if (capa.status === "CLOSED") throw new ConflictException("Already closed");
    return this.prisma.correctiveAction.update({
      where: { id: capaId },
      data: { status: "CLOSED", reviewNotes: data.reviewNotes, closedBy: data.closedBy, closedAt: new Date() },
    });
  }
}
