# HMS SaaS — Product Requirements

> Source of truth for what the system must do. Living document — update as scope changes.

## 1. Overview

HMS SaaS is a multi-tenant, enterprise-grade Hospital Management System serving Nepali hospitals and clinics. Each hospital (tenant) gets its own isolated workspace with users, patients, and clinical/financial workflows. The platform operator manages subscriptions and tenants.

## 2. Roles

### Platform level
- **PLATFORM_SUPER_ADMIN** — manage tenants, plans, subscriptions, feature flags.

### Tenant (hospital) level
- **HOSPITAL_ADMIN / HOSPITAL_OWNER** — full control of hospital data.
- **DEPARTMENT_HEAD** — department oversight.
- **RECEPTIONIST / RECEPTION_SUPERVISOR** — registration, appointments, basic billing.
- **DOCTOR** — consultations, prescriptions, orders.
- **NURSE / WARD_INCHARGE / ICU_STAFF** — nursing notes, vitals, medication administration, bed management.
- **LAB_TECHNICIAN / PATHOLOGIST** — lab orders, samples, results.
- **RADIOLOGIST / RADIOLOGY_TECHNICIAN** — radiology orders, imaging, reports.
- **PHARMACIST** — dispensing, pharmacy inventory.
- **FINANCE_MANAGER / AUDITOR** — billing, payments, refunds, daily closing.
- **INSURANCE_OFFICER** — insurance policies and claims.
- **HR_MANAGER** — staff, departments, shifts, rosters, leaves.
- **INVENTORY_MANAGER / STORE_KEEPER / PURCHASE_OFFICER** — inventory and procurement.
- **OT_TECHNICIAN / OT_NURSE / ANESTHETIST** — theatre operations.
- **EMERGENCY_STAFF / AMBULANCE_STAFF** — emergency cases, triage, MLC.
- **BLOOD_BANK_STAFF** — donors, blood units, issuance.
- **BIOMEDICAL_ENGINEER** — equipment.
- **IT_ADMIN / QUALITY_MANAGER** — settings, audits, quality.
- **PATIENT** — self-service portal.

## 3. Functional Modules (from `apps/server/src/modules`)

| # | Module | Core functions |
|---|--------|----------------|
| 1 | Patients | Registration, MRN, demographics, documents, allergies, conditions |
| 2 | Appointments | Scheduling, slots, check-in, cancellation, reschedule |
| 3 | Encounters | Consultations, vitals, diagnosis (ICD-10), prescriptions, procedures |
| 4 | Admissions | IPD admission, bed allocation/movement, discharge |
| 5 | Emergency | Triage, MLC/police case, admission routing |
| 6 | OT | Theatre scheduling, anesthesia, checklists |
| 7 | Laboratory | Tests, orders, samples, results, verification/approval |
| 8 | Radiology | Orders, modalities, imaging, reports |
| 9 | Pharmacy | Medicines, dispensing, prescription linkage |
| 10 | Blood Bank | Donors, units, testing, issue, expiry tracking |
| 11 | Billing | Invoices, payments, refunds, deposits, discounts, daily closing |
| 12 | Insurance | Providers, policies, claims |
| 13 | Accounting | Accounts, journal entries, cash sessions, financial transactions |
| 14 | HR | Staff profiles, departments, shifts, rosters, leaves |
| 15 | Inventory / Procurement | Items, stores, transactions, suppliers, purchase requests/orders, goods receipts |
| 16 | CRM | Enquiries, medical tourism cases |
| 17 | Membership | Packages, memberships |
| 18 | Doctor Share | Revenue share rules and transactions |
| 19 | Health | Blog posts, health content |
| 20 | Settings | Tenant settings, feature flags, billing settings, integration settings |
| 21 | Notifications | In-app/email/SMS via SSE stream |
| 22 | Audit | Audit log of actions |
| 23 | Webhooks / API Keys | External integrations |
| 24 | Auth / Users / Roles / Permissions | JWT + refresh, RBAC, sessions, password reset |

## 4. Key Business Rules

1. **Tenant isolation**: every data row carries `tenantId`; queries are scoped via `TenantGuard`.
2. **RBAC**: every action checked against `ROLE_PERMISSIONS` via `PermissionsGuard`.
3. **MRN uniqueness**: per-tenant Medical Record Number for patient identification.
4. **Billing integrity**: invoice → payments → refunds/deposits; discounts need approval; daily closing reconciles cash sessions.
5. **Clinical safety**: lab/radiology results require verification and approval before reporting; medication administration is time-tracked (5 rights: right patient/med/dose/route/time).
6. **First login**: password change forced via `MustChangePasswordGuard`.
7. **Soft delete**: `deletedAt` used on tenants/users/patients; hard delete avoided.

## 5. Non-Functional Requirements

- **Multi-tenancy**: shared database, row-level `tenantId` scoping (see [TENANCY.md](TENANCY.md)).
- **Performance**: paginated lists, indexed queries, eager-load relations deliberately.
- **Security**: bcrypt password hashing, 15-min access tokens + 7-day refresh, account lockout, audit log (see [SECURITY.md](SECURITY.md)).
- **Observability**: structured logs, SSE notifications hub (see [OBSERVABILITY.md](OBSERVABILITY.md)).
- **Maintainability**: strict TypeScript, no-comment policy, documented conventions (see [rules.md](../rules.md)).

## 6. Out of Scope (current)

- FHIR API export (planned — see [INTEROPERABILITY.md](INTEROPERABILITY.md)).
- Mobile apps (future).
- Laboratory analyzer instrument integration.
