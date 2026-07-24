import { ProfileService } from './profile.service';
import { memberDisplayName } from './engagement-commands.util';

describe('memberDisplayName', () => {
  it('prefers username', () => {
    expect(
      memberDisplayName({
        username: 'alice',
        firstName: 'A',
        lastName: 'B',
        telegramUserId: '1',
      }),
    ).toBe('@alice');
  });

  it('falls back to firstName + lastName', () => {
    expect(
      memberDisplayName({
        username: null,
        firstName: 'Alice',
        lastName: 'Lee',
        telegramUserId: '1',
      }),
    ).toBe('Alice Lee');
  });

  it('falls back to telegramUserId', () => {
    expect(
      memberDisplayName({
        username: null,
        firstName: null,
        lastName: null,
        telegramUserId: '42',
      }),
    ).toBe('42');
  });
});

describe('ProfileService', () => {
  const groupMember = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  };
  const dailyMessageStat = {
    findUnique: jest.fn(),
    aggregate: jest.fn(),
  };
  const prisma = {
    groupMember,
    dailyMessageStat,
    pointTransaction: { groupBy: jest.fn() },
  };

  let service: ProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProfileService(prisma as never);
  });

  const member = {
    id: 'm1',
    groupId: 'g1',
    telegramUserId: 'u1',
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Lee',
    points: 42,
    level: 2,
    checkinStreak: 7,
  };

  it('auto-creates member with profile fields then returns summary', async () => {
    groupMember.upsert.mockResolvedValue(member);
    dailyMessageStat.findUnique.mockResolvedValue({ count: 5 });
    dailyMessageStat.aggregate.mockResolvedValue({ _sum: { count: 40 } });

    const summary = await service.getOrCreateProfileSummary({
      groupId: 'g1',
      telegramUserId: 'u1',
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Lee',
      now: new Date('2026-07-22T12:00:00.000Z'),
    });

    expect(groupMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Lee',
        }),
      }),
    );
    expect(summary.displayName).toBe('@alice');
    expect(summary.points).toBe(42);
    expect(summary.level).toBe(2);
    expect(summary.checkinStreak).toBe(7);
    expect(summary.todayMessages).toBe(5);
    expect(summary.monthMessages).toBe(40);
    expect(summary).not.toHaveProperty('todayPointsRank');
    expect(prisma.pointTransaction.groupBy).not.toHaveBeenCalled();
  });

  it('month aggregate uses gte monthStart and lte today (no future)', async () => {
    groupMember.upsert.mockResolvedValue(member);
    dailyMessageStat.findUnique.mockResolvedValue(null);
    dailyMessageStat.aggregate.mockResolvedValue({ _sum: { count: null } });

    await service.getOrCreateProfileSummary({
      groupId: 'g1',
      telegramUserId: 'u1',
      now: new Date('2026-07-22T12:00:00.000Z'),
    });

    expect(dailyMessageStat.aggregate).toHaveBeenCalledWith({
      where: {
        groupId: 'g1',
        telegramUserId: 'u1',
        date: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lte: new Date('2026-07-22T00:00:00.000Z'),
        },
      },
      _sum: { count: true },
    });
  });

  it('returns 0 when no message stats', async () => {
    groupMember.upsert.mockResolvedValue({
      ...member,
      username: null,
      firstName: 'Alice',
      lastName: null,
    });
    dailyMessageStat.findUnique.mockResolvedValue(null);
    dailyMessageStat.aggregate.mockResolvedValue({ _sum: { count: null } });

    const summary = await service.getOrCreateProfileSummary({
      groupId: 'g1',
      telegramUserId: 'u1',
      firstName: 'Alice',
      lastName: null,
    });

    expect(summary.todayMessages).toBe(0);
    expect(summary.monthMessages).toBe(0);
    expect(summary.displayName).toBe('Alice');
  });
});
