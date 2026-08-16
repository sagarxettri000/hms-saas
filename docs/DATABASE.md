# HMS SaaS — Database

> Source: `apps/server/prisma/schema.prisma`. PostgreSQL via Prisma ORM. All tables share one database; rows are scoped per tenant.

## Conventions

- **IDs**: `cuid()` strings (`id String @id @default(cuid())`).
- **Tenancy**: every domain model carries `tenantId String` with `Tenant` relation (`onDelete: Cascade`). Queries scoped via `TenantGuard`.
- **Money**: `Decimal` with explicit `@db.Decimal(10..14, 2)` precision — never `Float`.
- **Enums**: Prisma enums for status/type fields; free-text strings only where the domain is open-ended (e.g. `MedicalTourismCase.status`).
- **Soft delete**: `deletedAt DateTime?` on `Tenant`, `User`, `Patient`; hard deletes otherwise.
- **Timestamps**: `createdAt @default(now())`, `updatedAt @updatedAt` on all mutable models.
- **Naming**: model `PascalCase` → table `snake_case` via `@@map`.

## Domain Groups

### Platform / Tenant Core
| Model | Notes |
|-------|-------|
| `Tenant` | Hospital/organization; status, subscription plan, currency (NPR), address/PAN/VAT |
| `Branch`, `Department`, `Ward`, `Room`, `Bed` | Physical structure; bed has status + rate; allocations/movements tracked |
| `Plan`, `Subscription`, `SubscriptionPayment` | Platform plans → tenant subscriptions |
| `FeatureFlag`, `TenantFeatureFlag`, `TenantSetting`, `IntegrationSetting` | Per-tenant config |

### Users & Access
`User` (email unique, password hash, role, lockout fields, 2FA), `Role`, `Permission`, `RolePermission`, `Session` (JWT + refresh), `PasswordResetToken`, `DoctorProfile` (+ `DoctorSchedule`, `AvailabilitySlot`), `StaffProfile`.

### Clinical
- `Patient` + `PatientAllergy`, `PatientCondition`, `PatientDocument` — MRN, demographics, guardian, consent.
- `Appointment` → `Encounter` (1:1 optional) → `Vital`, `Diagnosis` (ICD-10), `Prescription`/`PrescriptionItem`, `Procedure`, `NursingNote`.
- `Admission` + `BedAllocation`, `BedMovement`, `MedicationAdministration`.
- `EmergencyCase` (triage, MLC), `OTCase` (theatre, anesthesia).

### Diagnostics
- **Lab**: `LabTest` → `LabOrder` → `LabOrderItem`, `LabSample` (rejection reasons).
- **Radiology**: `RadiologyOrder` + `RadiologyImage`.
- **Blood Bank**: `BloodDonor` → `BloodUnit` (component, expiry, issue).

### Billing / Finance
- `Invoice` + `InvoiceItem` (scheme linkage), `Payment` (idempotency key), `Refund`, `Deposit` + `DepositTransaction`, `CreditAccount`, `BillingService`, `BillingScheme`, `BillingSetting`, `DailyClosing`, `FinancialTransaction`.
- **Accounting**: `Account` (chart), `JournalEntry` + `JournalLine` (double-entry), `CashSession`, `CashHandover`.

### Pharmacy / Inventory / Procurement
`Medicine`, `InventoryItem`, `Store`, `InventoryTransaction` (movement log), `Supplier`, `PurchaseRequest`(+items), `PurchaseOrder`(+items), `GoodsReceipt`(+items).

### Insurance / Membership / Doctor Share
`InsuranceProvider` → `InsurancePolicy` → `InsuranceClaim`; `MembershipPackage` → `Membership` → `MembershipFamily`; `DoctorShareRule` → `DoctorShareTransaction`.

### CRM / CMS / Misc
`Enquiry`, `MedicalTourismCase`, `BlogPost`.

### Platform Services
`Notification` (channels), `AuditLog` (every action), `Webhook` + `WebhookDelivery`, `ApiKey`, `UsageMetric`.

## Key Relationships (1:1 / 1:N / M:N)

```
Tenant 1─N User / Patient / Appointment / Encounter / Invoice / ...
Patient 1─N Appointment / Encounter / Admission / Invoice / Payment / ...
Appointment 1─0..1 Encounter
Encounter 1─N Vital / Diagnosis / Prescription / LabOrder / RadiologyOrder
Admission 1─N BedAllocation / Deposit / Invoice
Invoice 1─N InvoiceItem / Payment / Refund
DoctorProfile 1─N Appointment / Encounter / DoctorShareRule
Role M─N Permission (RolePermission)
```

## Decimal Precision Rules

| Use | Type |
|-----|------|
| Money totals (invoice, payment) | `Decimal(14, 2)` |
| Unit prices / rates | `Decimal(10, 2)` |
| Percent (tax/discount/share) | `Decimal(5, 2)` |
| Stock quantities | `Decimal(12, 3)` |
| Lab numeric results | `Decimal(12, 4)` |
| Vitals (temp/O2/weight/height/BMI) | `Decimal(5..6, 2)` |

## Commands

```bash
npm run db:generate  # regenerate Prisma client
npm run db:migrate   # apply migrations
npm run db:push      # push schema (dev)
npm run db:seed      # seed demo tenant + users
npm run db:studio    # Prisma Studio UI
```
