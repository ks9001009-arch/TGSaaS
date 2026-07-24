import { Injectable, NotFoundException } from '@nestjs/common';
import { GroupMember } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { startOfMonthUtc, toBusinessDayUtc } from './business-day.util';
import { memberDisplayName } from './engagement-commands.util';

export type ProfileSummary = {
  member: GroupMember;
  displayName: string;
  points: number;
  level: number;
  checkinStreak: number;
  todayMessages: number;
  monthMessages: number;
};

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfileSummary(
    groupId: string,
    telegramUserId: string,
    now: Date = new Date(),
  ): Promise<ProfileSummary> {
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_telegramUserId: { groupId, telegramUserId } },
    });
    if (!member) {
      // Callers that need auto-create should use getOrCreateProfileSummary.
      throw new NotFoundException(
        `Group member not found: groupId=${groupId} telegramUserId=${telegramUserId}`,
      );
    }
    return this.buildSummary(member, now);
  }

  /**
   * Auto-create GroupMember with Telegram profile fields, then return summary.
   * joinedAt is set only on create (Prisma default / omit on update).
   */
  async getOrCreateProfileSummary(input: {
    groupId: string;
    telegramUserId: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    now?: Date;
  }): Promise<ProfileSummary> {
    const now = input.now ?? new Date();
    const member = await this.prisma.groupMember.upsert({
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
    return this.buildSummary(member, now);
  }

  private async buildSummary(member: GroupMember, now: Date): Promise<ProfileSummary> {
    const today = toBusinessDayUtc(now);
    const monthStart = startOfMonthUtc(now);

    const [todayRow, monthAgg] = await Promise.all([
      this.prisma.dailyMessageStat.findUnique({
        where: {
          groupId_telegramUserId_date: {
            groupId: member.groupId,
            telegramUserId: member.telegramUserId,
            date: today,
          },
        },
      }),
      // Inclusive UTC month-start .. today's business day (no future dates).
      this.prisma.dailyMessageStat.aggregate({
        where: {
          groupId: member.groupId,
          telegramUserId: member.telegramUserId,
          date: { gte: monthStart, lte: today },
        },
        _sum: { count: true },
      }),
    ]);

    return {
      member,
      displayName: memberDisplayName(member),
      points: member.points,
      level: member.level,
      checkinStreak: member.checkinStreak,
      todayMessages: todayRow?.count ?? 0,
      monthMessages: monthAgg._sum.count ?? 0,
    };
  }
}
