# HMS SaaS — Deployment

> Current environment is local dev (see [ARCHITECTURE.md](../ARCHITECTURE.md)). This doc describes how to get to staging/production.

## Current State (Local Dev)

- **Frontend**: `npm run dev -w @hms/web` → `http://localhost:3000`
- **Backend**: `npm run dev -w @hms/server` → `http://localhost:4000`
- **DB**: local PostgreSQL `hms_saas`
- One-command orchestration: `Start-HMS.bat` / `Stop-HMS.bat` (in `Documents`).

## Build Pipeline

```bash
npm ci                     # install workspaces
npm run db:generate        # prisma client
npm run db:migrate         # apply migrations (or db:push for dev)
npm run db:seed            # seed demo tenant + users
npm run typecheck          # TS across workspaces
npm run build              # builds shared → server → web
npm run test               # server unit tests
```

## Environments

| Env | DB | Purpose | Notes |
|-----|----|---------|-------|
| dev | local Postgres | day-to-day | `npm run dev` |
| staging | managed Postgres | pre-prod validation | future |
| prod | managed Postgres + backups | live | future |

## Server Deploy (NestJS)

1. `npm run build -w @hms/shared` then `npm run build -w @hms/server`.
2. Run `node apps/server/dist/main.js` (or `npm run start:prod -w @hms/server`).
3. Env: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT=4000`, `CORS_ORIGIN`.

## Web Deploy (Next.js)

1. `npm run build -w @hms/web` (or root `npm run build`).
2. Run `npm run start -w @hms/web` → serves on :3000.
3. If API is remote, set the API base URL env used by `src/lib/api.ts`.

## Database Migrations

- Migrations are versioned under `apps/server/prisma/migrations/`.
- Apply with `npm run db:migrate`; **never** `db:push` against staging/prod without review.
- Back up before migrating.

## Recommended Staging Stack

- **Host**: any Node 20+ host (Render / Railway / VPS) running both workspaces.
- **DB**: managed PostgreSQL (neon/supabase/cloud SQL) with daily backups.
- **Health**: `/api/v1/health` for liveness; frontend reachability as readiness.
- **Secrets**: env vars in the host's secret manager, never in repo.

## Checklist Before Go-Live

- [ ] `npm run typecheck` clean
- [ ] `npm run test` passing
- [ ] Migrations applied + backed up
- [ ] `helmet` + CORS locked to real origin
- [ ] Seed users replaced / disabled
- [ ] Logging + error reporting wired (see [OBSERVABILITY.md](OBSERVABILITY.md))
- [ ] Backup/restore tested (see [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md))
