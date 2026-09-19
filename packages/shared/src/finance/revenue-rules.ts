/**
 * Revenue-split rule model + deterministic resolver.
 *
 * A rule matches an invoice line context; the resolver picks the single most
 * specific rule via the priority chain (spec §17/§46):
 *
 *   scheme+service > scheme+category > billingMode+service >
 *   encounterType+service > encounterType+category > scheme > default
 *
 * Conflict policy: if two rules tie at the winning tier, the resolver returns
 * a CONFLICT (never an arbitrary choice, spec §46). Missing rules return
 * MISSING (surfaced as "REVENUE SPLIT RULE MISSING" — never silently guessed).
 *
 * A rule carries participants; percentage participants within one rule must
 * sum to 100 (± tolerance) unless `allowUnallocated` is set. FIXED-amount
 * participants are validated at calculation time against the basis.
 */

import { withinTolerance } from './money';

export type ParticipantType =
  | 'PRIMARY_DOCTOR'
  | 'SECONDARY_DOCTOR'
  | 'SURGEON'
  | 'ASSISTANT_SURGEON'
  | 'ANESTHETIST'
  | 'TECHNICIAN'
  | 'NURSING'
  | 'DEPARTMENT'
  | 'HOSPITAL'
  | 'REFERRING_DOCTOR'
  | string;

export type CalculationBasis =
  | 'GROSS'
  | 'NET_EXCL_TAX' // gross − discounts (spec default; tax never shared)
  | 'NET_INCL_TAX'
  | 'SCHEME_APPROVED'
  | 'COLLECTED'
  | 'FIXED_FEE';

export interface RuleParticipant {
  /** Participant type role (e.g. PRIMARY_DOCTOR). */
  type: ParticipantType;
  shareType: 'PERCENTAGE' | 'FIXED';
  /** PERCENTAGE: 0–100. FIXED: currency amount. */
  shareValue: number;
  /** Doctor/staff/department id when the participant is concrete. */
  participantId?: string;
  /** Doctor-role participants resolve their concrete id from the line. */
  resolveFromParticipation?: boolean;
}

export interface RevenueSplitRule {
  id: string;
  /** Version frozen at billing time for historical reproducibility. */
  version: number;
  schemeId?: string | null;
  billingMode?: string | null;
  encounterType?: string | null;
  serviceId?: string | null;
  serviceCategoryId?: string | null;
  basis: CalculationBasis;
  participants: RuleParticipant[];
  allowUnallocated: boolean;
  effectiveFrom: string; // ISO date
  effectiveTo?: string | null;
  priority: number;
  isActive: boolean;
}

export type RuleTier =
  | 'SCHEME_SERVICE'
  | 'SCHEME_CATEGORY'
  | 'BILLING_MODE_SERVICE'
  | 'ENCOUNTER_TYPE_SERVICE'
  | 'ENCOUNTER_TYPE_CATEGORY'
  | 'SCHEME'
  | 'DEFAULT';

export interface LineRuleContext {
  schemeId?: string | null;
  billingMode?: string | null;
  encounterType?: string | null;
  serviceId?: string | null;
  serviceCategoryId?: string | null;
  /** Date the line was billed (ISO instant) — selects effective versions. */
  at: string;
}

export type RuleResolution =
  | { status: 'RESOLVED'; rule: RevenueSplitRule; tier: RuleTier }
  | { status: 'CONFLICT'; tier: RuleTier; candidates: RevenueSplitRule[] }
  | { status: 'MISSING' };

const TIER_ORDER: RuleTier[] = [
  'SCHEME_SERVICE',
  'SCHEME_CATEGORY',
  'BILLING_MODE_SERVICE',
  'ENCOUNTER_TYPE_SERVICE',
  'ENCOUNTER_TYPE_CATEGORY',
  'SCHEME',
  'DEFAULT',
];

function isActiveAt(rule: RevenueSplitRule, at: string): boolean {
  if (!rule.isActive) return false;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return false;
  if (new Date(rule.effectiveFrom).getTime() > t) return false;
  if (rule.effectiveTo && new Date(rule.effectiveTo).getTime() < t) return false;
  return true;
}

function same(a?: string | null, b?: string | null): boolean {
  return a != null && b != null && a === b;
}

