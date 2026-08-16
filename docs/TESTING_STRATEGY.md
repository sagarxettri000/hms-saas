# HMS SaaS — Testing Strategy

## Scope

- **Server** (`@hms/server`): Jest unit tests per module (`*.service.spec.ts`), e2e via `test/jest-e2e.json`.
- **Shared** (`@hms/shared`): pure logic (permissions, utils) — unit tested with Jest.
- **Web** (`@hms/web`): not yet wired to a runner; manual QA + `typecheck` until a Vitest/Jest setup is added.

## Commands

```bash
npm run test         # server unit tests (root)
npm run test:cov     # coverage
npm run test:watch   # watch mode
npm run test:e2e     # server e2e (separate DB recommended)
npm run typecheck    # all workspaces
```

## What to Test

### High value (always)
- **Auth**: login success/failure, lockout after failed attempts, refresh rotation, change/reset password flows.
- **Tenant isolation**: user from tenant A cannot read tenant B rows (guard + query scoping).
- **RBAC**: `PermissionsGuard` deny/allow per `PermissionAction`.
- **Billing math**: invoice totals (subtotal − discount + tax), payments → paid/due amounts, refund/deposit application, doctor-share split.
- **Inventory**: stock movements, reorder logic, purchase order → goods receipt → stock update.

### Medium value
- CRUD endpoints happy path + validation errors (`forbidNonWhitelisted`).
- Appointment scheduling (slot collisions, reschedule, no-show).
- Lab/radiology result state machine (order → collect → result → verify → approve).

### Low value / skip
- Boilerplate getters/setters.
- Third-party lib behavior (Prisma, bcrypt, JWT internals) — test our usage, not the lib.

## Structure

```
apps/server/src/modules/<module>/
  <module>.service.spec.ts   # unit tests (mock PrismaService)
  <module>.controller.ts
```

## Conventions

- Mock `PrismaService` with in-memory maps or jest mocks; do not hit real Postgres in unit tests.
- Use `test` / `describe` / `expect` from Jest (no external assertion lib).
- Name tests by behavior: `should reject payment when invoice is settled`.
- e2e tests (when run) must use a **separate test database** — never dev data.

## Gaps / Next Steps

1. Add Jest config for `@hms/web` (component + hook tests).
2. Add integration tests for tenant-isolation on every module's `GET` list route.
3. Add billing regression suite for discount/tax/credit combinations.
4. Wire `test:e2e` to a CI job with a disposable Postgres instance.
