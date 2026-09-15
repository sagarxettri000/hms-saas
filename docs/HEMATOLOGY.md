# Hematology Module (CBC)

The Hematology module delivers a complete-blood-count (CBC) experience on top of
the existing Diagnostic/Laboratory Information System: a deterministic 14-test
catalog, CBC order creation that expands into a panel, result entry by perform
staff (including **radiologists**), flagging, verification/approval/release with
finalized-report immutability, whitelisted report payloads and A4 PDFs.

## Scope & workflow

The CBC (Complete Blood Count) is a **single billable laboratory service**
(`LAB-CBC`, already present as NPR 500 in the Service Master). Orders placed
through the Hematology module internally expand into 14 zero-priced components
so each measurement is tracked and flagged individually:

| Component          | Unit       | Reference range (adult)        | Method                          |
|--------------------|------------|--------------------------------|---------------------------------|
| TLC / WBC          | x10^3/uL   | 4.0 - 11.0                     | Automated hematology analyzer   |
| Neutrophils        | %          | 40 - 75                        | Automated 5-part differential   |
| Lymphocytes        | %          | 20 - 45                        | Automated 5-part differential   |
| Monocytes          | %          | 2 - 10                         | Automated 5-part differential   |
| Eosinophils        | %          | 1 - 6                          | Automated 5-part differential   |
| Basophils          | %          | 0 - 1                          | Automated 5-part differential   |
| Hemoglobin (HGB)   | g/dL       | M 13.5-17.5 · F 12.0-15.5      | Automated hematology analyzer   |
| RBC                | x10^6/uL   | M 4.5-5.9 · F 4.0-5.3          | Automated hematology analyzer   |
| PCV (Hematocrit)   | %          | M 40-54 · F 36-48              | Automated hematology analyzer   |
| MCV                | fL         | 80 - 100                       | Calculated (RBC indices)        |
| MCH                | pg         | 27 - 34                        | Calculated (RBC indices)        |
| MCHC               | g/dL       | 31 - 36                        | Calculated (RBC indices)        |
| Platelets          | x10^3/uL   | 150 - 450                      | Automated hematology analyzer   |
| ESR                | mm/hr      | M 0-15 · F 0-20                | Westergren                      |

HGB, RBC, PCV and ESR are sex-aware (rows carry a `MALE | FEMALE | OTHER`
discriminator). Patients with an unrecorded or non-binary gender resolve to the
explicit "adult (combined)" reference row.

## Roles

- **Ordering ("ask")** - doctors, nurses, ward in-charge, ICU, emergency,
  reception/finance, laboratorians, radiologists and admins.
- **Performing** - `LAB_TECHNICIAN`, `PATHOLOGIST`, `RADIOLOGIST`, `HOSPITAL_*`,
  `PLATFORM_SUPER_ADMIN` (same set can verify). **Radiologists perform CBC.**
- **Approve / release (sign)** - `PATHOLOGIST`, `RADIOLOGIST`, `HOSPITAL_*`,
  `PLATFORM_SUPER_ADMIN`.
- **Billing** - unchanged. Reception/finance add the billable `LAB-CBC` service
  via existing billing. Doctors and nurses remain blocked from the billing
  module by `ForbidRolesGuard` (order-only).

## Endpoints

All under `/api/v1/hematology` and tenant-scoped (`TenantGuard` + `TenantScoped`)
with JWT + `PermissionsGuard` and `@Roles` allow-lists:

| Method & path                                   | Permission | Notes                                         |
|-------------------------------------------------|------------|------------------------------------------------|
| `GET   /hematology/catalog`                     | VIEW       | CBC panel + 14 components + reference data     |
| `POST  /hematology/ensure-catalog`              | EDIT       | Idempotently (re)creates catalog for tenant    |
| `POST  /hematology/orders`                      | CREATE     | Order CBC; expands to 14 zero-priced items     |
| `GET   /hematology/orders`                      | VIEW       | List (paged, filter by status/patient/search)  |
| `GET   /hematology/orders/:id`                  | VIEW       | Order + patient + items (serialized) + samples |
| `GET   /hematology/orders/:id/report`           | VIEW       | Whitelisted report payload only                |
| `PATCH /hematology/orders/:id/items/:id/result` | EDIT       | Perform step (performer roles)                 |
| `POST  /hematology/orders/:id/verify`           | VERIFY     | Requires all 14 results entered                 |
| `POST  /hematology/orders/:id/approve`          | APPROVE    |                                                 |
| `POST  /hematology/orders/:id/report`           | SIGN       | Release final report                           |
| `GET   /hematology/orders/:id/pdf`              | VIEW       | A4 PDF, Method column, letterhead, barcode     |

Order lifecycle reuses the laboratory flow
`ORDERED -> SAMPLE_COLLECTED -> RECEIVED -> PROCESSING -> RESULT_READY (per item
RESULT_ENTERED) -> VERIFIED -> APPROVED -> REPORTED` (plus `REJECTED`).

## Flagging (deterministic)

`evaluateFlag(value, resolvedRange)` in `hematology-catalog.ts`:

- inside range -> `NORMAL`
- below low / above high -> `ABNORMAL`
- below `0.5 x low` / above `2 x high` -> `CRITICAL` (also triggers a critical
  notification to the ordering doctor)

Ranges are **reference-only configured data** - the module never derives or
infers a diagnosis.

## Immutability & security

- Once an order reaches `VERIFIED/APPROVED/REPORTED`, result entry is blocked;
  `REJECTED/CANCELLED` orders are also blocked.
- Every service query filters by `tenantId` (anti-IDOR / cross-tenant).
  `ensure-catalog` is an explicit admin-performer action; new tenants get the
  catalog automatically on their first Hematology order.
- Verification requires **all** panel items to have entered results.
- Report payloads are whitelisted; the PDF is generated server-side (hospital
  letterhead with PAN/VAT/Reg, patient/sample details, barcode as text, results
  table `Test | Result | Unit | Ref. Range | Flag | Method`, colored flags,
  pending handlers and electronic signature line).
- Write operations are audit-logged (`LabOrder` audit rows).

## Data model

New Prisma models/fields (migration `20260915070840_add_hematology_catalog_and_panels`):

- `LabTest` += `method`, `precision`, `resultType`, `referenceRanges (Json)`,
  `sortOrder`
- `LabOrderItem` += `method`, `precision`, `resultType`, `refLow`, `refHigh`,
  `rangeLabel`, `resultEnteredBy`, `resultEnteredAt`
- `LabTestPanel`, `LabTestPanelItem` - CBC panel definition (unique per
  `[tenantId, code]`).

The migration also **seeds the 14-component catalog + CBC panel idempotently for
every existing tenant** (data-shipped so `migrate deploy` on Railway populates
production without running the seed script). The authoritative values live in
`apps/server/src/modules/laboratory/hematology-catalog.ts` - keep both in sync
when ranges change (tests assert catalog integrity).

## Testing

- `apps/server/src/modules/laboratory/hematology-catalog.spec.ts` - catalog
  completeness, sex-aware resolution, deterministic flags, display helpers.
- `apps/server/src/modules/laboratory/lab-report-pdf.spec.ts` - PDF header,
  letterhead identifiers, Method column, flags, pending states, barcode,
  e-signature.

## UI

`apps/web/src/app/hematology/page.tsx` (Diagnostics -> Hematology, gated to
laboratory/radiology + clinical roles): order list (create begins a CBC),
detail view with per-component result entry for performers and
Verify/Approve/Report actions, PDF download. The Laboratory test catalog gained
a Method column and method/precision form fields.