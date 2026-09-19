/**
 * Money math and rounding policy — the ONLY place financial rounding happens.
 *
 * Policy (docs/REVENUE_ENGINE_BLUEPRINT.md §5, spec §20):
 *  - Currency scale is 2 (NPR paisa).
 *  - Intermediate computations carry 4 decimals; storage/reporting is 2.
 *  - Rounding is half-up on absolute value (determinism beats symmetry for
 *    auditability — the same inputs must always produce the same outputs).
 *  - Distributions of an amount across N participants use largest-remainder
 *    allocation, with the residual assigned deterministically (first
 *    participant in rule-priority order), so Σ parts === total exactly.
 *
 * Everything operates on plain JS numbers guarded by scale helpers; callers
 * must pass already-validated finite numbers (server-side validateMoney).
 */

export const CURRENCY_SCALE = 2;
export const INTERMEDIATE_SCALE = 4;

/** Round half-up to `scale` decimals. Negative values round half-up on |v|. */
export function round(value: number, scale = CURRENCY_SCALE): number {
  if (!Number.isFinite(value)) return 0;
  const f = Math.pow(10, scale);
  const sign = value < 0 ? -1 : 1;
  return (Math.round(Math.abs(value) * f + Number.EPSILON) / f) * sign;
}

/** Round to intermediate precision (4 dp) to stop error accumulation. */
export function intermediate(value: number): number {
  return round(value, INTERMEDIATE_SCALE);
}

/** sum a list of money numbers at intermediate precision. */
export function sum(values: number[]): number {
  return intermediate(values.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0));
}

/**
 * Percentage of a basis, at intermediate precision.
 * `percentageOf(9000, 50)` → 4500.
 */
export function percentageOf(basis: number, percent: number): number {
  return intermediate((basis * percent) / 100);
}

/**
 * Allocate `total` across weights (largest-remainder). The returned parts sum
 * to `total` exactly at currency scale. Zero-sum weights distribute evenly.
 */
export function allocate(total: number, weights: number[], scale = CURRENCY_SCALE): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const f = Math.pow(10, scale);
  const target = Math.round(total * f);
  const weightSum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  const even = target / n;

  if (weightSum <= 0) {
    // even split with deterministic residual on the last participant
    const parts = weights.map(() => Math.floor(even * f) / f);
    const residual = round(total - parts.reduce((a, p) => a + p, 0), scale);
    parts[n - 1] = round(parts[n - 1] + residual, scale);
    return parts;
  }

  const raw = weights.map((w) => (Math.max(0, w) / weightSum) * target);
  const floors = raw.map((r) => Math.floor(r + 1e-9));
  let residualUnits = target - floors.reduce((a, fl) => a + fl, 0);

  // largest fractional remainder first; ties resolved by index order (stable,
  // deterministic). residualUnits is small (< n) by construction.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const units = floors.slice();
  for (const { i } of order) {
    if (residualUnits <= 0) break;
    units[i] += 1;
    residualUnits -= 1;
  }
  return units.map((u) => u / f);
}

/** 2-dp display formatting (thousands separators, NPR-style grouping). */
export function formatMoney(value: number, currency = 'NPR'): string {
  const v = round(value);
  const s = Math.abs(v).toFixed(2);
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${v < 0 ? '-' : ''}${grouped}.${dec}`;
}

/**
 * Deterministic tolerance check for invariant "Σ shares === allocated basis".
 * Tolerance is half a paisa per participant by default.
 */
export function withinTolerance(a: number, b: number, participants = 1): boolean {
  const tol = 0.005 * Math.max(1, participants);
  return Math.abs(round(a, CURRENCY_SCALE) - round(b, CURRENCY_SCALE)) <= tol;
}
