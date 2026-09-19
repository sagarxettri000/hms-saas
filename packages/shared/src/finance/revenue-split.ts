/**
 * Per-line revenue split engine — the authoritative calculation.
 *
 * Contract (spec §13/§15/§18/§19/§20/§59):
 *  - Splits are computed PER INVOICE LINE, never aggregated first.
 *  - Basis is explicit on the rule (never assumed): default NET_EXCL_TAX so
 *    tax is never shared with doctors.
 *  - Participants come from documented participation on the line, not from
 *    department membership.
 *  - Output carries rule id/version/tier + basis + percentages so every
 *    amount is explainable and auditable after finalization.
 *  - Σ allocations === basis amount exactly (largest-remainder residual).
 */

import { allocate, percentageOf, round, sum, withinTolerance } from './money';
import {
  CalculationBasis,
  LineRuleContext,
  resolveRule,
  RevenueSplitRule,
  RuleParticipant,
  RuleValidationError,
  validateRuleShares,
} from './revenue-rules';

/** Documented participation on a billable line (who actually took part). */
export interface LineParticipant {
  /** Participant role: PRIMARY_DOCTOR, SURGEON, ANESTHETIST, TECHNICIAN... */
  type: string;
  /** Concrete doctor/staff/department id. */
  participantId: string;
}

export interface SplittableLine {
  lineId: string;
  quantity: number;
  rate: number;
  discountAmount: number;
  taxAmount: number;
  grossAmount?: number;
  participants: LineParticipant[];
  serviceId?: string | null;
  serviceCategoryId?: string | null;
  /** Amount the scheme approved/paid for this line, when applicable. */
  schemeApprovedAmount?: number | null;
  /** Amount actually collected for this line, when allocating on COLLECTED. */
  collectedAmount?: number | null;
}

export interface Allocation {
  participantType: string;
  participantId: string;
  shareType: 'PERCENTAGE' | 'FIXED';
  shareValue: number;
  basis: CalculationBasis;
  basisAmount: number;
  calculatedAmount: number;
  ruleId: string;
  ruleVersion: number;
  ruleTier: string;
  /** Human-readable explanation of why this amount was produced (spec §59). */
  explanation: string;
}

export type SplitResult =
  | {
      status: 'OK';
      lineId: string;
      basis: CalculationBasis;
      basisAmount: number;
      allocations: Allocation[];
      ruleId: string;
      ruleVersion: number;
      ruleTier: string;
    }
  | { status: 'MISSING_RULE'; lineId: string; message: string }
  | { status: 'CONFLICT'; lineId: string; message: string; tier: string }
  | { status: 'INVALID'; lineId: string; message: string }
  | { status: 'NO_PARTICIPANTS'; lineId: string };

export function lineGross(line: SplittableLine): number {
  return line.grossAmount ?? round(line.quantity * line.rate);
}

/** Basis amount for a line given the rule's calculation basis. */
export function basisAmountFor(line: SplittableLine, basis: CalculationBasis): number {
  const gross = lineGross(line);
  switch (basis) {
    case 'GROSS':
      return gross;
    case 'NET_EXCL_TAX':
      return round(gross - line.discountAmount);
    case 'NET_INCL_TAX':
      return round(gross - line.discountAmount + line.taxAmount);
    case 'SCHEME_APPROVED':
      return round(line.schemeApprovedAmount ?? 0);
    case 'COLLECTED':
      return round(line.collectedAmount ?? 0);
    case 'FIXED_FEE':
      return 0; // fixed participants carry their own amounts
    default:
      return round(gross - line.discountAmount);
  }
}

function resolveParticipantId(
  ruleP: RuleParticipant,
  line: SplittableLine,
): string | null {
  if (ruleP.participantId) return ruleP.participantId;
  const candidate = line.participants.find((p) => p.type === ruleP.type);
  return candidate ? candidate.participantId : null;
}

/**
 * Compute the revenue split for one line. Throws nothing on business-rule
 * failures — returns a typed failure so callers can aggregate and report.
 */
