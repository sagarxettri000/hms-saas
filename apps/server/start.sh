#!/bin/sh
set -e

cd /app/apps/server

echo "Applying database migrations..."
npx prisma migrate deploy --skip-generate

echo "Running database seed..."
npx prisma db seed || echo "Seed failed or already run, continuing..."

echo "Starting server..."
exec node dist/main.js
