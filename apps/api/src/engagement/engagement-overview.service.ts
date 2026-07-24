import { ForbiddenException, Injectable } from '@nestjs/common';
import { PointTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS } from '../rbac/permissions';
import { LeaderboardEntry, LeaderboardService } from './leaderboard.service';
import {
  addBusinessDaysUtc,
  businessDayKeyUtc,
  endOfBusinessDayUtc,
  toBusinessDayUtc,
} from './business-day.util';

/** Dashboard viewer placeholder — LeaderboardService requires a telegramUserId. */
const DASHBOARD_VIEWER_ID = '';

/** Finite JSON number; 0 when empty; at most 2 decimal places. */
export function averagePoints(totalPoints: number, registeredMembers: number): number {
  if (registeredMembers <= 0) return 0;
  const raw = totalPoints / registeredMembers;
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 100) / 100;
}

export type EngagementOverviewToday = {
  messages: number;
  checkins: number;
  pointsIssued: number;
  activeMembers: number;
};

export type EngagementOverviewGroup = {
  telegramMembers: number;
  registeredMembers: number;
  totalPoints: number;
  averagePoints: number;
};

export type EngagementOverviewTrendPoint = {
  date: string;
  messages: number;
  checkins: number;
};

export type EngagementOverviewResult = {
  today: EngagementOverviewToday;
  group: EngagementOverviewGroup;
  leaderboards: {
    points: LeaderboardEntry[];
    messages: LeaderboardEntry[];
  };
  trends: EngagementOverviewTrendPoint[];
};

@Injectable()
export class EngagementOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  async overview(userId: string, groupId: string, now: Date = new Date()): Promise<EngagementOverviewResult> {
    await this.assertGroupView(userId, groupId);

    const today = toBusinessDayUtc(now);
    const tomorrow = endOfBusinessDayUtc(today);
    const trendStart = addBusinessDaysUtc(today, -6);

    const [
      todayMessagesAgg,
      todayCheckinUsers,
      todayPointsAgg,
      todayActiveMembers,
      groupRow,
      memberAgg,
      pointsBoard,
      messagesBoard,
      messageTrendRows,
      checkinTrendRows,
    ] = await Promise.all([
      this.prisma.dailyMessageStat.aggregate({
        where: { groupId, date: today },
        _sum: { count: true },
      }),
      this.prisma.pointTransaction.groupBy({
        by: ['telegramUserId'],
        where: {
          groupId,
          type: PointTransactionType.CHECKIN,
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
      this.prisma.pointTransaction.aggregate({
        where: {
          groupId,
          amount: { gt: 0 },
          createdAt: { gte: today, lt: tomorrow },
        },
        _sum: { amount: true },
      }),
      this.prisma.dailyMessageStat.count({
        where: { groupId, date: today, count: { gt: 0 } },
      }),
      this.prisma.group.findUnique({
        where: { id: groupId },
        select: { memberCount: true },
      }),
      this.prisma.groupMember.aggregate({
        where: { groupId },
        _count: { _all: true },
        _sum: { points: true },
      }),
      this.leaderboard.getPointsLeaderboard(groupId, DASHBOARD_VIEWER_ID, 5),
      this.leaderboard.getMonthlyMessageLeaderboard(groupId, DASHBOARD_VIEWER_ID, now, 5),
      this.prisma.dailyMessageStat.groupBy({
        by: ['date'],
        where: { groupId, date: { gte: trendStart, lte: today } },
        _sum: { count: true },
      }),
      this.prisma.pointTransaction.findMany({
        where: {
          groupId,
          type: PointTransactionType.CHECKIN,
          createdAt: { gte: trendStart, lt: tomorrow },
        },
        select: { telegramUserId: true, createdAt: true },
      }),
    ]);

    const registeredMembers = memberAgg._count._all;
    const totalPoints = memberAgg._sum.points ?? 0;

    return {
      today: {
        messages: todayMessagesAgg._sum.count ?? 0,
        checkins: todayCheckinUsers.length,
        pointsIssued: todayPointsAgg._sum.amount ?? 0,
        activeMembers: todayActiveMembers,
      },
      group: {
        telegramMembers: groupRow?.memberCount ?? 0,
        registeredMembers,
        totalPoints,
        averagePoints: averagePoints(totalPoints, registeredMembers),
      },
      leaderboards: {
        points: pointsBoard.entries,
        messages: messagesBoard.entries,
      },
      trends: this.buildTrends(today, messageTrendRows, checkinTrendRows),
    };
  }

  /** Same isolation pattern as GroupsService.assertAccess (tenant + scope + perm). */
  private async assertGroupView(userId: string, groupId: string) {
    const ctx = await this.rbac.context(userId);
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId: ctx.tenantId },
    });
    if (!group) throw new ForbiddenException('无权访问该群组');
    this.rbac.assertGroup(ctx, groupId, PERMISSIONS.GROUPS_VIEW);
    return group;
  }

  private buildTrends(
    today: Date,
    messageRows: Array<{ date: Date; _sum: { count: number | null } }>,
    checkinRows: Array<{ telegramUserId: string; createdAt: Date }>,
  ): EngagementOverviewTrendPoint[] {
    const messagesByDay = new Map<string, number>();
    for (const row of messageRows) {
      messagesByDay.set(businessDayKeyUtc(row.date), row._sum.count ?? 0);
    }

    const checkinsByDay = new Map<string, Set<string>>();
    for (const row of checkinRows) {
      const key = businessDayKeyUtc(row.createdAt);
      let set = checkinsByDay.get(key);
      if (!set) {
        set = new Set();
        checkinsByDay.set(key, set);
      }
      set.add(row.telegramUserId);
    }

    const trends: EngagementOverviewTrendPoint[] = [];
    for (let i = -6; i <= 0; i++) {
      const day = addBusinessDaysUtc(today, i);
      const key = businessDayKeyUtc(day);
      trends.push({
        date: key,
        messages: messagesByDay.get(key) ?? 0,
        checkins: checkinsByDay.get(key)?.size ?? 0,
      });
    }
    return trends;
  }
}
