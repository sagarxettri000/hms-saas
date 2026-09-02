#!/bin/sh
set -e

cd /app/apps/server

echo "Applying database migrations..."
npx prisma migrate deploy

# NOTE: `prisma db seed` is intentionally NOT run here. The seed performs
# destructive deleteMany() sweeps (including tenants) to rebuild demo data; it
# must never run against a production database on container start. Require CLI
# run against a dev/staging environment with NODE_ENV unset instead.

echo "Starting server..."
exec node dist/main.js
