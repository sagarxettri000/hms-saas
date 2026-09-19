# Revenue Engine Blueprint — Swasthya HMS

> Status of the implementation program derived from the full integrated
> registration → encounter → scheme → utilization → billing → claim →
> revenue-split → settlement → audit specification. Companion to
> `docs/ARCHITECTURE.md` and `docs/PROJECT_STATUS.md`.

## 1. Design principle

> Every clinical service, billable item, payment, scheme rule, participant,
> and revenue split must be traceable from the original patient encounter
> through the final invoice and financial settlement without ambiguity or
> calculation discrepancies.

The final invoice is the **Single Source of Truth (SSOT)**: it must record,
per line, the frozen scheme, billing mode, price rule, revenue rule version,
participants, calculation basis, and computed splits — enough to *reconstruct*
the financial calculation at any later date without re-deriving anything from
today's configuration.

## 2. What already exists (do not duplicate)

| Spec area | Existing foundation |
|---|---|
| Patient identity | `Patient` model with MRN (`patientId`), category, corporate fields |
| Encounter / admission | `Encounter`, `Admission` (with type, consultant, bed link) |
| Consultant | `Admission.admittingDoctorId` (primary), doctor role fields on OT, encounters |
| Utilization → billing bridge | `ChargeTransaction` (`sourceModule`, `sourceTransactionId`, `billingStatus`, `dischargeBillId`) — the "performed service" ledger |
| Billable items | `InvoiceItem` with `serviceId`, `referenceType`/`referenceId` source pointers |
| Service catalog | `BillingService` (+ `ServiceCategory`), multi-tier rates (`insuranceRate`, `corporateRate`, …) |
| Schemes | `BillingScheme` (discount %, JSON rules) |
| Claims | `InsuranceClaim` with lifecycle (DRAFT→SUBMITTED→APPROVED→SETTLED) |
| Payments | `Payment` with **unique idempotency key**, methods, statuses |
| Deposits | `Deposit` + `DepositTransaction` ledger (RECEIVED/APPLIED/REFUNDED) |
| Refunds | `Refund` with request/approve/reject workflow |
| Discounts | Invoice-level fields with requester/approver separation |
| Immutability-adjacent | `DailyClosing` (day closure), `FinancialTransaction` ledger, `AuditLog` |
| Doctor shares | `DoctorShareRule` + `DoctorShareTransaction` (PENDING→CALCULATED→APPROVED→PAID) |
| Accounting | `Account` / `JournalEntry` / `JournalLine` |
| Periods | `DailyClosing` exists (day grain); month-end derived from it |

## 3. Gap analysis vs the specification

### G1 — Revenue engine correctness (highest priority)
* Current `calculateForInvoice` uses **`lineTotal` − discount** as the split
  basis, and `lineTotal` is **tax-inclusive** → doctor shares currently
  include tax. Violates §15 ("amount excluding tax" basis).
* Rule resolution is **first-match-wins** over `find()` result order — not the
  deterministic priority chain (§46/§17): scheme+service > scheme+category >
  billing-mode+service > encounter-type+service > default. No conflict
  detection when two rules tie.
* Doctor-only participants. Spec requires per-line multi-participant splits:
  surgeon / assistant / anesthetist / technician / department / hospital with
  roles (§13, §18).
* Shares computed at **invoice level aggregation**; spec requires **per line
  item** splits with participant resolution from documented participation.
* No `RevenueAllocation` persistence → no SSOT per-line split records, no
  refund reversals referencing original splits (§22).
* No 100%-sum validation with configurable tolerance and deterministic
  residual assignment (§19, §20).

### G2 — Scheme/payor effective dating
* `BillingScheme` is a flat discount table with JSON rules — no effective
  dating, versions, price lists, or per-encounter frozen context (§3, §4).
* Patient ↔ scheme linkage is only implicit (`invoice.schemeId`). No
  `PatientPayor` (primary/secondary, eligibility window, coverage limits,
  co-pay, deductible, authorization requirements) with effective dates (§2.1).
