import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfMonthUtc, toBusinessDayUtc } from './business-day.util';
import { memberDisplayName } from './engagement-commands.util';

export type LeaderboardEntry = {
  rank: number;
  telegramUserId: string;
  displayName: string;
  value: number;
};

export type LeaderboardResult = {
  entries: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
};

type ScoredRow = {
  telegramUserId: string;
  displayName: string;
  value: number;
};

/** Clamp leaderboard page size: min 1, max 50. */
export function clampLeaderboardLimit(limit: number, fallback = 10): number {
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(limit)));
}

/**
 * Competition ranking on a list already sorted by value DESC, telegramUserId ASC.
 * Example values 100,80,80,50 → ranks 1,2,2,4.
 */
export function assignCompetitionRanks(rows: ScoredRow[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rank =
      i === 0 || rows[i].value !== rows[i - 1].value ? i + 1 : entries[i - 1].rank;
    entries.push({
      rank,
      telegramUserId: rows[i].telegramUserId,
      displayName: rows[i].displayName,
      value: rows[i].value,
    });
  }
  return entries;
}

/** Competition rank: count of users with strictly greater value + 1. */
export function competitionRankAmong(
  value: number,
  allValues: number[],
): number {
  let higher = 0;
  for (const v of allValues) {
    if (v > value) higher += 1;
  }
  return higher + 1;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getPointsLeaderboard(
    groupId: string,
    telegramUserId: string,
    limit = 10,
  ): Promise<LeaderboardResult> {
    const take = clampLeaderboardLimit(limit);

    const top = await this.prisma.groupMember.findMany({
      where: { groupId, points: { gt: 0 } },
      select: {
        telegramUserId: true,
        username: true,
        firstName: true,
        lastName: true,
        points: true,
      },
      orderBy: [{ points: 'desc' }, { telegramUserId: 'asc' }],
      take,
    });

    const entries = assignCompetitionRanks(
      top.map((m) => ({
        telegramUserId: m.telegramUserId,
        displayName: memberDisplayName(m),
        value: m.points,
      })),
    );

    const me = await this.prisma.groupMember.findUnique({
      where: { groupId_telegramUserId: { groupId, telegramUserId } },
      select: {
        telegramUserId: true,
        username: true,
        firstName: true,
        lastName: true,
        points: true,
      },
    });

    let currentUser: LeaderboardEntry | null = null;
    if (me && me.points > 0) {
      const higher = await this.prisma.groupMember.count({
        where: { groupId, points: { gt: me.points } },
      });
      currentUser = {
        rank: higher + 1,
        telegramUserId: me.telegramUserId,
        displayName: memberDisplayName(me),
        value: me.points,
      };
    }

    return { entries, currentUser };
  }

  async getMonthlyMessageLeaderboard(
    groupId: string,
    telegramUserId: string,
    now: Date = new Date(),
    limit = 10,
  ): Promise<LeaderboardResult> {
    const take = clampLeaderboardLimit(limit);
    const monthStart = startOfMonthUtc(now);
    const today = toBusinessDayUtc(now);

    const grouped = await this.prisma.dailyMessageStat.groupBy({
      by: ['telegramUserId'],
      where: {
        groupId,
        date: { gte: monthStart, lte: today },
      },
      _sum: { count: true },
    });

    const scored = grouped
      .map((g) => ({
        telegramUserId: g.telegramUserId,
        value: g._sum.count ?? 0,
      }))
      .filter((g) => g.value > 0)
      .sort(
        (a, b) =>
          b.value - a.value || a.telegramUserId.localeCompare(b.telegramUserId),
      );

    const top = scored.slice(0, take);
    const myScore = scored.find((s) => s.telegramUserId === telegramUserId)?.value ?? 0;

    const idsNeeded = new Set(top.map((t) => t.telegramUserId));
    if (myScore > 0) idsNeeded.add(telegramUserId);

    const members =
      idsNeeded.size === 0
        ? []
        : await this.prisma.groupMember.findMany({
            where: {
              groupId,
              telegramUserId: { in: [...idsNeeded] },
            },
            select: {
              telegramUserId: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          });
    const memberMap = new Map(members.map((m) => [m.telegramUserId, m]));

    const nameOf = (id: string) =>
      memberDisplayName(
        memberMap.get(id) ?? {
          telegramUserId: id,
          username: null,
          firstName: null,
          lastName: null,
        },
      );

    const entries = assignCompetitionRanks(
      top.map((row) => ({
        telegramUserId: row.telegramUserId,
        displayName: nameOf(row.telegramUserId),
        value: row.value,
      })),
    );

    let currentUser: LeaderboardEntry | null = null;
    if (myScore > 0) {
      currentUser = {
        rank: competitionRankAmong(
          myScore,
          scored.map((s) => s.value),
        ),
        telegramUserId,
        displayName: nameOf(telegramUserId),
        value: myScore,
      };
    }

    return { entries, currentUser };
  }
}
