import {
  assignCompetitionRanks,
  clampLeaderboardLimit,
  competitionRankAmong,
  LeaderboardService,
} from './leaderboard.service';

describe('assignCompetitionRanks', () => {
  it('uses competition ranks 1,2,2,4 for values 100,80,80,50', () => {
    const entries = assignCompetitionRanks([
      { telegramUserId: 'a', displayName: '@a', value: 100 },
      { telegramUserId: 'b', displayName: '@b', value: 80 },
      { telegramUserId: 'c', displayName: '@c', value: 80 },
      { telegramUserId: 'd', displayName: '@d', value: 50 },
    ]);
    expect(entries.map((e) => ({ rank: e.rank, value: e.value }))).toEqual([
      { rank: 1, value: 100 },
      { rank: 2, value: 80 },
      { rank: 2, value: 80 },
      { rank: 4, value: 50 },
    ]);
  });

  it('keeps stable order for ties (caller must sort by id)', () => {
    const entries = assignCompetitionRanks([
      { telegramUserId: 'u1', displayName: 'u1', value: 10 },
      { telegramUserId: 'u2', displayName: 'u2', value: 10 },
    ]);
    expect(entries[0].telegramUserId).toBe('u1');
    expect(entries[1].telegramUserId).toBe('u2');
    expect(entries[0].rank).toBe(1);
    expect(entries[1].rank).toBe(1);
  });
});

describe('competitionRankAmong / clampLeaderboardLimit', () => {
  it('computes rank from strictly higher user values (100,80,80,50)', () => {
    const values = [100, 80, 80, 50];
    expect(competitionRankAmong(100, values)).toBe(1);
    expect(competitionRankAmong(80, values)).toBe(2);
    expect(competitionRankAmong(50, values)).toBe(4);
  });

  it('clamps limit to 1..50', () => {
    expect(clampLeaderboardLimit(10)).toBe(10);
    expect(clampLeaderboardLimit(0)).toBe(1);
    expect(clampLeaderboardLimit(100)).toBe(50);
    expect(clampLeaderboardLimit(Number.NaN)).toBe(10);
  });
});