* Historical invoices keep `schemeId` but not the resolved price/split rule
  **versions** frozen at billing time (§4, §16).

### G3 — Order vs execution gating
* `ChargeTransaction.billingStatus` (UNBILLED/BILLED/CANCELLED) exists, but
  invoice creation accepts `referenceType/referenceId` **without consuming**
  the charge — nothing prevents the same utilization being billed twice
  (§32 duplicate billing) or an unbilled-status charge from being invoiced.
* No engine-enforced "no charge without performed/verified source" rule.

### G4 — Finalization gate, immutability, idempotency
* Invoice statuses exist but there is **no `FINALIZED` state machine**: any
  invoice can be edited via update paths; no lock at finalization, no
  validation engine run (§24, §47), no immutable-beyond-finalize enforcement
  (§34).
* `Payment` has idempotency, invoice creation does not (§38).
* Consultant change is silent overwrite (`admittingDoctorId` update) — spec
  §7.1 requires assignment history (append-only).

### G5 — Claims reconciliation detail
* `InsuranceClaim` tracks claimed/approved but not **received** amount nor
  per-item `ClaimItem` reconciliation (§26, §27); no
  claimed vs approved vs received variance reporting.

### G6 — Reconciliation exceptions surface
* No "performed-not-billed / billed-without-utilization / missing-rule /
  over-allocated" exception dashboard (§42, §53). The data to detect these
  exists in `ChargeTransaction` + new allocation records.

### G7 — Small correctness items
* `Invoice.taxAmount` is not stored per item and `InvoiceItem.taxAmount`
  currently accumulates **tax on discounted value while `lineTotal` also
  includes tax** — consistent, but the **discount is applied after tax-inclusive
  basis** in `createInvoice` (see G1) and there is no stored per-line
  `netAmount` (excl. tax) to use as an allocation basis.
* `DischargeBill.roundingAdjustment` is `@db.Decimal(2,2)` — caps at ±0.99,
  and silently rounds on write (Prisma 5 truncates/rounds on out-of-range).
  Widen to (14,2).
* `DoctorShareTransaction` aggregate rows cannot represent multi-participant
  or per-line provenance (see G1) — superseded by `RevenueAllocation` but
  kept for backward compatibility (calculated from the same engine output).

## 4. Phased plan

* **Phase 1 (implemented in this program):** the financial core —
  `@hms/shared` money/rounding + rule resolver + split engine (pure functions,
  shared by server and reports), schema additions (`PatientPayor`,
  `RevenueSplitRule` versioned, `RevenueAllocation` per-line-per-participant,
  `ConsultantAssignment` history, `Invoice.finalizedAt/finalizedBy/finalization
  snapshot`, `InvoiceItem` SSOT columns: `netAmount`, `schemeId`, `billingMode`,
  `priceRuleId`, `priceRuleVersion`, `revenueRuleId`, `revenueRuleVersion`,
  `chargeTransactionId`), billing finalize gate + validation engine +
  idempotency, utilization consumption (double-billing prevention),
  refund → allocation reversal, reconciliation exceptions endpoint, and
  regression tests.
* **Phase 2:** UI surfaces (payor assignment at registration, consultant
  assignment UI, revenue-split statement report, exception dashboard page,
  claims received-amount tracking).
* **Phase 3:** pharmacy dispense→administer reconciliation and IPD running
  bill; month-end close wizard building on `DailyClosing`.

## 5. Invariants the engine enforces

1. `Invoice.totalAmount = Σ line.lineTotal` (and `Σ net + Σ tax − discounts`).
2. `paid + refunds-applied + adjustments = total − due`.
3. Per line: `Σ participant allocation = basis × 100% (± tolerance)`.
4. Billed lines reference a consumed `ChargeTransaction` unless the service is
   explicitly a non-utilization charge (e.g., admin fee) — enforced by the
   `requiresUtilization` service flag.
5. Historical invoices are reproducible: frozen rule IDs + versions + basis +
   percentages on every allocation row.
6. Finalized invoices are immutable except via credit-note/adjustment
   workflows, which are themselves audited.
