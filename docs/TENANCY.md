# HMS SaaS — Tenancy

> How multi-tenancy works in this system. **Row-level tenant scoping in a shared schema.**

## Model

- Single PostgreSQL database, shared schema, all domain tables carry `tenantId`.
- A **Tenant** = one hospital/organization (name, code, status, subscription, timezone/currency NPR, PAN/VAT).
- `PLATFORM_SUPER_ADMIN` operates across tenants; hospital users operate inside exactly one tenant.

## How Tenant Context Is Established

1. Client sends `X-Tenant-ID` header (stored in `localStorage.tenantId` after login/tenant selection).
2. **TenantGuard** (`apps/server/src/common/guards/tenant.guard.ts`):
   - Overrides `request.user.tenantId` from the header.
   - `PLATFORM_SUPER_ADMIN`: if no tenant chosen, auto-assigns first `ACTIVE` tenant.
   - Everyone else: throws `403` if `tenantId` missing.
3. Services use `request.user.tenantId` in every Prisma `where` clause.

## Guard Order

`JwtAuthGuard` → `TenantGuard` → `PermissionsGuard` → `MustChangePasswordGuard`.

## Rules for Developers

- **Always filter by tenant** in queries: `where: { tenantId: req.user.tenantId, ... }`.
- Never trust a `tenantId` in the request body — derive it from the authenticated user.
- Reference-like data (e.g. `Patient.mrn`, `Invoice.invoiceNumber`) is unique **per tenant**; use composite `@@unique([tenantId, ...])` or index `[tenantId, field]`.
- Cross-tenant lookups are forbidden. A user of tenant A must never see tenant B rows, even via IDs.

## Platform vs Tenant Data

| Kind | Examples | Scope |
|------|----------|-------|
| Platform | `Tenant`, `Plan`, `Subscription`, `FeatureFlag`, `Role`, `Permission` | `PLATFORM_SUPER_ADMIN` only (Roles/Permissions are global reference data) |
| Tenant | Patients, encounters, invoices, users (via `tenantId`), wards, beds, inventory | Scoped per tenant |

## Tenant Lifecycle

- `TenantStatus`: TRIAL → ACTIVE → SUSPENDED / ARCHIVED / EXPIRED.
- `SubscriptionStatus` + `BillingCycle` drive plan gating (usage vs `Plan.maxUsers`/`maxPatients` tracked in `UsageMetric`).
- Suspension should block tenant-scoped access at the guard layer (to implement: check `Tenant.status` on tenant-scoped routes).

## Known Gaps

- `TenantGuard` trusts `X-Tenant-ID` from the client — validate the header tenant actually matches the user's allowed tenants at login/session.
- No per-tenant schema separation — volume scale will require partitioning/read-replicas later.
