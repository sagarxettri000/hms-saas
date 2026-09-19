# AGENTS.md — HMS SaaS

## Access & Connections (read first)

Everything below is already authenticated on this machine — no credentials are needed from the user and **no secrets are stored in this file**. Secrets live only in the gitignored `.env` and in Vercel environment variables.

- **GitHub**: owner `sagarxettri000`, repo `github.com/sagarxettri000/hms-saas.git` (git credentials stored in system; `gh` is authenticated as `sagarxettri000`).
- **Vercel**: CLI authenticated as `katwalsagar146-5426`, team id `team_DX4OTdBKt9kf0o3QHqvpJx7s`. Token file: `C:\Users\katwa\AppData\Roaming\xdg.data\com.vercel.cli\auth.json`. Two projects:
  - `hms-saas` (projectId `prj_Zt9cIKqwoW5Z7dt3yfhOJm6wcCk7`) — web (Next.js), production alias `hms-saas-tau.vercel.app`, config: repo-root `vercel.json`.
  - `hms-saas-api` (projectId `prj_wI517zveN0HJOm1Lg6MlUpw6tXOI`) — NestJS API, rootDirectory `apps/server`, production alias `hms-saas-api.vercel.app`, config: `apps/server/vercel.json`, lambda entry `apps/server/api/index.ts`, Express app built in `apps/server/src/serverless.ts`.
- **Database — Prisma Postgres** (host `db.prisma.io`, database `postgres`): the `DATABASE_URL` env var is defined in local `.env` and in both projects' Vercel env vars. The connection string is a secret — read it from `.env` (use `$env:DATABASE_URL` from `.env`) or from `vercel env pull`; never print or commit it. 30 migrations applied and the DB is seeded.
- **Supabase**: CLI authenticated, project `hospital-hisHMS` exists but is **not used** for data — leave it alone.

## Standing rules

1. After every code change: **commit and push to `main`**. Both Vercel projects are git-linked to this repo, so a push auto-redeploys web + API.
2. Never commit secrets, `.env`, or token files. Add/change secrets only through Vercel env vars or local `.env`.
3. After deploys verify:
   - `GET https://hms-saas-api.vercel.app/api/v1/health` → 200
   - `GET https://hms-saas-tau.vercel.app` → 200
4. Keep changes focused; leave unrelated in-progress work untouched unless asked.

## Vercel serverless API constraints

- **No TCP listeners**: HL7 MLLP and DICOM SCP starts return 400 when `process.env.VERCEL === "1"` — keep those gates.
- **Ephemeral local storage**: `STORAGE_LOCAL_DIR=/tmp/hms-storage` on Vercel (write-only to `/tmp` on lambdas).
- **No Redis**: BullMQ processes HL7 messages synchronously when `REDIS_HOST` is unset. Keep `@nestjs/bullmq`/`bullmq` on the CJS line (v11 / v5) — v6+ (ESM) crashes the Node 20 lambda at import.
- **Lambda entry**: Vercel requires a default export; the handler must be the raw Express app (Vercel events are not API-Gateway-shaped, so no `@vendia/serverless-express`).

## Database workflow

- Schema: `apps/server/prisma/schema.prisma`; migrations in `apps/server/prisma/migrations/`.
- Apply: `$env:DATABASE_URL` set from `.env`, then `npx prisma migrate deploy --schema apps/server/prisma/schema.prisma`.
- Seed: unset `NODE_ENV` (seed refuses production), then `npm run db:seed -w @hms/server`.
- Status: `npx prisma migrate status --schema apps/server/prisma/schema.prisma`.

## Local development

- Workspaces: `npm run build -w @hms/shared` first (server and web depend on it), then `-w @hms/server` / `-w @hms/web`.
- Server boots on port 4000 with prefix `api/v1`; web dev default API is `http://localhost:4000/api/v1`.

## Useful commands

- `gh auth status`, `vercel whoami`, `npx prisma migrate status` — confirm connectivity.
- `vercel logs https://hms-saas-api.vercel.app` — API lambda logs.