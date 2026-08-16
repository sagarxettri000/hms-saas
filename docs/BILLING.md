# HMS SaaS — Billing

> How money flows through the system. Financial correctness is a top priority (see [ROADMAP.md](ROADMAP.md)).

## Core Flow

```
Service (BillingService/BillingScheme) → Invoice → InvoiceItem
                                          ├── Payment   (paid)
                                          ├── Deposit   (prepay, applied to invoice)
                                          ├── Refund    (reverse payment)
                                          ├── CreditAccount (isCredit invoices)
                                          └── DailyClosing (day-end reconciliation)
```

## Invoice

- Types: OPD, IPD, EMERGENCY, SPECIAL_OPD, PROCEDURE, SERVICE, DISCHARGE, LAB, RADIOLOGY, PHARMACY, OT, AMBULANCE.
- Status: DRAFT → PENDING → PARTIAL → PAID; also OVERDUE / CANCELLED / REFUNDED.
- Math: `lineTotal = (qty × rate) − discount + tax`; `total = Σ lines`; `due = total − paid`.
- **Discount**: requires approval (`discountApprovedBy`, `discountStatus`), except when applied via an approved `BillingScheme`.
- **BillingScheme**: named discount rules (e.g. "Staff 10%") applied at invoice creation.

## Payments

- Methods: CASH, CARD, BANK, ONLINE, WALLET, INSURANCE, CREDIT, OTHER.
- **Idempotency**: `@@unique([tenantId, idempotencyKey])` prevents duplicate payment records on retry.
- Applying a payment updates `Invoice.paidAmount` / `dueAmount`; status rolls PENDING → PARTIAL → PAID.
- `PaymentType`: INVOICE, DEPOSIT, REFUND, ADJUSTMENT.

## Deposits

- Admission/OT/procedure deposits; `Deposit.balance` tracked per `DepositTransaction` (RECEIVED / APPLIED / REFUNDED / TRANSFERRED).
- Applied deposits offset invoice dues; partial application allowed.

## Refunds

- Full lifecycle: REQUESTED → APPROVED / REJECTED → COMPLETED.
- Refund is tied to a `Payment` (and optionally `Invoice`); must be approved before processing.
- Refund method mirrors original where possible.

## Credit

- `CreditAccount` per patient with `creditLimit` + `outstanding`; status OPEN / PARTIAL / SETTLED / OVERDUE.
- `Invoice.isCredit` links to credit account; settlement clears outstanding.

## Doctor Share

- `DoctorShareRule` (PERCENTAGE or FIXED, scoped to doctor / department / service / scheme).
- `DoctorShareTransaction` computes hospitalShare vs doctorShare per invoice; status PENDING → CALCULATED → APPROVED → PAID.

## Insurance

- `InsuranceProvider` → `InsurancePolicy` (per patient) → `InsuranceClaim` (DRAFT → SUBMITTED → PROCESSING → APPROVED/REJECTED → SETTLED).
- Claims reference invoices; approved amounts can settle invoice dues.

## Day-End / Reconciliation

- **CashSession**: cashier opens session (openingCash), closes with closingCash; difference = closing − expected.
- **CashHandover**: transfer cash between sessions/users, with confirmation.
- **DailyClosing**: one per tenant per date; totals sales, collections by method, refunds, deposits; `expectedCash` vs `actualCash`.
- **FinancialTransaction**: unified ledger trail (DEBIT/CREDIT) for every money event — the audit source of truth for finance.

## Accounting Integration

- Double-entry via `Account` (chart) → `JournalEntry` → `JournalLine` (debit/credit balanced).
- Financial events should post journal entries; keep the ledger balanced.

## Rules & Gotchas

- Money columns are `Decimal` — never compare/round in JS without explicit scale handling.
- Discounts and refunds need approvals — do not bypass.
- Payments require idempotency keys from the client on retry.
- Always record who (`createdBy`/`settledBy`/`receivedBy`) performed a financial action.
- Reconcile DailyClosing before closing a cash session.
