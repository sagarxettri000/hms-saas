#!/bin/sh
set -e

cd /app/apps/server

echo "Applying database migrations..."

# Clear any previously-failed migration records so a fixed migration can be re-applied.
# `migrate resolve --rolled-back` is safe here: it errors (and is swallowed) when no
# failed migration exists for the given name. See P3009 crash recovery.
# - On production it unblocks the stuck 20260902172638 migration.
# - On a fresh database it errors harmlessly and the migration is applied normally.
npx prisma migrate resolve --rolled-back 20260902172638 2>/dev/null || true

npx prisma migrate deploy

# NOTE: `prisma db seed` is intentionally NOT run here. The seed performs
# destructive deleteMany() sweeps (including tenants) to rebuild demo data; it
# must never run against a production database on container start. Require CLI
# run against a dev/staging environment with NODE_ENV unset instead.

echo "Starting server..."
exec node dist/main.js
