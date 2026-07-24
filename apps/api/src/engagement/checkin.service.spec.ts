import {
  CHECKIN_BASE_POINTS,
  CheckinService,
  checkinPointsForStreak,
  checkinStreakBonus,
  computeCheckinStreak,
  isPrismaUniqueViolation,
} from './checkin.service';
import { Prisma } from '@prisma/client';
import { PointTransactionType } from '@prisma/client';

describe('checkinPointsForStreak (exact milestone days only)', () => {
  it('ordinary days get base only', () => {
    expect(checkinPointsForStreak(1).pointsAwarded).toBe(CHECKIN_BASE_POINTS);
    expect(checkinPointsForStreak(2).bonusPoints).toBe(0);
  });

  it('day 3 bonus = 2', () => {
    expect(checkinStreakBonus(3)).toBe(2);
    expect(checkinPointsForStreak(3).pointsAwarded).toBe(12);
  });

  it('day 4 bonus = 0 (no lingering tier)', () => {
    expect(checkinStreakBonus(4)).toBe(0);
    expect(checkinPointsForStreak(4).pointsAwarded).toBe(10);
  });

  it('day 7 bonus = 5', () => {
    expect(checkinStreakBonus(7)).toBe(5);
    expect(checkinPointsForStreak(7).pointsAwarded).toBe(15);
  });

  it('day 8 bonus = 0', () => {
    expect(checkinStreakBonus(8)).toBe(0);
    expect(checkinPointsForStreak(8).pointsAwarded).toBe(10);
  });

  it('day 15 bonus = 10', () => {
    expect(checkinStreakBonus(15)).toBe(10);
    expect(checkinPointsForStreak(15).pointsAwarded).toBe(20);
  });

  it('day 16 bonus = 0', () => {
    expect(checkinStreakBonus(16)).toBe(0);
    expect(checkinPointsForStreak(16).pointsAwarded).toBe(10);
  });

  it('day 30 bonus = 20', () => {
    expect(checkinStreakBonus(30)).toBe(20);
    expect(checkinPointsForStreak(30).pointsAwarded).toBe(30);
  });

  it('day 31 bonus = 0', () => {
    expect(checkinStreakBonus(31)).toBe(0);
    expect(checkinPointsForStreak(31).pointsAwarded).toBe(10);
  });
});

