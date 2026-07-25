-- Group lottery: config, prizes, draws + LOTTERY point transaction type

ALTER TYPE "PointTransactionType" ADD VALUE IF NOT EXISTS 'LOTTERY';

CREATE TABLE IF NOT EXISTS "GroupLotteryConfig" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "costPoints" INTEGER NOT NULL DEFAULT 10,
    "winRatePercent" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupLotteryConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupLotteryConfig_groupId_key" ON "GroupLotteryConfig"("groupId");

CREATE TABLE IF NOT EXISTS "GroupLotteryPrize" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupLotteryPrize_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GroupLotteryPrize_configId_isActive_sortOrder_idx"
  ON "GroupLotteryPrize"("configId", "isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "LotteryDraw" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "configId" TEXT,
    "costPoints" INTEGER NOT NULL,
    "won" BOOLEAN NOT NULL,
    "prizeId" TEXT,
    "prizeName" TEXT,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LotteryDraw_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LotteryDraw_groupId_createdAt_idx" ON "LotteryDraw"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "LotteryDraw_groupMemberId_createdAt_idx" ON "LotteryDraw"("groupMemberId", "createdAt");
CREATE INDEX IF NOT EXISTS "LotteryDraw_telegramUserId_createdAt_idx" ON "LotteryDraw"("telegramUserId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "GroupLotteryConfig"
    ADD CONSTRAINT "GroupLotteryConfig_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GroupLotteryPrize"
    ADD CONSTRAINT "GroupLotteryPrize_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "GroupLotteryConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LotteryDraw"
    ADD CONSTRAINT "LotteryDraw_groupMemberId_fkey"
    FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LotteryDraw"
    ADD CONSTRAINT "LotteryDraw_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "GroupLotteryConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LotteryDraw"
    ADD CONSTRAINT "LotteryDraw_prizeId_fkey"
    FOREIGN KEY ("prizeId") REFERENCES "GroupLotteryPrize"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
