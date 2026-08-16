# HMS SaaS — API Contracts

> Base URL: `http://localhost:4000/api/v1`. Interactive docs (Swagger): `http://localhost:4000/api/docs`.

## Conventions

### Headers
| Header | Required | Purpose |
|--------|----------|---------|
| `Authorization: Bearer <accessToken>` | Yes (except public routes) | JWT auth |
| `X-Tenant-ID` | Yes (tenant-scoped routes) | Tenant context |
| `Content-Type: application/json` | For bodies | Payload format |

### Response Wrappers
Every response is wrapped by the global `TransformInterceptor`:
- **Single**: `{ data: { ... } }`
- **List**: `{ data: { data: [...], total: number, unread?: number, page?: number, limit?: number } }`
- **Error**: `{ statusCode: number, message: string | string[], error: string }` (from `HttpExceptionFilter`)

### Auth
- **Access token**: 15 minutes (stored in `localStorage.accessToken`)
- **Refresh token**: 7 days (`localStorage.refreshToken`)
- Login is throttled (`ThrottlerGuard`); failed attempts lock account temporarily.

## Endpoint Map

### Auth — `/auth`
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | Public | Register platform account |
| POST | `/auth/login` | Public | Login → tokens + user + tenant |
| POST | `/auth/refresh` | Public | Rotate access token |
| POST | `/auth/logout` | Public | Invalidate refresh token |
| POST | `/auth/logout-all` | JWT | Revoke all sessions |
| POST | `/auth/forgot-password` | Public | Send reset link |
| POST | `/auth/reset-password` | Public | Set new password with token |
| POST | `/auth/change-password` | JWT | Change own password |
| GET | `/auth/me` | JWT | Current profile + permissions |

### Tenants — `/tenants`
CRUD + status management for platform admin; list/select tenant for the user.

### Users — `/users`
CRUD for hospital staff; profile, roles, status, activate/lock.

### Roles / Permissions — `/roles`, `/permissions`
Role CRUD, role-permission assignment, list of `PermissionAction`s.

### Patients — `/patients`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/patients` | Create patient |
| GET | `/patients` | List (paginated) |
| GET | `/patients/duplicates` | Duplicate detection |
| GET | `/patients/search` | Search by name/phone |
| GET | `/patients/by-mrn/:mrn` | Lookup by MRN |
| GET | `/patients/:id` | Detail |
| GET | `/patients/:id/timeline` | Clinical timeline |
| PATCH | `/patients/:id` | Update |
| DELETE | `/patients/:id` | Soft delete |

### Appointments — `/appointments`
Schedule, reschedule, cancel, check-in, mark no-show; doctor availability slots.

### Doctors — `/doctors`
Doctor profiles, schedules, consultation fees, departments.

### Encounters — `/encounters`
Start/complete consultations; vitals, diagnoses, prescriptions, procedures, nursing notes.

### Departments — `/departments`
Department hierarchy CRUD, staff assignment.

### Admissions — `/admissions`
Admit/discharge/transfer, bed allocation & movement, deposit management.

### Emergency — `/emergency`
Triage, MLC/police case flags, arrival modes, admit-from-emergency.

### OT — `/ot`
Theatre requests, scheduling, anesthesia, checklists.

### Laboratory — `/lab`
`LabTest` catalog, `LabOrder` with items, `LabSample` collection & rejection, result entry, verify/approve.

### Radiology — `/radiology`
Orders, modalities, image upload, reporting, verify/approve.

### Pharmacy — `/pharmacy`
Medicine catalog, inventory, dispensing, prescription fulfillment.

### Blood Bank — `/blood-bank`
Donors, units, testing, reservation/issue, expiry.

### Billing — `/billing`
Invoices (+items), payments, refunds, deposits, discounts (with approval), credit accounts, daily closing.

### Accounting — `/accounting`
Chart of accounts, journal entries, cash sessions, cash handovers, financial transactions.

### Insurance — `/insurance`
Providers, policies, claims lifecycle.

### Membership — `/memberships`
Packages, memberships, family members.

### HR — `/hr`
Staff profiles, shifts, rosters, leaves.

### CRM — `/crm`
Enquiries, medical tourism cases.

### Procurement — `/procurement`
Suppliers, purchase requests/orders, goods receipts.

### Doctor Share — `/doctor-share`
Share rules and computed transactions.

### Settings — `/settings`
Tenant settings, billing settings, feature flags, integrations.

### Notifications — `/notifications`
List, mark read, unread count. **SSE**: `GET /notifications/stream` (server-sent events, auto-reconnect).

### Audit — `/audit`
Query audit log (entity, action, user, date range).

### Webhooks — `/` (module mounted at root)
Webhook CRUD + delivery history; outbound delivery with signature.

### Health — `/health`
Liveness/readiness for the API.

## Guard Pipeline (order matters)
`JwtAuthGuard` → `TenantGuard` (injects `tenantId`, auto-assigns first tenant for `PLATFORM_SUPER_ADMIN`) → `PermissionsGuard` (checks `PermissionAction`) → `MustChangePasswordGuard` (blocks until password changed).

## Notes
- Use `Array.isArray(res?.data) ? res.data : res?.data?.data ?? []` when reading list responses.
- Prisma enums inside `{ in: [...] }` queries need `as any` (see [rules.md](../rules.md)).
- Global `ValidationPipe`: `whitelist: true`, `forbidNonWhitelisted: true` — unknown body fields are rejected.
