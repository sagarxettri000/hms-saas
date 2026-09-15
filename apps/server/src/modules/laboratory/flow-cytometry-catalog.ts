/**
 * Authoritative Flow Cytometry panel and marker catalogue.
 *
 * This is CONFIGURATION data (single source of truth for the Flow Cytometry
 * module): the four offered panels, their marker composition (fluorochrome
 * layout) and the instrument catalogue. It deliberately publishes NO clinical
 * thresholds — no reference ranges, no MRD cut-offs, no diagnostic rules.
 * Interpretation of marker percentages / populations stays reviewer-driven;
 * results are released only by an entitled pathologist.
 *
 * Fluorochromes listed here are the fixed acquisition layout for a panel
 * (one reagent per marker per panel). Reportable statuses and population
 * hierarchy are created at study time, never hard-coded here.
 */

export type FlowMarkerCategory =
  | "T_CELL"
  | "T_CELL_HELPER"
  | "T_CELL_CYTOTOXIC"
  | "B_CELL"
  | "PRE_B_CELL"
  | "NK"
  | "MYELOID"
  | "STEM_PROGENITOR"
  | "PLASMA_CELL"
  | "MONOCYTE"
  | "GRANULOCYTE"
  | "LEUKOCYTE_COMMON"
  | "SCREENING";

export interface FlowMarker {
  code: string;
  name: string;
  category: FlowMarkerCategory;
}

export interface FlowPanelMarkerDef {
  markerCode: string;
  fluorochrome: string;
  sortOrder: number;
}

export interface FlowPanelDef {
  code: string;
  name: string;
  category: string;
  specimenType: string;
  container: string;
  description: string;
  price: number;
  turnaroundTime: number;
  markers: FlowPanelMarkerDef[];
}

export interface FlowInstrumentDef {
  code: string;
  name: string;
  platform: string;
  manufacturer: string;
  model: string;
  channels: number;
  location: string;
}

export const FLOW_CYTOMETRY_DISCIPLINE = "FLOW_CYTOMETRY";

export const FLOW_MARKERS: FlowMarker[] = [
  { code: "CD45", name: "CD45", category: "LEUKOCYTE_COMMON" },
  { code: "CD3", name: "CD3", category: "T_CELL" },
  { code: "CD4", name: "CD4", category: "T_CELL_HELPER" },
  { code: "CD8", name: "CD8", category: "T_CELL_CYTOTOXIC" },
  { code: "CD5", name: "CD5", category: "T_CELL" },
  { code: "CD7", name: "CD7", category: "T_CELL" },
  { code: "CD19", name: "CD19", category: "B_CELL" },
  { code: "CD20", name: "CD20", category: "B_CELL" },
  { code: "CD22", name: "CD22", category: "B_CELL" },
  { code: "CD10", name: "CD10", category: "PRE_B_CELL" },
  { code: "CD13", name: "CD13", category: "MYELOID" },
  { code: "CD33", name: "CD33", category: "MYELOID" },
  { code: "CD34", name: "CD34", category: "STEM_PROGENITOR" },
  { code: "CD38", name: "CD38", category: "PLASMA_CELL" },
  { code: "CD16", name: "CD16", category: "NK" },
  { code: "CD56", name: "CD56", category: "NK" },
  { code: "CD58", name: "CD58", category: "B_CELL" },
  { code: "CD64", name: "CD64", category: "MONOCYTE" },
  { code: "CD14", name: "CD14", category: "MONOCYTE" },
  { code: "CD15", name: "CD15", category: "GRANULOCYTE" },
  { code: "CD24", name: "CD24", category: "GRANULOCYTE" },
  { code: "CD123", name: "CD123", category: "STEM_PROGENITOR" },
  { code: "FLAER", name: "FLAER", category: "SCREENING" },
];

export const FLOW_MARKERS_BY_CODE: Record<string, FlowMarker> =
  Object.fromEntries(FLOW_MARKERS.map((m) => [m.code, m]));

