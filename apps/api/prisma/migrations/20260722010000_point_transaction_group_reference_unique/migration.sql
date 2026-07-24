-- Additive unique constraint for check-in idempotency.
-- NOTE: Production currently uses `prisma db push` (see migrations/README.md).
-- Do not run `migrate deploy` on an existing db-push production DB without a baseline.

-- CreateIndex
CREATE UNIQUE INDEX "PointTransaction_groupId_referenceId_key" ON "PointTransaction"("groupId", "referenceId");
