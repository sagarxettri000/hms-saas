# Development Rules & Conventions

## Code Style

### TypeScript
- **Strict mode** is enabled — always type your variables
- Use `any` only when necessary (e.g., API response data that's already untyped)
- Prefer `as` type assertions over untyped variables
- Use explicit return types on exported functions

### File Naming
- **Components**: PascalCase (`PatientForm.tsx`, `MedicineCard.tsx`)
- **Hooks**: camelCase with `use` prefix (`useAuth.ts`, `usePatient.ts`)
- **Utilities**: camelCase (`formatMoney.ts`, `badgeTone.ts`)
- **Pages**: lowercase with hyphens (`patient-detail.tsx`, `billing-invoice.tsx`)
- **CSS**: lowercase (`globals.css`, `auth-glass.css`)
- **Types**: PascalCase (`FormField.ts`, `ApiResponse.ts`)

### Imports
- Use **aliased imports**: `@/` for web, `@hms/shared` for shared package
- Group imports: external → internal → styles
```ts
import { useState, useEffect } from 'react';           // External
import { api } from '@/lib/api';                        // Internal
import '@/styles/globals.css';                          // Styles
```

### No Comments Policy
**Do not add comments** to code unless explicitly requested. Clean code should be self-documenting.

## API Conventions

### Backend (NestJS)
- Controllers use `@ApiTags` decorator for Swagger grouping
- DTOs should be validated with `class-validator` decorators
- All responses use `ApiResponse`/`ListResponse` wrappers
- Error responses return `{ statusCode, message, error }` format

### Frontend API Calls
All API calls go through a single client (`@/lib/api`):
```ts
// Always use the shared api function
await api('/patients', { method: 'POST', body: JSON.stringify(data) });
```

### Response Pattern
All list responses: `{ data: { data: [...], total: number, unread: number } }`
Single item: `{ data: {...} }`

## Frontend Patterns

### Component Structure
1. Use `'use client'` directive for components with interactivity
2. Default exports for page components
3. Named exports for sub-components
4. Keep components focused on a single responsibility

### Styling
- CSS variables for colors: `var(--primary)`, `var(--text)`, etc.
- Use CSS Modules or global CSS classes
- Glassmorphism pattern for auth pages: `auth-glass.css`
- Responsive grid: `stats-grid`, `link-grid` classes

### State Management
- `useState` for local component state
- `useEffect` for data fetching (with cleanup)
- No Redux/Zustand — keep state local or use context when needed

### Role-Based Rendering
```ts
// Check role group
const group = getRoleGroup(role);
if (group === 'ADMIN') { ... }

// Check specific permission
if (ROLE_PERMISSIONS[role].includes(PermissionAction.DELETE)) { ... }
```

### PatientPrescriptions Component
Use the shared `PatientPrescriptions` component in forms with `patientId` field:
```tsx
{values.patientId && <PatientPrescriptions patientId={values.patientId} />}
```

## Backend Patterns

### Module Structure
```
modules/
└── patients/
    ├── patients.module.ts
    ├── patients.controller.ts
    ├── patients.service.ts
    └── patients.service.spec.ts
```

### Guards
- `JwtAuthGuard`: Verifies JWT token
- `PermissionsGuard`: Checks action permissions
- `TenantGuard`: Injects tenantId, auto-assigns first tenant for PLATFORM_SUPER_ADMIN
- `MustChangePasswordGuard`: Forces password change on first login

### Database (Prisma)
- Use Prisma Client for all database operations
- Model names are PascalCase
- Field names are camelCase
- Relations defined in `schema.prisma`

### Real-time
- SSE (Server-Sent Events) via `notifications/stream` endpoint
- Uses in-memory pub/sub hub for broadcasting
- Clients reconnect automatically

## Common Gotchas

### API Response Handling
```ts
// Correct pattern:
const res = await api('/path');
const data = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];

// Not:
const data = res.data.data; // Could crash if structure differs
```

### TypeScript Enums
When using enums in `{ in: [...] }` queries, use `as any`:
```ts
{ role: { in: [UserRole.DOCTOR, UserRole.NURSE] as any } }
```

### Role Groups for Sidebar
The sidebar uses role groups defined in `AppShell.tsx`:
- `ADMIN`: Full access
- `RECEPTION`: Registration, appointments, basic billing
- `PHARMACY`: Pharmacy operations
- `CLINICAL`: Doctor/nurse operations
- `FINANCE`: Billing, payments, reports
- `LAB`: Lab orders, results
- `RAD`: Radiology orders, reports
- `HR`: Staff, departments, shifts

### CLINICAL_WIDE Role
This role group includes `SUPER` permissions to see all clinical modules (Patients, Admit, Appointments, Doctors, Emergency, Theatre).

---

## Access & Permissions (granted by user, 2026-09-16)

- **Laptop/shell**: Full local access — install deps, start dev servers & Docker, run tests/migrations/seed, delete temp files inside this project folder.
- **Git/GitHub**: Commit and push freely to the current branch, no prompts.
- **Database**: Full access — local dev DB (Docker Postgres) AND any prod/staging database URLs the user shares (read/modify/migrate/reset).
- **Secrets/.env**: Full access — read and edit `.env` files, generate JWT secrets, RSA keys, etc. Production secrets still need user sign-off before use.
- **Deploys & CI**: Full deploy + CI control — `vercel deploy` / `railway up` allowed, and `.github/workflows` may be edited as part of normal work.
- Still off-limits by default: destructive shell commands outside this project, and anything that would leak secrets (never paste `.env` values into logs/commits).

**Last updated:** 2026-09-16
