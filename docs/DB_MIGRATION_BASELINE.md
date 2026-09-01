# Prisma Migrate Production Baseline

**Applies to:** Production Postgres (Railway). ~5 minutes, requires Railway access to the server's `DATABASE_URL`.

## Why this is needed

The production database was created via `prisma db push`, so it has **all tables but no `_prisma_migrations` history**.

`apps/server/start.sh` now runs `prisma migrate deploy` (safe, forward-only). On the next prod deploy it will try to apply the baseline migration `20260901000000_init` on top of the existing tables — the `CREATE TABLE` statements collide and the deploy fails.

**Baseline** = tell Prisma the init migration is already in place, so deploy skips it and future migrations apply normally.

## Step 1 — Mark the init migration as applied

From the repo root, using the **production** `DATABASE_URL`:

```bash
DATABASE_URL="<your-prod-railway-connection-string>" \
  npx prisma migrate resolve --applied 20260901000000_init \
  --schema apps/server/prisma/schema.prisma
```

Expected output:

```
Migration 20260901000000_init marked as applied.
```

> ⚠️ Run this against **PRODUCTION**, not a local/test DB. `db push` changes dev DBs frequently; prod is the DB that matters.

## Step 2 — Sanity-check recorded history

```bash
DATABASE_URL="<your-prod-railway-connection-string>" \
  npx prisma migrate status --schema apps/server/prisma/schema.prisma
```

Expected:

```
1 migration found in Prisma schema
 Database schema is up to date!
```

## Step 3 — Prove the pipeline with a no-op migration (optional)

To confirm migrations now apply end-to-end, do a throwaway migration against prod:

```bash
cd apps/server
npx prisma migrate dev --create-only --name baseline_verify
# inspect the generated SQL (should be empty or trivial), then:
npx prisma migrate deploy
```

Confirm "All migrations have been successfully applied", then delete the throwaway `baseline_verify` migration directory.

## Safety notes

- **Do Step 1 before any deploy triggers `migrate deploy`**, to avoid a failed-then-retried loop (Railway `restartPolicyMaxRetries: 5` will keep retrying).
- **Idempotent:** `migrate resolve --applied` is safe to run twice.
- **No rollback** needed — this is bookkeeping, it makes no schema change.

## Recovering a failed future migration

Never re-run a failed `migrate deploy` — it risks partial state. Instead:

```bash
# inspect, then resolve the specific failed migration as rolled back
npx prisma migrate status
npx prisma migrate resolve --rolled-back <migration-name>
```

## Git history reference

Baseline migration introduced in commit `edb2428`; BOM corruption fixed in `8a664ea`.