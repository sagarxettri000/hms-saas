# HMS SaaS — Architecture & Development Guide

## Overview

HMS SaaS is an enterprise hospital management system built as a **monorepo** using:
- **Frontend**: Next.js 15 (React, TypeScript, Server Components) on port `3000`
- **Backend**: NestJS (TypeScript, Prisma ORM) on port `4000`
- **Database**: PostgreSQL at `127.0.0.1:5432/hms_saas`
- **Package Manager**: npm workspaces

## Directory Structure

```
hms-saas/
├── apps/
│   ├── web/          # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/          # Pages & routes (App Router)
│   │   │   ├── components/   # Shared React components
│   │   │   ├── lib/          # Utilities, API client, helpers
│   │   │   ├── styles/       # CSS files
│   │   │   └── hooks/        # Custom hooks
│   │   └── package.json
│   └── server/       # NestJS backend
│       ├── src/
│       │   ├── modules/      # Feature modules (patients, billing, pharmacy...)
│       │   ├── common/       # Guards, pipes, decorators
│       │   ├── prisma/       # Prisma service
│       │   └── main.ts       # App entrypoint
│       └── prisma/
│           ├── schema.prisma
│           ├── migrations/
│           └── seed.ts
├── packages/
│   └── shared/       # Shared types, enums, permissions
│       └── src/
│           ├── enums/
│           ├── permissions/
│           └── utils.ts
├── package.json      # Root workspace
└── README.md
```

## Development

### Quick Start
1. **Double-click `Start-HMS.bat`** in `Documents` folder
2. Wait ~40 seconds for servers to compile
3. Browser opens automatically at `http://localhost:3000`
4. Login with seeded credentials (see below)

### Manual Start
```bash
# Start both servers
npm run dev

# Or individually
npm run dev:server   # NestJS on :4000
npm run dev:web      # Next.js on :3000
```

### Stopping Servers
Double-click `Stop-HMS.bat` or run:
```bash
taskkill /F /IM node
```

### Database
```bash
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run migrations
npm run db:push     # Push schema changes
npm run db:seed     # Seed database
npm run db:studio   # Open Prisma Studio
```

## Authentication

The app uses JWT with refresh tokens:
- **Token**: 15-minute access token in `localStorage.accessToken`
- **Refresh**: 7-day refresh token in `localStorage.refreshToken`
- **Tenancy**: Multi-tenant via `X-Tenant-ID` header from `localStorage.tenantId`

### Seed Users
| Role | Email | Password |
|------|-------|----------|
| Hospital Admin | `admin@nbmaitri.com` | `Admin@123` |
| Doctor | `doctor1@nbmaitri.com` | `Doctor@123` |
| Receptionist | `receptionist1@nbmaitri.com` | `Receptionist@123` |
| Pharmacist | `staff5@nbmaitri.com` | `Staff@123` |

## Key Patterns

### API Communication
All frontend API calls go through `lib/api.ts`:
```ts
import { api } from '@/lib/api';

// GET
const patients = await api('/patients?limit=50');
// POST
await api('/patients', { method: 'POST', body: JSON.stringify(data) });
```

All responses are wrapped: `{ data: { data: [...], total, unread } }`

### Role-Based Access Control (RBAC)
Permissions are defined in `packages/shared/src/permissions/index.ts`:
```ts
import { ROLE_PERMISSIONS } from '@hms/shared';

// Check permission
if (ROLE_PERMISSIONS[userRole].includes(PermissionAction.CREATE)) { ... }
```

### Standard Components
- **AppShell**: Wraps all pages with sidebar, topbar, notifications
- **ModulePage**: Standard CRUD page wrapping EntityPage
- **EntityPage**: Table view with pagination, sorting, create/edit modals
- **FieldInput**: Form field component (select, input, date, number, etc.)

### Form Fields Pattern
Forms use a declarative field config:
```ts
fields: [
  { name: 'firstName', label: 'First name', required: true },
  { name: 'patientId', label: 'Patient', type: 'select', optionsFrom: PATIENT_REF },
  { name: 'items', label: 'Line items', type: 'items', required: true },
]
```

---
See [Rules](rules.md), [Frontend Foundation](frontend-foundation.md) for details.