function tierOf(rule: RevenueSplitRule, ctx: LineRuleContext): RuleTier | null {
  if (same(rule.schemeId, ctx.schemeId) && same(rule.serviceId, ctx.serviceId))
    return 'SCHEME_SERVICE';
  if (
    same(rule.schemeId, ctx.schemeId) &&
    same(rule.serviceCategoryId, ctx.serviceCategoryId)
  )
    return 'SCHEME_CATEGORY';
  if (same(rule.billingMode, ctx.billingMode) && same(rule.serviceId, ctx.serviceId))
    return 'BILLING_MODE_SERVICE';
  if (
    same(rule.encounterType, ctx.encounterType) &&
    same(rule.serviceId, ctx.serviceId)
  )
    return 'ENCOUNTER_TYPE_SERVICE';
  if (
    same(rule.encounterType, ctx.encounterType) &&
    same(rule.serviceCategoryId, ctx.serviceCategoryId)
  )
    return 'ENCOUNTER_TYPE_CATEGORY';
  if (same(rule.schemeId, ctx.schemeId)) return 'SCHEME';
  if (!rule.schemeId && !rule.billingMode && !rule.encounterType && !rule.serviceId && !rule.serviceCategoryId)
    return 'DEFAULT';
  return null;
}

/**
 * Resolve the single applicable rule for a line context. Deterministic:
 * highest tier wins; within a tier, highest `priority` wins; a remaining tie
 * between distinct rules is a CONFLICT (config error — surfaced, not guessed).
 */
export function resolveRule(
  rules: RevenueSplitRule[],
  ctx: LineRuleContext,
): RuleResolution {
  const active = rules.filter((r) => isActiveAt(r, ctx.at));
  let bestTier: RuleTier | null = null;
  let candidates: RevenueSplitRule[] = [];

  for (const tier of TIER_ORDER) {
    const atTier = active
      .map((rule) => ({ rule, tier: tierOf(rule, ctx) }))
      .filter((x) => x.tier === tier)
      .map((x) => x.rule);
    if (atTier.length > 0) {
      bestTier = tier;
      const maxPriority = Math.max(...atTier.map((r) => r.priority));
      candidates = atTier.filter((r) => r.priority === maxPriority);
      break;
    }
  }

  if (!bestTier || candidates.length === 0) return { status: 'MISSING' };
  const distinct = new Set(candidates.map((c) => c.id));
  if (distinct.size > 1)
    return { status: 'CONFLICT', tier: bestTier, candidates };
  return { status: 'RESOLVED', rule: candidates[0], tier: bestTier };
}

export class RuleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleValidationError';
  }
}

/**
 * Validate participant shares of a rule. Percentage shares must total 100
 * (± 0.5% tolerance per spec §19) unless allowUnallocated. FIXED shares are
 * validated against the basis at calculation time, not here.
 */
export function validateRuleShares(rule: RevenueSplitRule): void {
  const pct = rule.participants.filter((p) => p.shareType === 'PERCENTAGE');
  const fixed = rule.participants.filter((p) => p.shareType === 'FIXED');
  if (fixed.length > 0 && pct.length > 0)
    throw new RuleValidationError(
      `Rule ${rule.id}: mixing FIXED and PERCENTAGE participants is not supported`,
    );
  if (pct.length > 0) {
    const total = pct.reduce((a, p) => a + p.shareValue, 0);
    if (pct.some((p) => p.shareValue < 0 || p.shareValue > 100))
      throw new RuleValidationError(
        `Rule ${rule.id}: percentage shares must be within 0–100`,
      );
    if (!rule.allowUnallocated && !withinTolerance(total, 100, pct.length))
      throw new RuleValidationError(
        `Rule ${rule.id}: percentage shares total ${total}% (must be 100% unless unallocated balance is explicitly allowed)`,
      );
    if (rule.allowUnallocated && total > 100.005)
      throw new RuleValidationError(
        `Rule ${rule.id}: percentage shares total ${total}% — over-allocation is never permitted`,
      );
  }
  if (fixed.some((p) => p.shareValue < 0))
    throw new RuleValidationError(`Rule ${rule.id}: fixed shares cannot be negative`);
}
