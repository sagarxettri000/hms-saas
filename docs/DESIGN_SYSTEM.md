# HMS SaaS — Design System

> UI conventions for the Next.js frontend. Complements [frontend-foundation.md](../frontend-foundation.md).

## Tokens (CSS Variables)

Defined in `src/app/globals.css` `:root`:

| Token | Value | Use |
|-------|-------|-----|
| `--primary` | `#2563eb` | Primary actions, links, focus |
| `--primary-light` | `#dbeafe` | Selected/hover backgrounds |
| `--success` | `#16a34a` | Positive status |
| `--warning` | `#d97706` | Pending/warning status |
| `--danger` | `#dc2626` | Errors, destructive actions |
| `--text` | `#1e293b` | Body text |
| `--text-muted` | `#94a3b8` | Secondary text |
| `--border` | `#e2e8f0` | Borders, dividers |
| `--card` / `--surface` | `#ffffff` | Card/surface background |
| `--background` | `#f8fafc` | Page background |
| `--radius` | `12px` | Default border radius |

## Core Components

### Layout
- **AppShell** (`src/components/AppShell.tsx`) — every authed page wrapper: sidebar (role-group filtered), topbar, `NotificationBell`, `GlobalSearch`.
- **ModulePage** — standard module wrapper: title + `EntityPage` + AppShell.
- **EntityPage** — datatable (pagination, sorting, search), create/edit modals, row actions, `createRoles` gating.

### CRUD / Data
- **EntityPage** column config: `{ key, label, badge?, render? }`.
- **FieldInput** field config: `{ name, label, type, required, full, options?, optionsFrom?, hint? }`.
- `type`: `text | number | date | select | checkbox | textarea | items | json`.
- Reusable references: `PATIENT_REF` (`/patients`), `STORE_REF` (`/pharmacy/stores`).

### Business Flow Modals
- `ReceiptModal` — print invoice/receipt (`.no-print` for non-print elements).
- `PaymentModal` — record payment.
- `AdmitModal` — admit patient.
- `EncounterModal` — clinical encounter.
- `DischargeModal` — 4-step: discharge → dispense → billing → receipt.
- `PatientPrescriptions` — live sidebar (15s refresh) whenever a form has a `patientId`.

## Status Badges

Use `badgeTone()` for consistent colors:
- Success (green): PAID, COMPLETED, ACTIVE, APPROVED, REPORTED, DELIVERED
- Warning (amber): PENDING, REQUESTED, PARTIAL, PROCESSING, OVERDUE
- Danger (red): CANCELLED, REJECTED, FAILED, LOCKED, OVERDUE, SUSPENDED, DECEASED
- Neutral: DRAFT, SCHEDULED, UNKNOWN

## Spacing & Layout Classes

| Class | Purpose |
|-------|---------|
| `.card` / `.card-title` | White card + title |
| `.stats-grid` / `.stat-card` | KPI stat row |
| `.link-grid` | Quick-action button grid |
| `.form-grid` / `.field` / `.field-full` | Form layout |
| `.label` / `.input` | Form label/input |
| `.btn` / `.btn-sm` / `.btn-secondary` | Buttons |
| `.badge` | Status badge |
| `.modal-backdrop` / `.modal` | Modal overlay |
| `.table` | Data table |
| `.muted` / `.empty` / `.loading` | Text states |

## Auth Pages

- Glassmorphism aesthetic via `src/app/auth-glass.css` (dark navy, frosted glass).
- Loaded via `<link>` in `src/app/layout.tsx` to avoid FOUC.
- Styles only activate under `body:has(.auth-root)`.

## Naming Conventions

- Components: PascalCase (`PatientForm.tsx`).
- Pages: lowercase-hyphen (`patient-detail.tsx`).
- CSS: lowercase (`globals.css`, `auth-glass.css`).
- Hooks/utilities: camelCase (`useAuth.ts`, `formatMoney.ts`).

## Accessibility / UX Rules

- Use `onMouseDown` (not `onClick`) for search dropdowns to avoid blur race conditions.
- Money via `formatMoney()` (Rs. format); dates via `formatDate()`/`formatDateTime()`.
- Buttons: default `.btn`, compact `.btn-sm`, secondary `.btn-secondary`.
- Loading → `.loading`; empty results → `.empty`; secondary info → `.muted`.

## Print

- Receipts print cleanly: printable area only, `.no-print` hides chrome.
- Always define `@media print` for any printable module.
