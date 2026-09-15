# Flow Cytometry Module

The Flow Cytometry module brings immunophenotyping onto the existing
Diagnostic/Laboratory Information System. An order places **one billable panel**
(`FlowCytometryStudy` on the order item), then laboratory staff run the sample
through the panel's fixed marker layout, build a **gated population hierarchy**
with a **per-marker result matrix**, submit reportable populations, and release
a multi-page A4 PDF - all tenant-scoped and audit-logged on top of the sharing
data with the CBC/Hematology and core Laboratory modules.

## Scope & design principles

- **Panels are orderable `LabTest`s** (`discipline = FLOW_CYTOMETRY`,
  `resultType = TEXT`), one panel per order item. The panel definition
  (`LabTestPanel`) declares its marker composition, which resolves through
  `FlowPanelMarker` joins.
- **Markers are `FlowMarker`** configuration (not tests); detailed reportable
  values live in `FlowMarkerResult` per `(population, marker)`.
- **Separation of concerns preserved** (they are separate tables/endpoints):
  raw acquisition runs (`FlowRun`) vs. gated analysis (`FlowPopulation`,
  `FlowAnalysis`) vs. reportable results (`FlowMarkerResult`, populations
  `FINALIZED`). Public APIs expose only whitelisted reportable data.
- **No clinical thresholds are invented**: the module publishes no reference
  ranges, MRD cut-offs, or diagnostic rules. Abnormal/critical flags on marker
  results are set **explicitly by the reviewer** during result entry. Only the
  panel/marker/instrument catalog is data-shipped; interpretation stays
  reviewer-driven and is released by an entitled pathologist.

## Panels

| Code     | Panel                     | Specimen        | Markers                                   | NPR    |
|----------|---------------------------|-----------------|-------------------------------------------|--------|
| FCM-LYS  | Lymphocyte Subset         | Whole Blood     | CD3 CD4 CD8 CD19 CD16 CD56 CD45           | 5,000  |
| FCM-ISP  | Immunophenotyping         | WB / Bone Marrow| CD45 CD19 CD56 CD3 CD5 CD7 CD10 CD20 CD34 CD33 | 8,500 |
| FCM-MRD  | MRD Panel (B-ALL)         | Bone Marrow     | CD19 CD20 CD34 CD45 CD38 CD58 CD10 CD123  | 13,500 |
| FCM-PNH  | PNH Screening             | Whole Blood     | FLAER CD24 CD14 CD15 CD45                 | 6,500  |

Each panel has a fixed fluorochrome layout (one reagent per marker), plus a
reagent (`FlowAntibody`) and instrument (`FlowInstrument`) catalog. `CD45` is
the universal gating marker present in every panel.

## Roles

- **Ordering** - doctors, nurses, ward in-charge, ICU, emergency,
  reception/finance, laboratorians, radiologists and admins (same set as CBC).
- **Performing / verifying** - `LAB_TECHNICIAN`, `PATHOLOGIST`, `RADIOLOGIST`,
  `HOSPITAL_*`, `PLATFORM_SUPER_ADMIN`.
- **Approve / release (sign)** - `PATHOLOGIST`, `RADIOLOGIST`, `HOSPITAL_*`,
  `PLATFORM_SUPER_ADMIN`.

## Endpoints

All under `/api/v1/flow-cytometry`, tenant-scoped, JWT + `PermissionsGuard`:

| Method & path                                    | Permission | Notes                                        |
|--------------------------------------------------|------------|-----------------------------------------------|
| `GET   /flow-cytometry/catalog`                  | VIEW       | Panels (with marker layout), markers, instruments |
| `POST  /flow-cytometry/ensure-catalog`           | EDIT       | Idempotently (re)creates catalog for tenant   |
| `POST  /flow-cytometry/orders`                   | CREATE     | Create panel order (single billable item)     |
| `GET   /flow-cytometry/orders`                   | VIEW       | Worklist (filter status/patient/search/paged) |
| `GET   /flow-cytometry/orders/:id`               | VIEW       | Order + patient + samples + attached study    |
| `POST  /flow-cytometry/orders/:id/study`         | CREATE     | Start study (study + initial acquisition run) |
| `GET   /flow-cytometry/studies/:id`              | VIEW       | Study: population tree, marker matrix, runs   |
| `POST  /flow-cytometry/studies/:id/runs`         | CREATE     | Append an acquisition run                     |
| `POST  /flow-cytometry/studies/:id/populations`  | CREATE     | Add a gated population (optional parent)      |
| `PATCH /flow-cytometry/populations/:id`          | EDIT       | Update population meta / qualitative          |
| `PATCH /flow-cytometry/populations/:id/marker-results` | EDIT | Upsert a marker result (per population)  |
| `POST  /flow-cytometry/studies/:id/submit`       | EDIT       | Finalize populations + mark item/order ready  |
| `POST  /flow-cytometry/orders/:id/verify`        | VERIFY     | Requires submitted flow results               |
| `POST  /flow-cytometry/orders/:id/approve`       | APPROVE    |                                                |
| `POST  /flow-cytometry/orders/:id/report`        | SIGN       | Release final report                          |
| `GET   /flow-cytometry/orders/:id/report`        | VIEW       | Whitelisted report payload                    |
| `GET   /flow-cytometry/orders/:id/pdf`           | VIEW       | Multi-page A4 PDF (continuation headers, page numbers) |

