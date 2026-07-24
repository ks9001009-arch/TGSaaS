import { BadRequestException, Injectable } from '@nestjs/common';
import {
  GroupMember,
  PointTransaction,
  PointTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  addBusinessDaysUtc,
  businessDayKeyUtc,
  isSameBusinessDayUtc,
  toBusinessDayUtc,
} from './business-day.util';

export const CHECKIN_BASE_POINTS = 10;

/**
 * Milestone-day bonuses only (exact streak match, one-shot).
 * Days between milestones get base points only — no lingering tier bonus.
 */
export const CHECKIN_STREAK_BONUSES: ReadonlyArray<{ streak: number; bonus: number }> = [
  { streak: 3, bonus: 2 },
  { streak: 7, bonus: 5 },
  { streak: 15, bonus: 10 },
  { streak: 30, bonus: 20 },
];

export type CheckinInput = {
  groupId: string;
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Optional clock override for tests; production should omit (uses now). */
  now?: Date;
};

export type CheckinSuccess = {
  status: 'ok';
  member: GroupMember;
  transaction: PointTransaction;
  streak: number;
  basePoints: number;
  bonusPoints: number;
  pointsAwarded: number;
  businessDay: Date;
};

export type CheckinAlreadyDone = {
  status: 'already_checked_in';
  member: GroupMember;
  streak: number;
  businessDay: Date;
};

export type CheckinResult = CheckinSuccess | CheckinAlreadyDone;

/** Bonus for an exact milestone day only; otherwise 0. */
export function checkinStreakBonus(streak: number): number {
  const tier = CHECKIN_STREAK_BONUSES.find((t) => t.streak === streak);
  return tier?.bonus ?? 0;
}

export function checkinPointsForStreak(streak: number): {
  basePoints: number;
  bonusPoints: number;
  pointsAwarded: number;
} {
  const basePoints = CHECKIN_BASE_POINTS;
  const bonusPoints = checkinStreakBonus(streak);
  return { basePoints, bonusPoints, pointsAwarded: basePoints + bonusPoints };
}

/**
 * Streak rules (UTC business days):
 * - lastCheckinDate is today        → already checked in (caller must short-circuit)
 * - lastCheckinDate is yesterday    → streak + 1
 * - lastCheckinDate earlier / null  → streak = 1
 */
export function computeCheckinStreak(
  lastCheckinDate: Date | null | undefined,
  priorStreak: number,
  today: Date,
): { alreadyToday: true } | { alreadyToday: false; streak: number } {
  if (lastCheckinDate && isSameBusinessDayUtc(lastCheckinDate, today)) {
    return { alreadyToday: true };
  }
  const yesterday = addBusinessDaysUtc(today, -1);
  if (lastCheckinDate && isSameBusinessDayUtc(lastCheckinDate, yesterday)) {
    return { alreadyToday: false, streak: priorStreak + 1 };
  }
  return { alreadyToday: false, streak: 1 };
}

export function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

@Injectable()
export class CheckinService {
  constructor(private readonly prisma: PrismaService) {}

  async checkin(input: CheckinInput): Promise<CheckinResult> {
    if (!input.groupId || !input.telegramUserId) {
      throw new BadRequestException('groupId and telegramUserId are required');
    }

    const now = input.now ?? new Date();
    const today = toBusinessDayUtc(now);
    const dayKey = businessDayKeyUtc(today);
    const referenceId = `checkin:${input.groupId}:${input.telegramUserId}:${dayKey}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Auto-create profile with Telegram profile fields; joinedAt only on create.
        await tx.groupMember.upsert({
          where: {
            groupId_telegramUserId: {
              groupId: input.groupId,
              telegramUserId: input.telegramUserId,
            },
          },
          create: {
            groupId: input.groupId,
            telegramUserId: input.telegramUserId,
            username: input.username ?? null,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            lastActiveAt: now,
          },
          update: {
            ...(input.username !== undefined ? { username: input.username } : {}),
            ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
            ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
            lastActiveAt: now,
          },
        });

        const existing = await tx.groupMember.findUnique({
          where: {
            groupId_telegramUserId: {
              groupId: input.groupId,
              telegramUserId: input.telegramUserId,
            },
          },
        });
        if (!existing) {
          throw new BadRequestException('failed to load group member after upsert');
        }

        const streakState = computeCheckinStreak(
          existing.lastCheckinDate,
          existing.checkinStreak,
          today,
        );
        if (streakState.alreadyToday) {
          return {
            status: 'already_checked_in' as const,
            member: existing,
            streak: existing.checkinStreak,
            businessDay: today,
          };
        }

        const streak = streakState.streak;
        const { basePoints, bonusPoints, pointsAwarded } = checkinPointsForStreak(streak);

        const member = await tx.groupMember.update({
          where: { id: existing.id },
          data: {
            checkinStreak: streak,
            lastCheckinDate: today,
            points: { increment: pointsAwarded },
          },
        });

        const reason =
          bonusPoints > 0
            ? `每日签到 +${basePoints}，连续 ${streak} 天奖励 +${bonusPoints}`
            : `每日签到 +${basePoints}`;

        // DB unique (groupId, referenceId) is the concurrency backstop.
        const transaction = await tx.pointTransaction.create({
          data: {
            groupId: existing.groupId,
            groupMemberId: existing.id,
            telegramUserId: existing.telegramUserId,
            amount: pointsAwarded,
            type: PointTransactionType.CHECKIN,
            reason,
            referenceId,
          },
        });

        return {
          status: 'ok' as const,
          member,
          transaction,
          streak,
          basePoints,
          bonusPoints,
          pointsAwarded,
          businessDay: today,
        };
      });
    } catch (err) {
      // Unique violation → concurrent duplicate check-in; transaction already rolled back.
      if (isPrismaUniqueViolation(err)) {
        const member = await this.prisma.groupMember.findUnique({
          where: {
            groupId_telegramUserId: {
              groupId: input.groupId,
              telegramUserId: input.telegramUserId,
            },
          },
        });
        if (!member) {
          throw new BadRequestException('check-in conflict but group member missing');
        }
        return {
          status: 'already_checked_in',
          member,
          streak: member.checkinStreak,
          businessDay: today,
        };
      }
      throw err;
    }
  }
}
