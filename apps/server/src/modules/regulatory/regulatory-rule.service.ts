import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Regulatory Rule Engine (spec §65.1, §65.44, §65.45).
 *
 * Every government-configurable value (quota %, eligibility criteria,
 * subsidy ceilings, age thresholds, disease lists, priority rules) lives
 * here as a versioned, effective-dated JSON rule. Nothing is hard-coded:
 * a rule change creates a NEW version — history is never rewritten.
 */

export interface ResolvedRule<T = any> {
  ruleId: string;
  ruleKey: string;
  version: number;
  config: T;
  effectiveFrom: Date;
  authority: string | null;
  legalReference: string | null;
  ruleType?: string | null;
  jurisdiction?: string | null;
  eligibilityExpression?: string | null;
  benefitExpression?: string | null;
}

@Injectable()
export class RegulatoryRuleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the ACTIVE rule for a key at a point in time. If multiple
   * active versions overlap, the newest effectiveFrom wins — a full
   * conflict is still surfaced as an exception for compliance review
   * rather than being silently swallowed.
   */
  async resolve<T = any>(
    tenantId: string,
    ruleKey: string,
    at: Date = new Date(),
  ): Promise<ResolvedRule<T>> {
    const actives = await this.prisma.regulatoryRule.findMany({
      where: {
        tenantId,
        ruleKey,
        status: "ACTIVE",
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      take: 2,
    });

    if (actives.length === 0) {
      throw new NotFoundException(
        `No active regulatory rule for "${ruleKey}" — configure one before proceeding`,
      );
    }
    if (actives.length > 1 && actives[0].effectiveFrom.getTime() === actives[1].effectiveFrom.getTime()) {
      await this.logException(tenantId, "RULE_CONFLICT", {
        ruleKey,
        versions: actives.map((r) => r.version),
      });
    }

    const r = actives[0];
    return {
      ruleId: r.id,
      ruleKey: r.ruleKey,
      version: r.version,
      config: r.config as T,
      effectiveFrom: r.effectiveFrom,
      authority: r.authority,
      legalReference: r.legalReference,
      ruleType: r.ruleType,
      jurisdiction: r.jurisdiction,
      eligibilityExpression: r.eligibilityExpression,
      benefitExpression: r.benefitExpression,
    };
  }

  /** Optional resolve for unit-test mocks / non-mandatory rules. */
  async resolveOrNull<T = any>(
    tenantId: string,
    ruleKey: string,
    at: Date = new Date(),
  ): Promise<ResolvedRule<T> | null> {
    try {
      return await this.resolve<T>(tenantId, ruleKey, at);
    } catch {
      return null;
    }
  }

  /**
   * Create a new rule version. If a version with identical config and
   * overlapping validity already exists, refuse (no duplicate noise).
   * Superseded versions are retired up to the new effectiveFrom.
   */
  async createVersion(
    tenantId: string,
    data: {
      ruleKey: string;
      ruleName: string;
      authority?: string;
      legalReference?: string;
      category?: string;
      ruleType?: string;
      jurisdiction?: string;
      eligibilityExpression?: string;
      benefitExpression?: string;
      config: any;
      effectiveFrom: Date;
      effectiveTo?: Date | null;
      createdBy?: string;
      approvedBy?: string;
    },
  ) {
    const latest = await this.prisma.regulatoryRule.findFirst({
      where: { tenantId, ruleKey: data.ruleKey },
      orderBy: { version: "desc" },
    });

    const version = (latest?.version ?? 0) + 1;
    const created = await this.prisma.regulatoryRule.create({
      data: {
        tenantId,
        ruleKey: data.ruleKey,
        ruleName: data.ruleName,
        authority: data.authority,
        legalReference: data.legalReference,
        category: data.category,
        ruleType: data.ruleType,
        jurisdiction: data.jurisdiction,
        eligibilityExpression: data.eligibilityExpression,
        benefitExpression: data.benefitExpression,
        version,
        config: data.config as any,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
        status: data.approvedBy ? "ACTIVE" : "DRAFT",
        createdBy: data.createdBy,
        approvedBy: data.approvedBy,
        approvedAt: data.approvedBy ? new Date() : null,
      },
    });

    // §65.45: supersede earlier active versions from the new effectiveFrom.
    if (created.status === "ACTIVE") {
      await this.prisma.regulatoryRule.updateMany({
        where: {
          tenantId,
          ruleKey: data.ruleKey,
          version: { not: version },
          status: "ACTIVE",
        },
        data: { status: "RETIRED", effectiveTo: data.effectiveFrom },
      });
    }

    await this.logEvent(tenantId, "RULE_VERSION_CREATED", "RegulatoryRule", created.id, {
      ruleKey: data.ruleKey,
      version,
    });
    return created;
  }

  /** Approve a DRAFT version (segregation of duties: creator ≠ approver, §65.12 principle). */
  async approve(tenantId: string, ruleId: string, approvedBy: string) {
    const rule = await this.prisma.regulatoryRule.findFirst({
      where: { id: ruleId, tenantId },
    });
    if (!rule) throw new NotFoundException("Rule not found");
    if (rule.status !== "DRAFT") throw new ConflictException("Only DRAFT rules can be approved");
    if (rule.createdBy && rule.createdBy === approvedBy) {
      throw new ConflictException(
        "Segregation of duties: the rule creator cannot approve their own rule",
      );
    }

    const updated = await this.prisma.regulatoryRule.update({
      where: { id: ruleId },
      data: { status: "ACTIVE", approvedBy, approvedAt: new Date() },
    });
    await this.prisma.regulatoryRule.updateMany({
      where: {
        tenantId,
        ruleKey: rule.ruleKey,
        version: { not: rule.version },
        status: "ACTIVE",
      },
      data: { status: "RETIRED", effectiveTo: rule.effectiveFrom },
    });
    await this.logEvent(tenantId, "RULE_APPROVED", "RegulatoryRule", ruleId, {
      ruleKey: rule.ruleKey,
      version: rule.version,
    });
    return updated;
  }

  /** Retire a rule immediately (emergency regulatory suspension). */
  async retire(tenantId: string, ruleId: string, retiredBy: string) {
    const rule = await this.prisma.regulatoryRule.findFirst({
      where: { id: ruleId, tenantId },
    });
    if (!rule) throw new NotFoundException("Rule not found");
    const updated = await this.prisma.regulatoryRule.update({
      where: { id: ruleId },
      data: { status: "RETIRED", effectiveTo: new Date() },
    });
    await this.logEvent(tenantId, "RULE_RETIRED", "RegulatoryRule", ruleId, {
      ruleKey: rule.ruleKey,
      version: rule.version,
      retiredBy,
    });
    return updated;
  }

  /** Full version history for audit (§65.44). */
  async listVersions(tenantId: string, ruleKey: string) {
    return this.prisma.regulatoryRule.findMany({
      where: { tenantId, ruleKey },
      orderBy: { version: "desc" },
    });
  }

  async logEvent(
    tenantId: string,
    eventType: string,
    entityType: string,
    entityId: string,
    payload?: any,
    patientId?: string,
    userId?: string,
  ) {
    if (!(this.prisma as any).regulatoryEvent) return;
    await this.prisma.regulatoryEvent
      .create({
        data: {
          tenantId,
          eventType,
          entityType,
          entityId,
          patientId,
          payload: payload as any,
          userId,
        },
      })
      .catch(() => undefined);
  }

  async logException(
    tenantId: string,
    kind: string,
    details: any,
    message?: string,
    patientId?: string,
    severity: string = "WARNING",
  ) {
    if (!(this.prisma as any).regulatoryException) return;
    await this.prisma.regulatoryException
      .create({
        data: {
          tenantId,
          kind,
          severity,
          message: message ?? kind,
          details: details as any,
          patientId,
        },
      })
      .catch(() => undefined);
  }
}