Order lifecycle reuses the laboratory flow
`ORDERED -> SAMPLE_COLLECTED -> RECEIVED -> PROCESSING -> RESULT_READY ->
VERIFIED -> APPROVED -> REPORTED`. Starting a study moves the order to
`PROCESSING`; `submit` marks the item `RESULT_ENTERED` and order `RESULT_READY`.

## Population model

`FlowPopulation` supports a **hierarchy** via `parentId` (self-relation). A
population carries reviewer-entered `percentage`, `absoluteCount`/`countUnit`,
`qualitative` (e.g. "Dim"/"Bright"), `status` (`PENDING -> RESULT_ENTERED ->
FINALIZED`) and its own `FlowMarkerResult` matrix. `submit` finalizes all
populations with entered results and stages the study
`status = RESULT_ENTERED`. Critical marker results trigger a
`CRITICAL_LAB_RESULT` notification to the ordering doctor.

## Immutability & security

- Result entry is blocked on `VERIFIED/APPROVED/REPORTED` and on
  `REJECTED/CANCELLED` orders.
- Every query filters by `tenantId`; markers are validated against the study's
  own panel before a result can be recorded.
- Report payloads are whitelisted; raw QC/compensation/gating internals are not
  exposed in report/study APIs beyond what is reportable.
- Write operations are audit-logged (`FlowCytometryStudy`, `FlowPopulation`,
  `FlowMarkerResult`, `FlowRun` rows).

## Data model

New Prisma models (migrations `20260915074500_add_flow_cytometry` and
`20260915074600_add_flow_study_status`):

- `FlowMarker` (unique `[tenantId, code]`) - marker catalog
- `FlowAntibody` - reagent per marker
- `FlowInstrument` - acquisition platforms (BD FACSCanto II, FACSCalibur, Cytek Aurora)
- `FlowPanelMarker` (unique `[panelId, markerId]`) - panel <=> marker + fluorochrome + order
- `FlowCytometryStudy` - anchors lab order item, panel (Restrict), sample (SetNull)
- `FlowRun` - acquisition runs (QC / compensation metadata as JSON)
- `FlowAnalysis` - gating analyses (versioned, `DRAFT` default)
- `FlowPopulation` - gated populations with self-referencing hierarchy
- `FlowMarkerResult` (unique `[populationId, markerId]`) - reportable per-marker values

`LabTestPanel` gained `labTestId` (panel <=> orderable test). RLS
(`rls.bootstrap.ts`) covers all flow tables. The migration seeds panels, 23
markers, 30 reagents and 3 instruments idempotently per tenant; the
authoritative catalog lives in `flow-cytometry-catalog.ts` (keep in sync; tests
assert catalog integrity).

## Testing

- `flow-cytometry-catalog.spec.ts` - 23 markers, 4 panels with the exact
  dimensions (7/10/8/5), no clinical thresholds in catalog data.
- `flow-cytometry.service.spec.ts` - mocked-Prisma unit tests: order creation,
  study start, marker validation against panel, submit finalization,
  verify delegation.
- `flow-cytometry-report-pdf.spec.ts` - single-page letterhead/panel/matrix and
  multi-page continuation/count assertions.

## UI

`apps/web/src/app/flow-cytometry/page.tsx` (Diagnostics -> Flow Cytometry,
gated to laboratory/radiology + clinical roles): worklist with create-panel
dialog, order detail with **Start Study**, per-population marker matrix entry
(% / abs count / MFI / abnormal / critical toggles), add/parent populations,
interpretation text, Submit / Verify / Approve / Report actions and multi-page
PDF download.