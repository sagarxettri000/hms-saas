# HMS SaaS — Hospital Management System

Enterprise, multi-tenant hospital management SaaS built as a **monorepo**.

## Stack

| Layer | Tech | Port |
|-------|------|------|
| Frontend | Next.js 15 (React, TypeScript, App Router) | `3000` |
| Backend | NestJS 10 (TypeScript, Prisma ORM) | `4000` |
| Database | PostgreSQL `127.0.0.1:5432/hms_saas` | `5432` |
| Package Manager | npm workspaces | — |

## Quick Start

1. Double-click `Start-HMS.bat` (in your `Documents` folder).
2. Wait ~40 seconds for both servers to compile.
3. Browser opens at `http://localhost:3000`.
4. Login with seeded credentials:

| Role | Email | Password |
|------|-------|----------|
| Hospital Admin | `admin@nbmaitri.com` | `Admin@123` |
| Doctor | `doctor1@nbmaitri.com` | `Doctor@123` |
| Receptionist | `receptionist1@nbmaitri.com` | `Receptionist@123` |
| Pharmacist | `staff5@nbmaitri.com` | `Staff@123` |

Stop everything with `Stop-HMS.bat`.

## Manual Commands

```bash
npm run dev          # both servers
npm run dev:server   # NestJS on :4000
npm run dev:web      # Next.js on :3000
npm run db:generate  # Prisma client
npm run db:migrate   # apply migrations
npm run db:seed      # seed database
npm run typecheck    # typecheck all workspaces
npm run test         # server unit tests
```

## Repository Layout

```
apps/
  web/     # Next.js frontend
  server/  # NestJS backend (30 feature modules)
packages/
  shared/  # shared types, enums, RBAC permissions
docs/      # living documentation
```

## Documentation

See [ARCHITECTURE.md](ARCHITECTURE.md), [rules.md](rules.md), [frontend-foundation.md](frontend-foundation.md), and everything under [docs/](docs/).
