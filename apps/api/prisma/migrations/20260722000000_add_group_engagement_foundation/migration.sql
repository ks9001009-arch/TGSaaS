-- Group Engagement foundation (additive only).
-- NOTE: Production currently uses `prisma db push` (see migrations/README.md).
-- Do not run `migrate deploy` on an existing db-push production DB without a baseline.

-- CreateEnum
CREATE TYPE "PointTransactionType" AS ENUM ('CHECKIN', 'MESSAGE', 'ADMIN', 'SYSTEM', 'INVITE', 'REWARD', 'PENALTY');

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "checkinStreak" INTEGER NOT NULL DEFAULT 0,
    "lastCheckinDate" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "PointTransactionType" NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMessageStat" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyMessageStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupMember_groupId_points_idx" ON "GroupMember"("groupId", "points");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_lastActiveAt_idx" ON "GroupMember"("groupId", "lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_telegramUserId_key" ON "GroupMember"("groupId", "telegramUserId");

-- CreateIndex
CREATE INDEX "PointTransaction_groupId_telegramUserId_createdAt_idx" ON "PointTransaction"("groupId", "telegramUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PointTransaction_groupMemberId_createdAt_idx" ON "PointTransaction"("groupMemberId", "createdAt");

-- CreateIndex
CREATE INDEX "PointTransaction_groupId_type_createdAt_idx" ON "PointTransaction"("groupId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "PointTransaction_referenceId_idx" ON "PointTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "DailyMessageStat_groupId_date_count_idx" ON "DailyMessageStat"("groupId", "date", "count");

-- CreateIndex
CREATE INDEX "DailyMessageStat_groupMemberId_date_idx" ON "DailyMessageStat"("groupMemberId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMessageStat_groupId_telegramUserId_date_key" ON "DailyMessageStat"("groupId", "telegramUserId", "date");

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMessageStat" ADD CONSTRAINT "DailyMessageStat_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
