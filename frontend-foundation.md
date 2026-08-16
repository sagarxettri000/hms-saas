# Frontend Foundation

## Architecture

The frontend is a **Next.js 15** application with the **App Router** pattern. It's part of an npm workspace monorepo.

### Project Entry Points
- **Root layout**: `src/app/layout.tsx` — wraps all pages with auth, global CSS
- **Auth layout**: `src/app/auth.css` + `auth-glass.css` — glassmorphism login styles
- **AppShell**: `src/components/AppShell.tsx` — sidebar, topbar, notification bell
- **API client**: `src/lib/api.ts` — all HTTP requests go through here

## Core Patterns

### 1. Page Composition
All pages follow this structure:
```tsx
'use client';

import ModulePage from '@/components/ModulePage';
import type { Column, FormField } from '@/lib/types';

export default function MyPage() {
  return (
    <ModulePage
      title="My Module"
      endpoint="/api/endpoint"
      columns={[...]}
      fields={[...]}
      tabs={[...]}
    />
  );
}
```

### 2. EntityPage
The `EntityPage` component provides:
- Datatable with pagination, sorting, search
- Create/Edit modals using `FormField` configuration
- Role-based create buttons (`createRoles` prop)
- Custom actions per row

### 3. Form Fields
Forms use a declarative `FormField` type:
```ts
interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'items' | 'json';
  required?: boolean;
  full?: boolean;
  options?: { value: string; label: string }[];
  optionsFrom?: { valueKey: string; labelKeys: string[]; endpoint: string };
  hint?: string;
  defaultValue?: any;
}
```

Common field configs:
```ts
// Patient select (reusable)
const PATIENT_REF = {
  valueKey: 'id',
  labelKeys: ['firstName', 'lastName', 'mrn', 'mobile'],
  endpoint: '/patients'
};

// Store select (reusable)
const STORE_REF = {
  valueKey: 'id',
  labelKeys: ['name', 'location'],
  endpoint: '/pharmacy/stores'
};
```

### 4. Custom Field Rendering
Override field rendering for special needs:
```tsx
fields={[
  { name: 'items', label: 'Line items', type: 'items', required: true, full: true },
  { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
]}

// Custom column rendering
columns={[
  { key: 'status', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
]}
```

## Component Library

### Shared Components (in `src/components/`)
| Component | Purpose |
|-----------|---------|
| `AppShell` | Main layout wrapper (sidebar, topbar, notifications) |
| `ModulePage` | Wraps EntityPage with AppShell |
| `EntityPage` | CRUD datatable + forms |
| `ReceiptModal` | Invoice/receipt printing |
| `PaymentModal` | Payment recording |
| `AdmitModal` | Patient admission |
| `EncounterModal` | Clinical encounter |
| `DischargeModal` | 4-step discharge (discharge → dispense → billing → receipt) |
| `PatientPrescriptions` | Shows patient prescriptions sidebar |

### Utility Hooks (in `src/lib/`)
| Hook | Purpose |
|------|---------|
| `api()` | HTTP client with JWT, tenant headers, auto-refresh |
| `useAuth()` | Auth state management |
| `useData()` | Fetch + cache data |
| `formatMoney()` | Currency formatter (Rs.) |
| `formatDate()` | Date formatter |
| `formatDateTime()` | DateTime formatter |
| `badgeTone()` | Status badge color mapping |
| `pick()` | Dotted key path resolver |
| `nameOf()` | Name from patient row |

## CSS & Styling

### CSS Variables
```css
:root {
  --primary: #2563eb;
  --primary-light: #dbeafe;
  --success: #16a34a;
  --warning: #d97706;
  --danger: #dc2626;
  --text: #1e293b;
  --text-muted: #94a3b8;
  --border: #e2e8f0;
  --card: #ffffff;
  --background: #f8fafc;
  --surface: #ffffff;
  --radius: 12px;
}
```

### Key CSS Classes
| Class | Purpose |
|-------|---------|
| `.card` | White card with border/shadow |
| `.card-title` | Card title styling |
| `.stats-grid` | Responsive stat cards grid |
| `.stat-card` | Individual stat card |
| `.link-grid` | Quick action buttons grid |
| `.form-grid` | Form field grid |
| `.field` / `.field-full` | Form field wrapper |
| `.label` | Form label |
| `.input` | Form input/select/textarea |
| `.btn` / `.btn-sm` / `.btn-secondary` | Buttons |
| `.badge` | Status badges |
| `.modal-backdrop` / `.modal` | Modal overlay |
| `.table` | Table styling |
| `.loading` | Loading spinner text |
| `.empty` | Empty state text |
| `.muted` | Muted text |

### Auth Pages (Glassmorphism)
- `src/app/auth-glass.css` — all auth styles (dark navy, frosted glass)
- Imported in `src/app/layout.tsx` with `<link>`
- No FOUC — styles load immediately via `body:has(.auth-root)` rule

## Routing

### Protected Routes
- Pages in `src/app/` (except `/login`, `/auth/*`, `/about`, `/help`) require auth
- AppShell checks token, redirects to `/login` if missing
- Token auto-refresh handled by API client

### Module Routes
| Route | Module | Create Roles |
|-------|--------|-------------|
| `/patients` | Patients | Admin |
| `/appointments` | Appointments | Reception, Clinical, Admin |
| `/doctors` | Doctors | Admin |
| `/encounters` | Encounters | Clinical, Admin |
| `/admissions` | Admissions | Reception, Admin |
| `/billing` | Billing | Finance, Reception, Admin |
| `/pharmacy` | Pharmacy | Pharmacy, Admin |
| `/laboratory` | Laboratory | Lab, Clinical, Admin |
| `/radiology` | Radiology | Rad, Clinical, Admin |
| `/insurance` | Insurance | Finance, Reception, Admin |
| `/hr` | HR | HR, Admin |
| `/ot` | Operating Theatre | Clinical, Admin |
| `/reports` | Reports | Admin, Finance |
| `/settings` | Settings | Admin, Super |

## Data Flow

### API → Component → UI
```mermaid
graph LR
  A[API Endpoint] --> B[api() fetch]
  B --> C[Component state]
  C --> D[tRPC/SWR cache]
  D --> E[React render]
  E --> F[CSS Module / CSS Vars]
```

### EntityPage Data Flow
1. `EntityPage` on mount fetches data from `endpoint`
2. Data stored in `useState`
3. Renders in table with `columns` config
4. Create button opens modal with `fields` config
5. Modal submits via `POST endpoint`
6. On success, `onCreated` callback triggers refetch
7. Edit button opens modal pre-filled with row data

## Key UX Patterns

### PatientPrescriptions Sidebar
When any form has a `patientId` field and a patient is selected:
- Shows patient's prescriptions (auto-refresh every 15s)
- Displays doctor name, status, date, medicine list
- Uses shared `PatientPrescriptions` component

### ReceiptModal
- Used by Billing, Pharmacy Sales, Admissions
- Shows full invoice details (hospital name, patient, items, totals, payments)
- Print support via `@media print` CSS
- Auto-hides non-print elements with `.no-print` class

### Discharge Flow (4-Step)
1. **Discharge** — basic info review
2. **Dispense medicines** — loads patient prescriptions, auto-selects ground floor pharmacy store
3. **Billing** — service selection, invoice creation
4. **Receipt** — print/show final receipt

### Search & Selection
- All selects use `optionsFrom` with `PATIENT_REF` pattern
- Search components use `onMouseDown` (not `onClick`) to prevent blur race conditions
- Styled dropdowns with avatars, hover highlights

---

**Last updated:** 2026-08-15