describe('LeaderboardService', () => {
  const groupMember = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  };
  const dailyMessageStat = {
    groupBy: jest.fn(),
  };
  const prisma = { groupMember, dailyMessageStat };
  let service: LeaderboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaderboardService(prisma as never);
  });

  describe('getPointsLeaderboard', () => {
    it('returns top entries with competition ranks and current user', async () => {
      groupMember.findMany.mockResolvedValue([
        {
          telegramUserId: 'u1',
          username: 'alice',
          firstName: null,
          lastName: null,
          points: 100,
        },
        {
          telegramUserId: 'u2',
          username: null,
          firstName: 'Bob',
          lastName: null,
          points: 80,
        },
        {
          telegramUserId: 'u3',
          username: null,
          firstName: 'Carol',
          lastName: null,
          points: 80,
        },
      ]);
      groupMember.findUnique.mockResolvedValue({
        telegramUserId: 'u3',
        username: null,
        firstName: 'Carol',
        lastName: null,
        points: 80,
      });
      groupMember.count.mockResolvedValue(1);

      const result = await service.getPointsLeaderboard('g1', 'u3', 10);

      expect(groupMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId: 'g1', points: { gt: 0 } },
          orderBy: [{ points: 'desc' }, { telegramUserId: 'asc' }],
          take: 10,
        }),
      );
      expect(result.entries.map((e) => e.rank)).toEqual([1, 2, 2]);
      expect(result.entries[0].displayName).toBe('@alice');
      expect(result.currentUser).toEqual({
        rank: 2,
        telegramUserId: 'u3',
        displayName: 'Carol',
        value: 80,
      });
    });

    it('returns currentUser null when points <= 0 or member missing', async () => {
      groupMember.findMany.mockResolvedValue([]);
      groupMember.findUnique.mockResolvedValue({
        telegramUserId: 'u9',
        username: null,
        firstName: null,
        lastName: null,
        points: 0,
      });

      const zero = await service.getPointsLeaderboard('g1', 'u9', 10);
      expect(zero.currentUser).toBeNull();
      expect(groupMember.count).not.toHaveBeenCalled();

      groupMember.findUnique.mockResolvedValue(null);
      const missing = await service.getPointsLeaderboard('g1', 'missing', 10);
      expect(missing.currentUser).toBeNull();
    });

    it('excludes non-positive points via query filter', async () => {
      groupMember.findMany.mockResolvedValue([]);
      groupMember.findUnique.mockResolvedValue(null);
      await service.getPointsLeaderboard('g1', 'u1', 10);
      expect(groupMember.findMany.mock.calls[0][0].where.points).toEqual({ gt: 0 });
    });
  });

  describe('getMonthlyMessageLeaderboard', () => {
    const now = new Date('2026-07-22T12:00:00.000Z');

    it('aggregates month messages with UTC bounds and batch-loads names', async () => {
      dailyMessageStat.groupBy.mockResolvedValue([
        { telegramUserId: 'u2', _sum: { count: 30 } },
        { telegramUserId: 'u1', _sum: { count: 10 } },
        { telegramUserId: 'u0', _sum: { count: 0 } },
      ]);
      groupMember.findMany.mockResolvedValue([
        {
          telegramUserId: 'u1',
          username: 'alice',
          firstName: null,
          lastName: null,
        },
        {
          telegramUserId: 'u2',
          username: null,
          firstName: 'Bob',
          lastName: 'Lee',
        },
      ]);

      const result = await service.getMonthlyMessageLeaderboard('g1', 'u1', now, 10);

      expect(dailyMessageStat.groupBy).toHaveBeenCalledWith({
        by: ['telegramUserId'],
        where: {
          groupId: 'g1',
          date: {
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lte: new Date('2026-07-22T00:00:00.000Z'),
          },
        },
        _sum: { count: true },
      });
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toMatchObject({
        rank: 1,
        telegramUserId: 'u2',
        displayName: 'Bob Lee',
        value: 30,
      });
      expect(result.entries[1]).toMatchObject({
        rank: 2,
        telegramUserId: 'u1',
        displayName: '@alice',
        value: 10,
      });
      expect(result.currentUser).toEqual({
        rank: 2,
        telegramUserId: 'u1',
        displayName: '@alice',
        value: 10,
      });
      // one batch member fetch, not N+1
      expect(groupMember.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns currentUser null when monthly messages are 0', async () => {
      dailyMessageStat.groupBy.mockResolvedValue([
        { telegramUserId: 'u2', _sum: { count: 5 } },
      ]);
      groupMember.findMany.mockResolvedValue([
        {
          telegramUserId: 'u2',
          username: 'bob',
          firstName: null,
          lastName: null,
        },
      ]);

      const result = await service.getMonthlyMessageLeaderboard('g1', 'u1', now, 10);
      expect(result.currentUser).toBeNull();
      expect(result.entries).toHaveLength(1);
    });

    it('uses telegramUserId when GroupMember row is missing', async () => {
      dailyMessageStat.groupBy.mockResolvedValue([
        { telegramUserId: 'orphan', _sum: { count: 3 } },
      ]);
      groupMember.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyMessageLeaderboard(
        'g1',
        'viewer',
        now,
        10,
      );
      expect(result.entries[0].displayName).toBe('orphan');
      expect(result.currentUser).toBeNull();
    });

    it('applies competition ranks for tied message totals', async () => {
      dailyMessageStat.groupBy.mockResolvedValue([
        { telegramUserId: 'a', _sum: { count: 5 } },
        { telegramUserId: 'b', _sum: { count: 5 } },
        { telegramUserId: 'c', _sum: { count: 1 } },
      ]);
      groupMember.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyMessageLeaderboard('g1', 'c', now, 10);
      expect(result.entries.map((e) => e.rank)).toEqual([1, 1, 3]);
      expect(result.currentUser?.rank).toBe(3);
    });
  });
});
