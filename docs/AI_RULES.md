# HMS SaaS — AI Agent Rules

> Instructions for AI coding agents (like opencode) working in this repo. Read these first, then [MASTER_RULES.md](MASTER_RULES.md).

## Before You Start

1. **Read context first.** Check `ARCHITECTURE.md`, `rules.md`, `docs/MASTER_RULES.md`, and the relevant module's existing code. Match existing conventions exactly.
2. **Never assume libraries.** Verify a dependency exists in the workspace `package.json` before importing it. If unsure, check neighboring files.
3. **Ask before big actions.** Don't start servers, run migrations, or install packages without being asked — unless the task explicitly requires it.

## How to Work

- **One task at a time.** The user prefers small, verifiable steps over one giant change.
- **Do the requested change; stop.** No unsolicited refactors, no extra "improvements" unless they're needed for the task.
- **No comments in code** unless the user asks for them.
- **Prefer editing existing files** over creating new ones. Never create docs unless asked.

## When Working in This Codebase

### Backend (NestJS)
- Follow module structure: `module.ts` / `controller.ts` / `service.ts` / `service.spec.ts`.
- Every tenant-scoped query MUST include `tenantId` from `req.user.tenantId` — never from the request body.
- Use `@Public()`, `@Permissions(...)`, and guards exactly as existing modules do.
- Money = `Decimal`; match precision conventions in [DATABASE.md](DATABASE.md).

### Frontend (Next.js)
- Use `'use client'` for interactive components; default exports for pages.
- All API calls through `@/lib/api` — never raw `fetch`.
- Read list responses defensively: `Array.isArray(res?.data) ? res.data : res?.data?.data ?? []`.

### Database (Prisma)
- After changing `schema.prisma`, tell the user the `db:migrate` / `db:generate` command — don't run migrations on their DB unprompted.

### Shared (`@hms/shared`)
- Add new enums/permissions/actions in `packages/shared/src/...` and export from `index.ts`; use from both server and web.

## Verification

- Run `npm run typecheck` after changes; fix any errors.
- Run relevant tests (`npm run test -w @hms/server`) if the module has specs.
- Report concisely: what changed, what you verified, any commands the user needs to run.

## Communication Style

- Be concise; answer directly.
- If a request is ambiguous, ask one clarifying question rather than guessing wrong on a large change.

**Last updated:** 2026-08-15
