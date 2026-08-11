#!/bin/sh
set -e

echo "[entrypoint] waiting for database, then applying migrations..."
# Prefer versioned migrations in production. Never use --accept-data-loss.
if [ -d prisma/migrations ] && [ "$(ls -A prisma/migrations 2>/dev/null | grep -v README | grep -v migration_lock || true)" ]; then
  echo "[entrypoint] prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "[entrypoint] no migrations found; prisma db push (no data-loss flag)..."
  npx prisma db push --skip-generate
fi

echo "[entrypoint] seeding base data (idempotent)..."
node dist/prisma/seed.js || echo "[entrypoint] seed skipped"

echo "[entrypoint] starting API..."
exec node dist/main.js
