/**
 * Authoritative Hematology test catalog.
 *
 * These are standard published ADULT reference ranges (WHO / routine laboratory
 * text conventions), stored here as the single source of truth for the
 * Hematology module. They are REFERENCE-ONLY data used for deterministic
 * abnormal/normal flagging and report display. This module never derives or
 * infers a diagnosis from these ranges.
 *
 * Sex-aware entries carry a `sex` discriminator (MALE | FEMALE | OTHER). The
 * OTHER row is an explicit "adult (combined)" reference used when the patient's
 * recorded gender does not fall into MALE/FEMALE. Ranges are editable per
 * tenant via the lab-test catalog.
 *
 * Precision = decimal places used when rendering numeric results.
 *
 * Flag rule (matches LaboratoryService.evaluateReferenceRange): a value below
 * the low bound or above the high bound flags ABNORMAL; below 0.5x low or
 * above 2x high flags CRITICAL; otherwise NORMAL.
 */

export type HematologySex = "MALE" | "FEMALE" | "OTHER";

export interface HematologyRange {
  label: string; // display label, e.g. "Adult male"
  low: number | null;
  high: number | null;
  sex?: HematologySex;
  unit?: string; // range display unit (falls back to test unit)
  note?: string;
}

export interface HematologyTest {
  code: string;
  name: string;
  category: string;
  discipline: string;
  specimenType: string;
  container: string;
  unit: string;
  method: string;
  precision: number;
  resultType: "NUMERIC" | "TEXT";
  ranges: HematologyRange[];
  turnaroundTime?: number;
}

export interface HematologyPanel {
  code: string;
  name: string;
  category: string;
  specimenType: string;
  container: string;
  description: string;
  memberCodes: string[];
}

export const HEMATOLOGY_PANEL_CODE = "CBC";

export const HEMATOLOGY_PANEL: HematologyPanel = {
  code: HEMATOLOGY_PANEL_CODE,
  name: "Complete Blood Count",
  category: "Hematology",
  specimenType: "Whole Blood",
  container: "EDTA (lavender top)",
  description: "CBC with five-part differential, platelet count and ESR",
  memberCodes: [
    "TLC",
    "NEU",
    "LYM",
    "MONO",
    "EOS",
    "BASO",
    "HGB",
    "RBC",
    "PCV",
    "MCV",
    "MCH",
    "MCHC",
    "PLT",
    "ESR",
  ],
};

export const HEMATOLOGY_CATALOG: HematologyTest[] = [
  {
    code: "TLC",
    name: "Total Leukocyte Count",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "x10^3/uL",
    method: "Automated hematology analyzer",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 4.0, high: 11.0 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "NEU",
    name: "Neutrophils",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "%",
    method: "Automated 5-part differential",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 40, high: 75 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "LYM",
    name: "Lymphocytes",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "%",
    method: "Automated 5-part differential",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 20, high: 45 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "MONO",
    name: "Monocytes",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "%",
    method: "Automated 5-part differential",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 2, high: 10 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "EOS",
    name: "Eosinophils",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "%",
    method: "Automated 5-part differential",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 1, high: 6 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "BASO",
    name: "Basophils",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "%",
    method: "Automated 5-part differential",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 0, high: 1 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "HGB",
    name: "Hemoglobin",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "g/dL",
    method: "Automated hematology analyzer",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult male", low: 13.5, high: 17.5, sex: "MALE" },
      { label: "Adult female", low: 12.0, high: 15.5, sex: "FEMALE" },
      { label: "Adult (combined)", low: 12.0, high: 16.0, sex: "OTHER", note: "Combined adult reference" },
    ],
    turnaroundTime: 120,
  },
  {
    code: "RBC",
    name: "RBC",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "x10^6/uL",
    method: "Automated hematology analyzer",
    precision: 2,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult male", low: 4.5, high: 5.9, sex: "MALE" },
      { label: "Adult female", low: 4.0, high: 5.3, sex: "FEMALE" },
      { label: "Adult (combined)", low: 4.0, high: 5.5, sex: "OTHER", note: "Combined adult reference" },
    ],
    turnaroundTime: 120,
  },
  {
    code: "PCV",
    name: "PCV (Hematocrit)",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "%",
    method: "Automated hematology analyzer",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult male", low: 40, high: 54, sex: "MALE" },
      { label: "Adult female", low: 36, high: 48, sex: "FEMALE" },
      { label: "Adult (combined)", low: 36, high: 50, sex: "OTHER", note: "Combined adult reference" },
    ],
    turnaroundTime: 120,
  },
  {
    code: "MCV",
    name: "MCV",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "fL",
    method: "Calculated (RBC indices)",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 80, high: 100 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "MCH",
    name: "MCH",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "pg",
    method: "Calculated (RBC indices)",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 27, high: 34 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "MCHC",
    name: "MCHC",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "g/dL",
    method: "Calculated (RBC indices)",
    precision: 1,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 31, high: 36 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "PLT",
    name: "Platelets",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    unit: "x10^3/uL",
    method: "Automated hematology analyzer",
    precision: 0,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult", low: 150, high: 450 },
    ],
    turnaroundTime: 120,
  },
  {
    code: "ESR",
    name: "ESR",
    category: "Hematology",
    discipline: "HEMATOLOGY",
    specimenType: "Whole Blood",
    container: "Trisodium citrate (black top)",
    unit: "mm/hr",
    method: "Westergren",
    precision: 0,
    resultType: "NUMERIC",
    ranges: [
      { label: "Adult male", low: 0, high: 15, sex: "MALE" },
      { label: "Adult female", low: 0, high: 20, sex: "FEMALE" },
      { label: "Adult (combined)", low: 0, high: 20, sex: "OTHER", note: "Combined adult reference" },
    ],
    turnaroundTime: 120,
  },
];

