# HMS SaaS — Master Rules

> The single source of truth for how this project is built. All other docs defer to this. If something here conflicts with code, **fix the code** — or update this doc in the same PR.

## 1. Non-Negotiables

1. **Tenant isolation is mandatory.** Every tenant-scoped query filters by `request.user.tenantId`. Never accept `tenantId` from the body; always derive from the authenticated user. (See [TENANCY.md](TENANCY.md).)
2. **Money is `Decimal`.** Never `Float` for currency. Use the precision rules in [DATABASE.md](DATABASE.md).
3. **Clinical results need verify + approve** before being reportable. (See [CLINICAL_SAFETY.md](CLINICAL_SAFETY.md).)
4. **Financial actions need approval** where the model says so (discounts, refunds). Do not bypass.
5. **No destructive deletes** for clinical/financial records — soft-delete (`deletedAt`) or cancel-with-reason.
6. **No comments in code** unless explicitly requested. Code must be self-documenting.
7. **Never log or commit secrets** (`.env`, `JWT_SECRET`, passwords, API keys).

## 2. Architecture

- Monorepo: `apps/web` (Next.js 15), `apps/server` (NestJS 10 + Prisma), `packages/shared` (types/enums/RBAC).
- Frontend talks to backend ONLY through `@/lib/api` client.
- All responses wrapped: `{ data: ... }` / `{ data: { data: [...], total, unread } }`; errors `{ statusCode, message, error }`.
- Global prefix `api/v1`; Swagger at `/api/docs`.
- Guard order on tenant-scoped routes: `JwtAuthGuard` → `TenantGuard` → `PermissionsGuard` → `MustChangePasswordGuard`.

## 3. Code Style

- TypeScript **strict**; explicit return types on exported functions; `any` only for genuinely untyped API payloads.
- File naming: components `PascalCase.tsx`, hooks `useX.ts`, utils `camelCase.ts`, pages `lowercase-hyphen.tsx`, types `PascalCase.ts`.
- Import order: external → internal → styles; use aliases (`@/` for web, `@hms/shared` for shared).
- No comments policy applies to new code.

## 4. API Conventions

- Controllers use `@ApiTags`; DTOs validated with `class-validator` (whitelist, forbid non-whitelisted).
- Route permissions via `@Permissions(PermissionAction.X)`; public routes marked `@Public()`.
- Prisma enum arrays in `{ in: [...] }` need `as any` (TS limitation).

## 5. RBAC

- Permissions live in `packages/shared/src/permissions/index.ts` (`ROLE_PERMISSIONS`, `RESOURCE_PERMISSIONS`, `hasPermission`, `getResourcePermissions`).
- Add new roles/actions there first; the backend guard and frontend checks read from the same source.
- Sidebar visibility uses role **groups** in `AppShell.tsx`: ADMIN, RECEPTION, PHARMACY, CLINICAL, FINANCE, LAB, RAD, HR.
- `CLINICAL_WIDE` includes `SUPER` visibility across clinical modules.

## 6. Database

- Schema in `apps/server/prisma/schema.prisma`; migrations versioned; use `db:migrate`, not `db:push`, for shared/dev DBs.
- Model `PascalCase` → table `snake_case` via `@@map`; fields camelCase.
- Composite uniqueness for tenant-scoped reference numbers: `@@unique([tenantId, <field>])`.

## 7. Frontend

- Pages: `'use client'` + default export; sub-components named exports; single responsibility.
- Styling: CSS variables (`var(--primary)` etc.), global classes; glassmorphism only on auth pages.
- State: local `useState`/`useEffect`; no Redux/Zustand; context only when needed.
- CRUD pages use `ModulePage` + `EntityPage` with declarative `fields`/`columns` config; `PatientPrescriptions` on any form with `patientId`.

## 8. Quality Gates

- `npm run typecheck` clean before finishing work.
- `npm run test` green for changed modules (server).
- Run lint (`npm run lint -w @hms/server`) on touched files.
- Update [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) and affected docs in the same change.

## 9. Priorities

Clinical safety > financial correctness > UX > performance. (See [ROADMAP.md](ROADMAP.md).)

**Last updated:** 2026-08-15
