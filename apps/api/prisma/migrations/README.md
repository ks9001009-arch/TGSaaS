# Engagement migrations note

This directory records the Group Engagement foundation schema change.

## Important

- The API container currently syncs schema with **`prisma db push`**
  (`apps/api/docker-entrypoint.sh`), not `prisma migrate deploy`.
- This repository previously had **no migration baseline**. The SQL under
  `20260722000000_add_group_engagement_foundation/` is an incremental record
  for a future migrate baseline, and for review of the exact DDL.
- **Do not** run `prisma migrate deploy` against an existing production
  database that was created via `db push` and has an empty `_prisma_migrations`
  history. That can fail or partially apply.
- Applying the new tables in the current deploy path: rebuild/restart API so
  `db push` picks up `schema.prisma`.

## Files

- `migration_lock.toml` — provider = postgresql
- `20260722000000_add_group_engagement_foundation/migration.sql` — additive DDL only
