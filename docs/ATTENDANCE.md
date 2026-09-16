# Attendance & Workforce Tracking

## Purpose

Server-authoritative daily attendance for every hospital staff role. Staff clock in/out from their dashboard; Admin and HR monitor everyone from a dedicated module.

## Supported roles

- **Staff (self-service):** every role except `PLATFORM_SUPER_ADMIN`, `HOSPITAL_ADMIN`, `HOSPITAL_OWNER`, `PATIENT` sees the Today's Attendance widget on their dashboard (admins use the Admin module instead, per spec).
- **Attendance monitoring:** `HOSPITAL_ADMIN`, `HOSPITAL_OWNER`, `HR_MANAGER` (sidebar → People → Attendance). `PLATFORM_SUPER_ADMIN` also sees the page; `IT_ADMIN` reaches it by URL but has no sidebar entry.

## Staff workflow

1. Dashboard → Today's Attendance widget → **Clock In**
2. Choose **Present** or **Absent** (no time entry — see below)
3. While present: live elapsed timer (UI convenience only)
4. **Clock Out** → confirm → total worked time shown from stored timestamps

### States

`NOT_CLOCKED_IN → PRESENT → CLOCKED_OUT`, or `NOT_CLOCKED_IN → ABSENT` (terminal for the day).

## Timestamp architecture (critical)

- The **backend generates** `clockIn`/`clockOut` (`new Date()` in the service). The client sends only the status.
- Client-supplied timestamp fields are ignored entirely; UI times are rendered from the **saved backend record** (`GET /hr/attendance/me` returns `serverTime` + record).
- Worked duration (`hours`, decimal) is computed server-side from the two stored timestamps.
- One record per user per day enforced by DB unique key `(tenantId, userId, date)`.

## Backend (NestJS, `/api/v1/hr/attendance/*`)

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /me` | any staff (VIEW) | Today's status + record + shift + serverTime |
| `GET /me/history` | any staff (VIEW) | Own paginated history (`from`,`to`,`page`,`limit`) |
| `POST /clock-in` | any staff (CREATE) | Body `{ status: PRESENT \| ABSENT }`; idempotent |
| `POST /clock-out` | any staff (CREATE) | Closes open PRESENT session |
| `GET /admin` | admin roles | Records in a date range with filters + summary |
| `GET /admin/roster` | admin roles | All active staff with today's state (incl. `NOT_CLOCKED_IN`) |
| `GET /admin/:userId` | admin roles | One staff member's history (tenant-checked) |

Guards: `JwtAuthGuard → PermissionsGuard → TenantGuard` (global) + `@Roles(HOSPITAL_ADMIN, HOSPITAL_OWNER, HR_MANAGER)` on admin routes.

## Data model

`AttendanceRecord` (extended): `userId` (required, FK), `status` (`PRESENT|ABSENT`), `rosterId` (optional FK → the day's `Roster`), `date` (day bucket), `clockIn`, `clockOut`, `hours`, `staffName` (denormalized display name), `tenantId`.

Migration `20260916100000_attendance_user_status`: adds columns/enum, backfills legacy rows by `staffName`, drops unmatched legacy rows, adds unique key + indexes + FKs.

## Integrity & security

- **Duplicates:** in-transaction check + DB unique constraint; concurrent double-click returns the existing record (`P2002` recovery path).
- **Identity:** user comes from JWT claims only; no `userId` in request bodies for self-service.
- **IDOR:** `me`/`history` filter strictly by authenticated `userId`; admin history 403s for users outside the tenant.
- **Tenant isolation:** every query is tenant-scoped (TenantGuard + explicit `tenantId` where).
- **No editing:** no endpoint accepts clock-in/out times; corrections are out of scope (policy decision — see Limitations).
- **Audit:** clock-in/out/absent write `AuditLog` entries via the existing `AuditService` (`action CLOCK_IN/CLOCK_OUT`, status, timestamps).

## Admin UI

`/attendance`: summary cards (Present / Absent / Not clocked in — computed from real records), staff table (employee, code, role, department, shift, status, in/out, worked), filters by role/department/status, search by name/email/employee code, per-staff history modal, CSV export, 30s auto-refresh. Sidebar entry in **People**.

## Tests

`attendance.service.spec.ts` + `attendance.controller.spec.ts` (34 cases): server-timestamp authority (forged client time ignored), idempotency, P2002 concurrency, roster link, ABSENT handling, audit entries, IDOR/tenant scoping, admin roster summary, history filters, legacy training regression.

## Known limitations

- **No correction workflow:** admins cannot edit timestamps (spec forbids arbitrary editing; a correction flow with audit trail is future work).
- **Day bucket = server-local midnight:** multi-timezone deployments would need TZ-aware day boundaries (tenant `timezone` field exists but is not yet used here).
- **Shift validation only:** attendance links to the rostered shift but does not enforce clock-in windows or late/early flags.
- **Live admin updates:** 30s polling, not push (SSE hub is per-user; a tenant-wide attendance channel would be needed for instant updates).
- **Leave integration:** approved `Leave` records are not yet surfaced as excused absences.
