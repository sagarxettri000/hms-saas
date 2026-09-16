# Departments & Wards — Edit Feature

## Purpose

Authorized administrators can edit existing **Departments** and **Wards** from the
Departments page (`/departments`). The edit UI reuses the shared `EntityPage`
edit machinery; the backend reuses and hardens the existing department
endpoints and adds the missing ward update endpoint.

## Endpoints

| Method | Path | Permission | Notes |
| ------ | ---- | ---------- | ----- |
| `PATCH` | `/api/v1/departments/:id` | `DEPARTMENTS` + `EDIT` | Hardened: field whitelist, code-uniqueness, parent-cycle check, dependency check on deactivate, audit |
| `GET` | `/api/v1/departments/:id` | `DEPARTMENTS` + `VIEW` | Loads a single department (used by the edit modal) |
| `PATCH` | `/api/v1/departments/wards/:id` | `DEPARTMENTS` + `EDIT` | Ward updates (name, code, location, floor, capacity, departmentId, isActive) |
| `GET` | `/api/v1/departments/wards/:id` | pre-existing | Used by the edit modal |

All routes are tenant-scoped by the existing `TenantGuard`; a record from
another tenant returns `404`.

## Editable fields

Fields were chosen by tracing actual usage across the codebase (users, staff,
doctors, appointments, billing services, procurement, bed management,
admissions, reports).

**Department:** `name`*, `code`*, `description`, `parentId`, `isActive`.
(`name`/`code` are required by every consumer; `parentId` drives the existing
hierarchy.)

**Ward:** `name`*, `code`, `location`, `floor`, `capacity`, `departmentId`,
`isActive`.

No new columns were added to the database — the feature is built entirely on
the existing models.

## Validation rules

- Required fields must be non-empty; `capacity` (if provided) must be a
  positive integer.
- Department codes must be unique within the tenant (case-insensitive check
  against other records; the DB unique constraint remains the final guard).
- A department cannot become its own parent (self-parent and parent cycles are
  rejected with `400`).
- Deactivating a department with active dependent records (active users,
  future appointments, active services, active beds) is rejected with `409`
  listing the dependency, instead of silently breaking workflows.
- Deactivating a ward with active beds is rejected with `409`.
- Unknown fields are ignored — the service updates an explicit whitelist, so
  client payloads cannot mass-assign arbitrary columns.

## Relationships and history

Edits update the existing record in place; IDs never change, so all FK
references (staff, appointments, beds, admissions, services, reports) stay
intact. Historical records that store a `departmentId`/`wardId` continue to
resolve to the same row — renaming a department does not rewrite history.

## Audit

Every successful update writes an `AuditLog` entry via the existing
`AuditService` (`DEPARTMENT_UPDATE` / `WARD_UPDATE`) with the record id, actor,
timestamp, and previous/new values, visible on the Audit Logs page.

## Known limitations

- Ward codes have no unique constraint in the database (none existed); the
  edit form does not enforce code uniqueness for wards.
- No delete action was added; deactivation is the supported way to retire a
  department/ward.
- Optimistic concurrency (version check) is not implemented; the existing
  update pipeline had none, and adding a parallel mechanism was out of scope.