export function splitLine(
  line: SplittableLine,
  rules: RevenueSplitRule[],
  ctx: LineRuleContext,
): SplitResult {
  const resolution = resolveRule(rules, ctx);
  if (resolution.status === 'MISSING')
    return {
      status: 'MISSING_RULE',
      lineId: line.lineId,
      message: 'REVENUE SPLIT RULE MISSING',
    };
  if (resolution.status === 'CONFLICT')
    return {
      status: 'CONFLICT',
      lineId: line.lineId,
      message: `REVENUE SPLIT RULE CONFLICT (${resolution.candidates.length} rules tie at tier ${resolution.tier})`,
      tier: resolution.tier,
    };

  const rule = resolution.rule;
  try {
    validateRuleShares(rule);
  } catch (e) {
    return {
      status: 'INVALID',
      lineId: line.lineId,
      message: e instanceof RuleValidationError ? e.message : 'Invalid revenue rule',
    };
  }

  if (rule.participants.length === 0)
    return { status: 'NO_PARTICIPANTS', lineId: line.lineId };

  const basisAmount = basisAmountFor(line, rule.basis);
  if (basisAmount < 0)
    return {
      status: 'INVALID',
      lineId: line.lineId,
      message: 'Basis amount cannot be negative',
    };

  const pctParticipants = rule.participants.filter((p) => p.shareType === 'PERCENTAGE');
  const fixedParticipants = rule.participants.filter((p) => p.shareType === 'FIXED');

  // ---- Percentage path -----------------------------------------------------
  if (pctParticipants.length > 0) {
    if (fixedParticipants.length > 0)
      return {
        status: 'INVALID',
        lineId: line.lineId,
        message: 'Mixed FIXED and PERCENTAGE participants are not supported',
      };

    const weights = pctParticipants.map((p) => p.shareValue);
    // Largest-remainder allocation guarantees Σ allocations === basisAmount.
    const exact = allocate(basisAmount, weights);
    const allocations: Allocation[] = [];

    for (let i = 0; i < pctParticipants.length; i++) {
      const rp = pctParticipants[i];
      const participantId = resolveParticipantId(rp, line);
      if (!participantId) {
        return {
          status: 'INVALID',
          lineId: line.lineId,
          message: `Participant ${rp.type} required by rule ${rule.id} but not documented on the line`,
        };
      }
      allocations.push({
        participantType: rp.type,
        participantId,
        shareType: 'PERCENTAGE',
        shareValue: rp.shareValue,
        basis: rule.basis,
        basisAmount,
        calculatedAmount: exact[i],
        ruleId: rule.id,
        ruleVersion: rule.version,
        ruleTier: resolution.tier,
        explanation: `${rp.type}: ${rp.shareValue}% of ${rule.basis} (${basisAmount}) per rule ${rule.id} v${rule.version} [tier ${resolution.tier}] → ${exact[i]}`,
      });
    }

    const allocatedTotal = sum(allocations.map((a) => a.calculatedAmount));
    if (!withinTolerance(allocatedTotal, basisAmount, allocations.length))
      return {
        status: 'INVALID',
        lineId: line.lineId,
        message: `Allocation total ${allocatedTotal} ≠ basis ${basisAmount}`,
      };

    return {
      status: 'OK',
      lineId: line.lineId,
      basis: rule.basis,
      basisAmount,
      allocations,
      ruleId: rule.id,
      ruleVersion: rule.version,
      ruleTier: resolution.tier,
    };
  }

  // ---- Fixed path ----------------------------------------------------------
  const fixedTotal = sum(fixedParticipants.map((p) => p.shareValue));
  if (basisAmount !== 0 && fixedTotal > basisAmount)
    return {
      status: 'INVALID',
      lineId: line.lineId,
      message: `Fixed shares total ${fixedTotal} exceed basis ${basisAmount}`,
    };

  const fixedAllocations: Allocation[] = [];
  for (const p of fixedParticipants) {
    const participantId = resolveParticipantId(p, line);
    if (!participantId) {
      return {
        status: 'INVALID',
        lineId: line.lineId,
        message: `Participant ${p.type} required by rule ${rule.id} but not documented on the line`,
      };
    }
    fixedAllocations.push({
      participantType: p.type,
      participantId,
      shareType: 'FIXED',
      shareValue: p.shareValue,
      basis: rule.basis,
      basisAmount,
      calculatedAmount: p.shareValue,
      ruleId: rule.id,
      ruleVersion: rule.version,
      ruleTier: resolution.tier,
      explanation: `${p.type}: fixed ${p.shareValue} per rule ${rule.id} v${rule.version} [tier ${resolution.tier}]`,
    });
  }

  return {
    status: 'OK',
    lineId: line.lineId,
    basis: rule.basis,
    basisAmount,
    allocations: fixedAllocations,
    ruleId: rule.id,
    ruleVersion: rule.version,
    ruleTier: resolution.tier,
  };
}

/** Split every line; returns per-line results (OK or typed failure). */
export function splitInvoiceLines(
  lines: SplittableLine[],
  rules: RevenueSplitRule[],
  ctxFor: (line: SplittableLine) => LineRuleContext,
): SplitResult[] {
  return lines.map((line) => splitLine(line, rules, ctxFor(line)));
}

/** True when every line split cleanly — the finalize gate consumes this. */
export function allSplitsValid(results: SplitResult[]): boolean {
  return results.every((r) => r.status === 'OK' || r.status === 'NO_PARTICIPANTS');
}
