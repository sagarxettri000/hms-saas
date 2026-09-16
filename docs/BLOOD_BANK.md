# Blood Bank — Donors & Inventory

## Overview

The Blood Bank module (`/blood-bank`) manages blood donors and the blood unit
inventory. It is built on two existing models — `BloodDonor` and `BloodUnit` —
with the shared `EntityPage` list/create/edit UI on the Donors and Inventory
tabs.

## Endpoints (all tenant-scoped, `JwtAuthGuard → PermissionsGuard → TenantGuard`)

| Method | Path | Permission | Notes |
| ------ | ---- | ---------- | ----- |
| `GET` | `/blood-bank/donors` | `VIEW` | Supports `search` (name/phone/donor code) and `bloodGroup` filters; returns `{ data, total }` |
| `POST` | `/blood-bank/donors` | `CREATE` | Registers a donor; donor code auto-generated (`DNR-#####`) |
| `GET` | `/blood-bank/donors/:id` | `VIEW` | Loads a donor (used by the edit modal); 404 outside the tenant |
| `PATCH` | `/blood-bank/donors/:id` | `EDIT` | Whitelisted-field update; audited with previous values |
| `GET` | `/blood-bank/units` | `VIEW` | Paginated; filters: `status`, `bloodGroup`, `component`, `search` (unit no./location) |
| `POST` | `/blood-bank/units` | `CREATE` | Registers a unit; unit number auto-generated (`BLD-YYYYMMDD-####`); audited |
| `GET` | `/blood-bank/stock` | `VIEW` | Available, non-expired units grouped by blood group + component |
| `PATCH` | `/blood-bank/units/:id/issue` | `EDIT` | Available → ISSUED; refuses expired/non-available units; audited |
| `PATCH` | `/blood-bank/units/:id/discard` | `EDIT` | Status → DISCARDED with a mandatory reason; audited |

## Data model

- **BloodDonor** — name, blood group (enum), phone, email, address, gender,
  date of birth, weight, donor code, last donation date, total donations,
  active flag, medical history.
- **BloodUnit** — unit number (unique per tenant via
  `blood_units_tenantId_unitNumber_key`), optional donor link, blood group
  (enum), component (`WHOLE_BLOOD`, `PACKED_RBC`, `PLATELETS`, `PLASMA`,
  `CRYO`), collection/expiry dates, status, storage location, tested flag and
  test results.

## Statuses

`AVAILABLE` → `RESERVED` | `ISSUED` | `DISCARDED` | `EXPIRED` | `RETURNED`.
Availability (list + stock counts) is computed server-side from
`status = AVAILABLE` **and** `expiryDate > now`; expired units never appear as
available regardless of their stored status.

## Blood group handling

The database stores the `BloodGroup` enum (`A_POS`…`O_NEG`, `UNKNOWN`). The
service normalizes common display spellings (`"O+"`, `"ab-"`, `"b pos"`) onto
the enum at the edge, and both UI forms use the enum select, so the canonical
values are authoritative. Invalid groups are rejected with `400`.

## Register unit flow

Unit number generation is a per-tenant `max + 1` sequence inside the
registration transaction. The `(tenantId, unitNumber)` unique constraint
arbitrates concurrent submissions — the loser retries (up to 3 attempts) with
the next number. Registering a unit linked to a donor increments the donor's
`totalDonations` and `lastDonationDate` in the same transaction.

## Audit

Donor create/update, unit registration, issue and discard write `AuditLog`
entries through the shared `AuditService` (entity `BloodDonor`/`BloodUnit`),
visible on the Audit Logs page.

## Known limitations

- No reservation workflow endpoint (`RESERVED` status exists but is not set by
  any flow yet).
- Expiry is a stored date; no automatic background job flips long-expired units
  to `EXPIRED` — availability logic already excludes them, but the stored
  status of an untouched expired unit remains `AVAILABLE` until acted on.
- No component separation workflow (one registered unit = one component).
- Donor duplicate detection is not enforced (no unique phone/code constraint
  existed); duplicate prevention relies on the auto-generated donor code.