export const HEMATOLOGY_BY_CODE: Record<string, HematologyTest> =
  Object.fromEntries(HEMATOLOGY_CATALOG.map((t) => [t.code, t]));

export interface ResolvedRange {
  range: HematologyRange;
  label: string;
  low: number | null;
  high: number | null;
  unit: string;
  note?: string;
  isSexSpecific: boolean;
}

/**
 * Pick the reference range for a test based on the patient's recorded gender.
 * Fallback order: exact sex match -> OTHER/combined row -> first row -> null.
 * Returns an explicit "no configured range" resolution when nothing matches so
 * flagging stays deterministic (no flags) rather than falling back to guesses.
 */
export function resolveReferenceRange(
  test: { ranges?: HematologyRange[]; unit?: string; code?: string },
  sex?: string | null,
): ResolvedRange | null {
  const ranges = test.ranges || [];
  if (ranges.length === 0) return null;

  const unit = test.unit || ranges[0].unit || "";
  const pick = (r: HematologyRange): ResolvedRange => ({
    range: r,
    label: r.label || "Reference",
    low: r.low,
    high: r.high,
    unit: r.unit || unit,
    note: r.note,
    isSexSpecific: Boolean(r.sex),
  });

  if (sex === "MALE" || sex === "FEMALE") {
    const exact = ranges.find((r) => r.sex === sex);
    if (exact) return pick(exact);
    const other = ranges.find((r) => r.sex === "OTHER");
    if (other) return pick(other);
  } else {
    // Unknown / non-binary / unrecorded gender: prefer the explicit
    // "combined" adult reference, falling back to the adult male row.
    const other = ranges.find((r) => r.sex === "OTHER");
    if (other) return pick(other);
    const male = ranges.find((r) => r.sex === "MALE");
    if (male) return pick(male);
  }

  const fallback = ranges.find((r) => !r.sex) || ranges[0];
  return pick(fallback);
}

/** Deterministic flag from a resolved range (mirrors LaboratoryService thresholds). */
export function evaluateFlag(
  value: number,
  resolved: ResolvedRange | null,
): { flag: "NORMAL" | "ABNORMAL" | "CRITICAL"; isAbnormal: boolean; isCritical: boolean } {
  if (!resolved) {
    return { flag: "NORMAL", isAbnormal: false, isCritical: false };
  }
  const { low, high } = resolved;
  if (low !== null && high !== null) {
    if (value < low * 0.5 || value > high * 2) {
      return { flag: "CRITICAL", isAbnormal: true, isCritical: true };
    }
    if (value < low || value > high) {
      return { flag: "ABNORMAL", isAbnormal: true, isCritical: false };
    }
    return { flag: "NORMAL", isAbnormal: false, isCritical: false };
  }
  if (low !== null && value < low) {
    if (value < low * 0.5) return { flag: "CRITICAL", isAbnormal: true, isCritical: true };
    return { flag: "ABNORMAL", isAbnormal: true, isCritical: false };
  }
  if (high !== null && value > high) {
    if (value > high * 2) return { flag: "CRITICAL", isAbnormal: true, isCritical: true };
    return { flag: "ABNORMAL", isAbnormal: true, isCritical: false };
  }
  return { flag: "NORMAL", isAbnormal: false, isCritical: false };
}

/** Human-readable range string for a resolved range (used on the report). */
export function rangeDisplay(resolved: ResolvedRange | null): string {
  if (!resolved) return "";
  const { low, high } = resolved;
  if (low !== null && high !== null) return `${low} - ${high}`;
  if (low !== null) return `>= ${low}`;
  if (high !== null) return `<= ${high}`;
  return "";
}