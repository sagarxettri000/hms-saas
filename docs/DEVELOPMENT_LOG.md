# HMS SaaS — Development Log

> Chronological log of significant work. Add an entry for each meaningful change. Newest first.

## 2026-08-15 — Documentation suite added
- Added `README.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/DATABASE.md`, `docs/API_CONTRACTS.md`, `docs/DESIGN_SYSTEM.md`, `docs/TESTING_STRATEGY.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/ROADMAP.md`, `docs/BILLING.md`, `docs/TENANCY.md`, `docs/OBSERVABILITY.md`, `docs/DISASTER_RECOVERY.md`, `docs/DEVELOPMENT_LOG.md`, `docs/PROJECT_STATUS.md`, `docs/CLINICAL_SAFETY.md`, `docs/INTEROPERABILITY.md`, `docs/MASTER_RULES.md`, `docs/AI_RULES.md`.
- Existing docs: `ARCHITECTURE.md`, `rules.md`, `frontend-foundation.md`.

## 2026-08-15 — Server orchestration
- Added `Start-HMS.bat` / `Stop-HMS.bat` (in `Documents`) for one-click dev startup.
- Verified: frontend :3000 (HTTP 200), backend :4000, login via `POST /api/v1/auth/login` returns valid JWT (admin@nbmaitri.com), Swagger at `/api/docs`.

## Earlier — Platform core
- Monorepo (npm workspaces): `apps/web` (Next.js 15), `apps/server` (NestJS 10 + Prisma), `packages/shared` (types/enums/RBAC).
- Auth: JWT (15m) + refresh (7d), sessions, password reset, change-password, must-change-password guard.
- RBAC: `Role`/`Permission`/`RolePermission`, guards (JWT → Tenant → Permissions → MustChangePassword).
- Tenancy: shared schema with `tenantId` row scoping; `X-Tenant-ID` header; `PLATFORM_SUPER_ADMIN` bypass.
- Prisma schema: 60+ models covering clinical, diagnostics, billing, finance, pharmacy/inventory, insurance, membership, doctor-share, HR, CRM, notifications, audit, webhooks, API keys.
- Backend modules (24): accounting, admissions, appointments, audit, auth, billing, blood-bank, crm, departments, doctor-share, doctors, emergency, encounters, health, hr, insurance, laboratory, membership, notifications, ot, patients, pharmacy, procurement, radiology, roles, settings, tenants, users, webhooks.
- Frontend: AppShell, ModulePage/EntityPage CRUD framework, FieldInput declarative forms, auth pages (glassmorphism), ReceiptModal, PaymentModal, AdmitModal, EncounterModal, DischargeModal (4-step), PatientPrescriptions, NotificationBell, GlobalSearch.