describe('computeCheckinStreak (UTC)', () => {
  const today = new Date('2026-07-22T00:00:00.000Z');

  it('Jul 21 then Jul 22 → continuous (+1)', () => {
    const r = computeCheckinStreak(new Date('2026-07-21T00:00:00.000Z'), 5, today);
    expect(r).toEqual({ alreadyToday: false, streak: 6 });
  });

  it('Jul 20 then Jul 22 → reset to 1', () => {
    const r = computeCheckinStreak(new Date('2026-07-20T00:00:00.000Z'), 10, today);
    expect(r).toEqual({ alreadyToday: false, streak: 1 });
  });

  it('same UTC day any time → already today', () => {
    expect(
      computeCheckinStreak(new Date('2026-07-22T00:00:00.000Z'), 3, today),
    ).toEqual({ alreadyToday: true });
    expect(
      computeCheckinStreak(
        new Date('2026-07-22T00:00:00.000Z'),
        3,
        new Date('2026-07-22T23:59:59.000Z'),
      ),
    ).toEqual({ alreadyToday: true });
  });

  it('month boundary Jul 31 → Aug 1 continuous', () => {
    const r = computeCheckinStreak(
      new Date('2026-07-31T00:00:00.000Z'),
      4,
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(r).toEqual({ alreadyToday: false, streak: 5 });
  });

  it('year boundary Dec 31 → Jan 1 continuous', () => {
    const r = computeCheckinStreak(
      new Date('2025-12-31T00:00:00.000Z'),
      2,
      new Date('2026-01-01T12:00:00.000Z'),
    );
    expect(r).toEqual({ alreadyToday: false, streak: 3 });
  });

  it('null lastCheckinDate → streak 1', () => {
    expect(computeCheckinStreak(null, 0, today)).toEqual({
      alreadyToday: false,
      streak: 1,
    });
  });
});

describe('CheckinService', () => {
  const groupMember = {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const pointTransaction = {
    create: jest.fn(),
  };
  const tx = { groupMember, pointTransaction };
  const prisma = {
    groupMember,
    pointTransaction,
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  let service: CheckinService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );
    service = new CheckinService(prisma as never);
  });

  const memberBase = {
    id: 'm1',
    groupId: 'g1',
    telegramUserId: 'u1',
    username: null as string | null,
    firstName: null as string | null,
    lastName: null as string | null,
    points: 0,
    checkinStreak: 0,
    lastCheckinDate: null as Date | null,
  };

  it('first check-in awards 10 and creates member with profile fields', async () => {
    groupMember.upsert.mockResolvedValue(memberBase);
    groupMember.findUnique.mockResolvedValue(memberBase);
    groupMember.update.mockResolvedValue({ ...memberBase, points: 10, checkinStreak: 1 });
    pointTransaction.create.mockResolvedValue({
      id: 't1',
      amount: 10,
      type: PointTransactionType.CHECKIN,
    });

    const result = await service.checkin({
      groupId: 'g1',
      telegramUserId: 'u1',
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Lee',
      now: new Date('2026-07-22T08:00:00.000Z'),
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.pointsAwarded).toBe(10);
    expect(result.streak).toBe(1);
    expect(groupMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Lee',
        }),
      }),
    );
    expect(pointTransaction.create.mock.calls[0][0].data.referenceId).toBe(
      'checkin:g1:u1:2026-07-22',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('next-day continuous check-in increments streak', async () => {
    const existing = {
      ...memberBase,
      checkinStreak: 6,
      lastCheckinDate: new Date('2026-07-21T00:00:00.000Z'),
      points: 60,
    };
    groupMember.upsert.mockResolvedValue(existing);
    groupMember.findUnique.mockResolvedValue(existing);
    groupMember.update.mockResolvedValue({ ...existing, checkinStreak: 7, points: 75 });
    pointTransaction.create.mockResolvedValue({ id: 't2', amount: 15 });

    const result = await service.checkin({
      groupId: 'g1',
      telegramUserId: 'u1',
      now: new Date('2026-07-22T10:00:00.000Z'),
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.streak).toBe(7);
    expect(result.pointsAwarded).toBe(15);
  });

  it('gap of one UTC day resets streak to 1', async () => {
    const existing = {
      ...memberBase,
      checkinStreak: 10,
      lastCheckinDate: new Date('2026-07-20T00:00:00.000Z'),
    };
    groupMember.upsert.mockResolvedValue(existing);
    groupMember.findUnique.mockResolvedValue(existing);
    groupMember.update.mockResolvedValue({ ...existing, checkinStreak: 1 });
    pointTransaction.create.mockResolvedValue({ id: 't3', amount: 10 });

    const result = await service.checkin({
      groupId: 'g1',
      telegramUserId: 'u1',
      now: new Date('2026-07-22T10:00:00.000Z'),
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.streak).toBe(1);
  });

  it('same-day repeat returns already_checked_in without writing', async () => {
    const existing = {
      ...memberBase,
      checkinStreak: 3,
      lastCheckinDate: new Date('2026-07-22T00:00:00.000Z'),
      points: 12,
    };
    groupMember.upsert.mockResolvedValue(existing);
    groupMember.findUnique.mockResolvedValue(existing);

    const result = await service.checkin({
      groupId: 'g1',
      telegramUserId: 'u1',
      now: new Date('2026-07-22T20:00:00.000Z'),
    });

    expect(result.status).toBe('already_checked_in');
    expect(pointTransaction.create).not.toHaveBeenCalled();
    expect(groupMember.update).not.toHaveBeenCalled();
  });

  it('maps Prisma P2002 to already_checked_in (transaction rolled back by Prisma)', async () => {
    const existing = { ...memberBase, checkinStreak: 1, points: 10 };
    groupMember.upsert.mockResolvedValue(existing);
    groupMember.findUnique
      .mockResolvedValueOnce(existing) // inside tx
      .mockResolvedValueOnce({ ...existing, checkinStreak: 1, points: 10 }); // after P2002
    groupMember.update.mockResolvedValue(existing);
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['groupId', 'referenceId'] },
    });
    pointTransaction.create.mockRejectedValue(p2002);

    const result = await service.checkin({
      groupId: 'g1',
      telegramUserId: 'u1',
      now: new Date('2026-07-22T08:00:00.000Z'),
    });

    expect(isPrismaUniqueViolation(p2002)).toBe(true);
    expect(result.status).toBe('already_checked_in');
    if (result.status !== 'already_checked_in') return;
    expect(result.member.points).toBe(10);
  });

  it('month-boundary continuous Jul 31 → Aug 1', async () => {
    const existing = {
      ...memberBase,
      checkinStreak: 2,
      lastCheckinDate: new Date('2026-07-31T00:00:00.000Z'),
    };
    groupMember.upsert.mockResolvedValue(existing);
    groupMember.findUnique.mockResolvedValue(existing);
    groupMember.update.mockResolvedValue({ ...existing, checkinStreak: 3 });
    pointTransaction.create.mockResolvedValue({ id: 't4', amount: 12 });

    const result = await service.checkin({
      groupId: 'g1',
      telegramUserId: 'u1',
      now: new Date('2026-08-01T01:00:00.000Z'),
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.streak).toBe(3);
    expect(result.pointsAwarded).toBe(12);
  });

  it('year-boundary continuous Dec 31 → Jan 1', async () => {
    const existing = {
      ...memberBase,
      checkinStreak: 1,
      lastCheckinDate: new Date('2025-12-31T00:00:00.000Z'),
    };
    groupMember.upsert.mockResolvedValue(existing);
    groupMember.findUnique.mockResolvedValue(existing);
    groupMember.update.mockResolvedValue({ ...existing, checkinStreak: 2 });
    pointTransaction.create.mockResolvedValue({ id: 't5', amount: 10 });

    const result = await service.checkin({
      groupId: 'g1',
      telegramUserId: 'u1',
      now: new Date('2026-01-01T09:00:00.000Z'),
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.streak).toBe(2);
  });
});
