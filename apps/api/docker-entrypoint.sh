#!/bin/sh
set -e

echo "[entrypoint] waiting for database, then syncing schema (prisma db push)..."
# db push creates/updates tables directly from schema.prisma (no migration files needed).
# It is idempotent: if the DB already matches the schema it is a no-op.
npx prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] seeding base data (idempotent)..."
node dist/prisma/seed.js || echo "[entrypoint] seed skipped"

echo "[entrypoint] starting API..."
exec node dist/main.js