export const FLOW_PANELS: FlowPanelDef[] = [
  {
    code: "FCM-LYS",
    name: "Lymphocyte Subset Panel",
    category: "Flow Cytometry",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    description: "Lymphocyte subset analysis with CD4/CD8 counts",
    price: 5000,
    turnaroundTime: 1440,
    markers: [
      { markerCode: "CD3", fluorochrome: "FITC", sortOrder: 1 },
      { markerCode: "CD4", fluorochrome: "PE", sortOrder: 2 },
      { markerCode: "CD8", fluorochrome: "PerCP", sortOrder: 3 },
      { markerCode: "CD19", fluorochrome: "APC", sortOrder: 4 },
      { markerCode: "CD16", fluorochrome: "PE-Cy7", sortOrder: 5 },
      { markerCode: "CD56", fluorochrome: "PE-Cy7", sortOrder: 6 },
      { markerCode: "CD45", fluorochrome: "APC-H7", sortOrder: 7 },
    ],
  },
  {
    code: "FCM-ISP",
    name: "Immunophenotyping Panel",
    category: "Flow Cytometry",
    specimenType: "Whole Blood / Bone Marrow",
    container: "EDTA (lavender top)",
    description: "Acute leukemia / lymphoma immunophenotyping screen",
    price: 8500,
    turnaroundTime: 2880,
    markers: [
      { markerCode: "CD45", fluorochrome: "APC-H7", sortOrder: 1 },
      { markerCode: "CD19", fluorochrome: "FITC", sortOrder: 2 },
      { markerCode: "CD56", fluorochrome: "PE", sortOrder: 3 },
      { markerCode: "CD3", fluorochrome: "PerCP-Cy5.5", sortOrder: 4 },
      { markerCode: "CD5", fluorochrome: "PE-Cy7", sortOrder: 5 },
      { markerCode: "CD7", fluorochrome: "APC", sortOrder: 6 },
      { markerCode: "CD10", fluorochrome: "APC-Cy7", sortOrder: 7 },
      { markerCode: "CD20", fluorochrome: "Pacific Blue", sortOrder: 8 },
      { markerCode: "CD34", fluorochrome: "PE-Cy7", sortOrder: 9 },
      { markerCode: "CD33", fluorochrome: "PE", sortOrder: 10 },
    ],
  },
  {
    code: "FCM-MRD",
    name: "MRD Panel (B-ALL)",
    category: "Flow Cytometry",
    specimenType: "Bone Marrow",
    container: "Heparin",
    description: "Minimal residual disease assessment (B-ALL)",
    price: 13500,
    turnaroundTime: 4320,
    markers: [
      { markerCode: "CD19", fluorochrome: "FITC", sortOrder: 1 },
      { markerCode: "CD20", fluorochrome: "PE", sortOrder: 2 },
      { markerCode: "CD34", fluorochrome: "PerCP-Cy5.5", sortOrder: 3 },
      { markerCode: "CD45", fluorochrome: "V500", sortOrder: 4 },
      { markerCode: "CD38", fluorochrome: "PE-Cy7", sortOrder: 5 },
      { markerCode: "CD58", fluorochrome: "FITC", sortOrder: 6 },
      { markerCode: "CD10", fluorochrome: "APC", sortOrder: 7 },
      { markerCode: "CD123", fluorochrome: "PE", sortOrder: 8 },
    ],
  },
  {
    code: "FCM-PNH",
    name: "PNH Screening Panel",
    category: "Flow Cytometry",
    specimenType: "Whole Blood",
    container: "EDTA (lavender top)",
    description: "Paroxysmal nocturnal hemoglobinuria screening",
    price: 6500,
    turnaroundTime: 2880,
    markers: [
      { markerCode: "FLAER", fluorochrome: "FITC", sortOrder: 1 },
      { markerCode: "CD24", fluorochrome: "PE", sortOrder: 2 },
      { markerCode: "CD14", fluorochrome: "PerCP-Cy5.5", sortOrder: 3 },
      { markerCode: "CD15", fluorochrome: "FITC", sortOrder: 4 },
      { markerCode: "CD45", fluorochrome: "APC-H7", sortOrder: 5 },
    ],
  },
];

export const FLOW_PANELS_BY_CODE: Record<string, FlowPanelDef> =
  Object.fromEntries(FLOW_PANELS.map((p) => [p.code, p]));

export const FLOW_INSTRUMENTS: FlowInstrumentDef[] = [
  {
    code: "canto",
    name: "BD FACSCanto II - Main Lab",
    platform: "FACSCanto II",
    manufacturer: "BD Biosciences",
    model: "FACSCanto II",
    channels: 8,
    location: "Pathology Lab",
  },
  {
    code: "calibur",
    name: "BD FACSCalibur - Hematology",
    platform: "FACSCalibur",
    manufacturer: "BD Biosciences",
    model: "FACSCalibur",
    channels: 4,
    location: "Hematology Lab",
  },
  {
    code: "aurora",
    name: "Cytek Aurora - North Wing",
    platform: "Cytek Aurora",
    manufacturer: "Cytek Biosciences",
    model: "Aurora",
    channels: 18,
    location: "North Wing Lab",
  },
];

export const FLOW_INSTRUMENTS_BY_CODE: Record<string, FlowInstrumentDef> =
  Object.fromEntries(FLOW_INSTRUMENTS.map((i) => [i.code, i]));