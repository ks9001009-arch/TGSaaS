import { ForbiddenException } from '@nestjs/common';
import { PointTransactionType } from '@prisma/client';
import {
  averagePoints,
  EngagementOverviewService,
} from './engagement-overview.service';
import { PERMISSIONS } from '../rbac/permissions';

describe('averagePoints', () => {
  it('returns 0 when registeredMembers is 0', () => {
    expect(averagePoints(100, 0)).toBe(0);
  });

  it('rounds to at most two decimal places as a finite JSON number', () => {
    expect(averagePoints(10, 3)).toBe(3.33);
    expect(averagePoints(50, 5)).toBe(10);
    expect(averagePoints(1, 3)).toBe(0.33);
  });

  it('never returns NaN or Infinity', () => {
    expect(Number.isFinite(averagePoints(Number.POSITIVE_INFINITY, 1))).toBe(true);
    expect(Number.isNaN(averagePoints(Number.NaN, 2))).toBe(false);
    expect(averagePoints(Number.POSITIVE_INFINITY, 1)).toBe(0);
    expect(averagePoints(Number.NaN, 2)).toBe(0);
  });
});

describe('EngagementOverviewService', () => {
  const now = new Date('2026-07-22T15:30:00.000Z');
  const today = new Date('2026-07-22T00:00:00.000Z');
  const tomorrow = new Date('2026-07-23T00:00:00.000Z');
  const trendStart = new Date('2026-07-16T00:00:00.000Z');

  let prisma: {
    group: { findFirst: jest.Mock; findUnique: jest.Mock };
    dailyMessageStat: { aggregate: jest.Mock; count: jest.Mock; groupBy: jest.Mock };
    pointTransaction: { groupBy: jest.Mock; aggregate: jest.Mock; findMany: jest.Mock };
    groupMember: { aggregate: jest.Mock };
  };
  let rbac: {
    context: jest.Mock;
    assertGroup: jest.Mock;
  };
  let leaderboard: {
    getPointsLeaderboard: jest.Mock;
    getMonthlyMessageLeaderboard: jest.Mock;
  };
  let service: EngagementOverviewService;

  beforeEach(() => {
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue({ id: 'g1', tenantId: 't1', memberCount: 100 }),
        findUnique: jest.fn().mockResolvedValue({ memberCount: 100 }),
      },
      dailyMessageStat: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { count: 12 } }),
        count: jest.fn().mockResolvedValue(4),
        groupBy: jest.fn().mockResolvedValue([
          { date: today, _sum: { count: 12 } },
          { date: new Date('2026-07-20T00:00:00.000Z'), _sum: { count: 3 } },
        ]),
      },
      pointTransaction: {
        groupBy: jest.fn().mockResolvedValue([{ telegramUserId: 'u1' }, { telegramUserId: 'u2' }]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 30 } }),
        findMany: jest.fn().mockResolvedValue([
          { telegramUserId: 'u1', createdAt: new Date('2026-07-22T01:00:00.000Z') },
          { telegramUserId: 'u1', createdAt: new Date('2026-07-22T02:00:00.000Z') },
          { telegramUserId: 'u2', createdAt: new Date('2026-07-20T10:00:00.000Z') },
          { telegramUserId: 'u1', createdAt: new Date('2026-07-20T11:00:00.000Z') },
        ]),
      },
      groupMember: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 5 },
          _sum: { points: 50 },
        }),
      },
    };
    rbac = {
      context: jest.fn().mockResolvedValue({
        tenantId: 't1',
        groupIds: ['g1'],
        isSuper: true,
        permissions: [PERMISSIONS.GROUPS_VIEW],
      }),
      assertGroup: jest.fn(),
    };
    leaderboard = {
      getPointsLeaderboard: jest.fn().mockResolvedValue({
        entries: [
          { rank: 1, telegramUserId: 'a', displayName: '@a', value: 100 },
          { rank: 2, telegramUserId: 'b', displayName: '@b', value: 80 },
        ],
        currentUser: { rank: 99, telegramUserId: '', displayName: '', value: 0 },
      }),
      getMonthlyMessageLeaderboard: jest.fn().mockResolvedValue({
        entries: [{ rank: 1, telegramUserId: 'a', displayName: '@a', value: 9 }],
        currentUser: null,
      }),
    };
    service = new EngagementOverviewService(prisma as never, rbac as never, leaderboard as never);
  });

  it('allows in-tenant group access with GROUPS_VIEW', async () => {
    await service.overview('admin1', 'g1', now);
    expect(rbac.context).toHaveBeenCalledWith('admin1');
    expect(prisma.group.findFirst).toHaveBeenCalledWith({
      where: { id: 'g1', tenantId: 't1' },
    });
    expect(rbac.assertGroup).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1' }),
      'g1',
      PERMISSIONS.GROUPS_VIEW,
    );
  });

  it('forbids cross-tenant or missing group before assertGroup', async () => {
    prisma.group.findFirst.mockResolvedValue(null);
    await expect(service.overview('admin1', 'g1', now)).rejects.toBeInstanceOf(ForbiddenException);
    expect(rbac.assertGroup).not.toHaveBeenCalled();
    expect(prisma.dailyMessageStat.aggregate).not.toHaveBeenCalled();
    expect(leaderboard.getPointsLeaderboard).not.toHaveBeenCalled();
  });

  it('forbids when assertGroup rejects missing GROUPS_VIEW before stats', async () => {
    rbac.assertGroup.mockImplementation(() => {
      throw new ForbiddenException('没有该群组的操作权限');
    });
    await expect(service.overview('admin1', 'g1', now)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.dailyMessageStat.aggregate).not.toHaveBeenCalled();
    expect(prisma.pointTransaction.groupBy).not.toHaveBeenCalled();
    expect(prisma.pointTransaction.aggregate).not.toHaveBeenCalled();
    expect(prisma.dailyMessageStat.count).not.toHaveBeenCalled();
    expect(prisma.group.findUnique).not.toHaveBeenCalled();
    expect(prisma.groupMember.aggregate).not.toHaveBeenCalled();
    expect(prisma.dailyMessageStat.groupBy).not.toHaveBeenCalled();
    expect(prisma.pointTransaction.findMany).not.toHaveBeenCalled();
    expect(leaderboard.getPointsLeaderboard).not.toHaveBeenCalled();
    expect(leaderboard.getMonthlyMessageLeaderboard).not.toHaveBeenCalled();
  });

  it('runs auth before any stats / leaderboard queries', async () => {
    const order: string[] = [];
    rbac.context.mockImplementation(async () => {
      order.push('context');
      return {
        tenantId: 't1',
        groupIds: ['g1'],
        isSuper: true,
        permissions: [PERMISSIONS.GROUPS_VIEW],
      };
    });
    prisma.group.findFirst.mockImplementation(async () => {
      order.push('findFirst');
      return { id: 'g1', tenantId: 't1' };
    });
    rbac.assertGroup.mockImplementation(() => {
      order.push('assertGroup');
    });
    prisma.dailyMessageStat.aggregate.mockImplementation(async () => {
      order.push('stats');
      return { _sum: { count: 0 } };
    });
    leaderboard.getPointsLeaderboard.mockImplementation(async () => {
      order.push('leaderboard');
      return { entries: [], currentUser: null };
    });

    await service.overview('admin1', 'g1', now);
    expect(order.indexOf('context')).toBeLessThan(order.indexOf('assertGroup'));
    expect(order.indexOf('findFirst')).toBeLessThan(order.indexOf('assertGroup'));
    expect(order.indexOf('assertGroup')).toBeLessThan(order.indexOf('stats'));
    expect(order.indexOf('assertGroup')).toBeLessThan(order.indexOf('leaderboard'));
  });

  it('sums today messages and maps null sum to 0', async () => {
    const ok = await service.overview('admin1', 'g1', now);
    expect(ok.today.messages).toBe(12);
    expect(prisma.dailyMessageStat.aggregate).toHaveBeenCalledWith({
      where: { groupId: 'g1', date: today },
      _sum: { count: true },
    });

    prisma.dailyMessageStat.aggregate.mockResolvedValue({ _sum: { count: null } });
    const empty = await service.overview('admin1', 'g1', now);
    expect(empty.today.messages).toBe(0);
  });

  it('dedupes today checkins via groupBy telegramUserId and CHECKIN only', async () => {
    const result = await service.overview('admin1', 'g1', now);
    expect(result.today.checkins).toBe(2);
    expect(prisma.pointTransaction.groupBy).toHaveBeenCalledWith({
      by: ['telegramUserId'],
      where: {
        groupId: 'g1',
        type: PointTransactionType.CHECKIN,
        createdAt: { gte: today, lt: tomorrow },
      },
    });
  });

  it('pointsIssued aggregates amount > 0 in [today, tomorrow)', async () => {
    await service.overview('admin1', 'g1', now);
    expect(prisma.pointTransaction.aggregate).toHaveBeenCalledWith({
      where: {
        groupId: 'g1',
        amount: { gt: 0 },
        createdAt: { gte: today, lt: tomorrow },
      },
      _sum: { amount: true },
    });
  });

  it('returns registeredMembers, totalPoints, and two-decimal averagePoints', async () => {
    prisma.groupMember.aggregate.mockResolvedValue({
      _count: { _all: 3 },
      _sum: { points: 10 },
    });
    const result = await service.overview('admin1', 'g1', now);
    expect(result.group.registeredMembers).toBe(3);
    expect(result.group.totalPoints).toBe(10);
    expect(result.group.averagePoints).toBe(3.33);
    expect(Number.isFinite(result.group.averagePoints)).toBe(true);
  });

  it('averagePoints is 0 when no registered members', async () => {
    prisma.groupMember.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { points: null },
    });
    const result = await service.overview('admin1', 'g1', now);
    expect(result.group.averagePoints).toBe(0);
    expect(result.group.totalPoints).toBe(0);
  });

  it('reuses LeaderboardService Top5 and returns only entries', async () => {
    const result = await service.overview('admin1', 'g1', now);
    expect(leaderboard.getPointsLeaderboard).toHaveBeenCalledWith('g1', '', 5);
    expect(leaderboard.getMonthlyMessageLeaderboard).toHaveBeenCalledWith('g1', '', now, 5);
    expect(result.leaderboards.points).toEqual([
      { rank: 1, telegramUserId: 'a', displayName: '@a', value: 100 },
      { rank: 2, telegramUserId: 'b', displayName: '@b', value: 80 },
    ]);
    expect(result.leaderboards.messages).toEqual([
      { rank: 1, telegramUserId: 'a', displayName: '@a', value: 9 },
    ]);
    expect(result.leaderboards).not.toHaveProperty('currentUser');
  });

  it('builds fixed 7 ascending UTC days with zero fill and daily distinct checkins', async () => {
    const result = await service.overview('admin1', 'g1', now);

    expect(result.trends).toHaveLength(7);
    expect(result.trends.map((t) => t.date)).toEqual([
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
    ]);
    expect(result.trends[0]).toEqual({ date: '2026-07-16', messages: 0, checkins: 0 });
    // 2026-07-20: messages 3; checkins u2 + u1 => 2 distinct
    expect(result.trends[4]).toEqual({ date: '2026-07-20', messages: 3, checkins: 2 });
    // same user twice same day => 1; u1 also on 07-20 counted separately there
    expect(result.trends[6]).toEqual({ date: '2026-07-22', messages: 12, checkins: 1 });

    expect(prisma.dailyMessageStat.groupBy).toHaveBeenCalledWith({
      by: ['date'],
      where: { groupId: 'g1', date: { gte: trendStart, lte: today } },
      _sum: { count: true },
    });
    expect(prisma.pointTransaction.findMany).toHaveBeenCalledWith({
      where: {
        groupId: 'g1',
        type: PointTransactionType.CHECKIN,
        createdAt: { gte: trendStart, lt: tomorrow },
      },
      select: { telegramUserId: true, createdAt: true },
    });
  });

  it('null aggregates become zeros', async () => {
    prisma.dailyMessageStat.aggregate.mockResolvedValue({ _sum: { count: null } });
    prisma.pointTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.pointTransaction.groupBy.mockResolvedValue([]);
    prisma.dailyMessageStat.count.mockResolvedValue(0);

    const result = await service.overview('admin1', 'g1', now);
    expect(result.today).toEqual({
      messages: 0,
      checkins: 0,
      pointsIssued: 0,
      activeMembers: 0,
    });
    expect(Number.isFinite(result.group.averagePoints)).toBe(true);
    expect(result.group.averagePoints).not.toBe(Number.POSITIVE_INFINITY);
  });
});
