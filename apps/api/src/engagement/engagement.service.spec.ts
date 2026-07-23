import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PointTransactionType } from '@prisma/client';
import { EngagementService } from './engagement.service';

describe('EngagementService', () => {
  const groupMember = {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const pointTransaction = {
    create: jest.fn(),
    findMany: jest.fn(),
  };
  const dailyMessageStat = {
    upsert: jest.fn(),
  };
  const tx = {
    groupMember,
    pointTransaction,
    dailyMessageStat,
  };
  const prisma = {
    groupMember,
    pointTransaction,
    dailyMessageStat,
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  let service: EngagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );
    service = new EngagementService(prisma as never);
  });

  describe('upsertGroupMember', () => {
    it('creates a member', async () => {
      const created = {
        id: 'm1',
        groupId: 'g1',
        telegramUserId: 'u1',
        username: 'alice',
        firstName: 'Alice',
        lastName: null,
        points: 0,
        level: 1,
      };
      groupMember.upsert.mockResolvedValue(created);

      const result = await service.upsertGroupMember({
        groupId: 'g1',
        telegramUserId: 'u1',
        username: 'alice',
        firstName: 'Alice',
      });

      expect(result).toEqual(created);
      expect(groupMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId_telegramUserId: { groupId: 'g1', telegramUserId: 'u1' } },
          create: expect.objectContaining({
            groupId: 'g1',
            telegramUserId: 'u1',
            username: 'alice',
            firstName: 'Alice',
          }),
        }),
      );
    });

    it('updates profile fields when provided', async () => {
      groupMember.upsert.mockResolvedValue({ id: 'm1' });

      await service.upsertGroupMember({
        groupId: 'g1',
        telegramUserId: 'u1',
        username: 'bob',
        firstName: 'Bob',
        lastName: 'Lee',
        lastActiveAt: new Date('2026-07-22T12:00:00.000Z'),
      });

      const arg = groupMember.upsert.mock.calls[0][0];
      expect(arg.update).toEqual({
        username: 'bob',
        firstName: 'Bob',
        lastName: 'Lee',
        lastActiveAt: new Date('2026-07-22T12:00:00.000Z'),
      });
      expect(arg.update).not.toHaveProperty('joinedAt');
    });

    it('does not overwrite omitted optional fields with null', async () => {
      groupMember.upsert.mockResolvedValue({ id: 'm1' });

      await service.upsertGroupMember({
        groupId: 'g1',
        telegramUserId: 'u1',
        lastActiveAt: new Date('2026-07-22T12:00:00.000Z'),
      });

      const arg = groupMember.upsert.mock.calls[0][0];
      expect(arg.update).toEqual({
        lastActiveAt: new Date('2026-07-22T12:00:00.000Z'),
      });
      expect(arg.update).not.toHaveProperty('username');
      expect(arg.update).not.toHaveProperty('firstName');
      expect(arg.update).not.toHaveProperty('lastName');
      expect(arg.update).not.toHaveProperty('joinedAt');
    });

    it('allows explicit null to clear username', async () => {
      groupMember.upsert.mockResolvedValue({ id: 'm1' });

      await service.upsertGroupMember({
        groupId: 'g1',
        telegramUserId: 'u1',
        username: null,
      });

      expect(groupMember.upsert.mock.calls[0][0].update).toEqual({ username: null });
    });
  });

  describe('getGroupMember', () => {
    it('returns a member when found', async () => {
      const member = { id: 'm1', groupId: 'g1', telegramUserId: 'u1' };
      groupMember.findUnique.mockResolvedValue(member);

      await expect(service.getGroupMember('g1', 'u1')).resolves.toEqual(member);
      expect(groupMember.findUnique).toHaveBeenCalledWith({
        where: { groupId_telegramUserId: { groupId: 'g1', telegramUserId: 'u1' } },
      });
    });

    it('returns null when missing', async () => {
      groupMember.findUnique.mockResolvedValue(null);
      await expect(service.getGroupMember('g1', 'missing')).resolves.toBeNull();
    });
  });

  describe('addPoints', () => {
    const existing = {
      id: 'm1',
      groupId: 'g1',
      telegramUserId: 'u1',
      points: 10,
    };

    it('adds positive points via transaction and atomic increment', async () => {
      groupMember.findUnique.mockResolvedValue(existing);
      groupMember.update.mockResolvedValue({ ...existing, points: 15 });
      pointTransaction.create.mockResolvedValue({
        id: 't1',
        amount: 5,
        type: PointTransactionType.CHECKIN,
      });

      const result = await service.addPoints({
        groupId: 'g1',
        telegramUserId: 'u1',
        amount: 5,
        type: PointTransactionType.CHECKIN,
        reason: 'daily check-in',
        referenceId: 'checkin:g1:u1:2026-07-22',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(groupMember.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { points: { increment: 5 } },
      });
      expect(pointTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          groupId: 'g1',
          groupMemberId: 'm1',
          telegramUserId: 'u1',
          amount: 5,
          type: PointTransactionType.CHECKIN,
          reason: 'daily check-in',
          referenceId: 'checkin:g1:u1:2026-07-22',
        }),
      });
      expect(result.member.points).toBe(15);
      expect(result.transaction.id).toBe('t1');
    });

    it('writes denormalized fields from the loaded member, not caller input', async () => {
      groupMember.findUnique.mockResolvedValue(existing);
      groupMember.update.mockResolvedValue(existing);
      pointTransaction.create.mockResolvedValue({ id: 't-safe', amount: 1 });

      await service.addPoints({
        groupId: 'g1',
        telegramUserId: 'u1',
        amount: 1,
        type: PointTransactionType.ADMIN,
      });

      const data = pointTransaction.create.mock.calls[0][0].data;
      expect(data.groupId).toBe(existing.groupId);
      expect(data.telegramUserId).toBe(existing.telegramUserId);
      expect(data.groupMemberId).toBe(existing.id);
    });

    it('allows negative points', async () => {
      groupMember.findUnique.mockResolvedValue(existing);
      groupMember.update.mockResolvedValue({ ...existing, points: 7 });
      pointTransaction.create.mockResolvedValue({
        id: 't2',
        amount: -3,
        type: PointTransactionType.PENALTY,
      });

      const result = await service.addPoints({
        groupId: 'g1',
        telegramUserId: 'u1',
        amount: -3,
        type: PointTransactionType.PENALTY,
      });

      expect(groupMember.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { points: { increment: -3 } },
      });
      expect(result.member.points).toBe(7);
    });

    it('rejects amount = 0', async () => {
      await expect(
        service.addPoints({
          groupId: 'g1',
          telegramUserId: 'u1',
          amount: 0,
          type: PointTransactionType.ADMIN,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when member does not exist', async () => {
      groupMember.findUnique.mockResolvedValue(null);

      await expect(
        service.addPoints({
          groupId: 'g1',
          telegramUserId: 'missing',
          amount: 1,
          type: PointTransactionType.SYSTEM,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('uses prisma $transaction', async () => {
      groupMember.findUnique.mockResolvedValue(existing);
      groupMember.update.mockResolvedValue(existing);
      pointTransaction.create.mockResolvedValue({ id: 't3', amount: 1 });

      await service.addPoints({
        groupId: 'g1',
        telegramUserId: 'u1',
        amount: 1,
        type: PointTransactionType.REWARD,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof prisma.$transaction.mock.calls[0][0]).toBe('function');
    });

    it('uses atomic points increment (not read-modify-write)', async () => {
      groupMember.findUnique.mockResolvedValue(existing);
      groupMember.update.mockResolvedValue({ ...existing, points: 11 });
      pointTransaction.create.mockResolvedValue({ id: 't4', amount: 1 });

      await service.addPoints({
        groupId: 'g1',
        telegramUserId: 'u1',
        amount: 1,
        type: PointTransactionType.MESSAGE,
      });

      const updateArg = groupMember.update.mock.calls[0][0];
      expect(updateArg.data.points).toEqual({ increment: 1 });
      expect(updateArg.data.points).not.toEqual(11);
    });
  });

  describe('getPointTransactions', () => {
    it('uses stable keyset cursor on createdAt + id', async () => {
      pointTransaction.findMany.mockResolvedValue([]);
      const cursor = {
        createdAt: new Date('2026-07-22T10:00:00.000Z'),
        id: 't100',
      };

      await service.getPointTransactions({
        groupId: 'g1',
        telegramUserId: 'u1',
        limit: 20,
        cursor,
      });

      expect(pointTransaction.findMany).toHaveBeenCalledWith({
        where: {
          groupId: 'g1',
          telegramUserId: 'u1',
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      });
    });
  });

  describe('incrementDailyMessageCount', () => {
    const member = { id: 'm1', groupId: 'g1', telegramUserId: 'u1' };
    const day = new Date('2026-07-22T00:00:00.000Z');

    it('creates a daily row on first message', async () => {
      groupMember.findUnique.mockResolvedValue(member);
      dailyMessageStat.upsert.mockResolvedValue({
        id: 'd1',
        groupId: 'g1',
        telegramUserId: 'u1',
        date: day,
        count: 1,
      });

      const result = await service.incrementDailyMessageCount({
        groupId: 'g1',
        telegramUserId: 'u1',
        date: day,
      });

      expect(result.count).toBe(1);
      expect(dailyMessageStat.upsert).toHaveBeenCalledWith({
        where: {
          groupId_telegramUserId_date: {
            groupId: 'g1',
            telegramUserId: 'u1',
            date: day,
          },
        },
        create: {
          groupId: 'g1',
          groupMemberId: 'm1',
          telegramUserId: 'u1',
          date: day,
          count: 1,
        },
        update: {
          count: { increment: 1 },
        },
      });
    });

    it('atomically increments an existing daily row', async () => {
      groupMember.findUnique.mockResolvedValue(member);
      dailyMessageStat.upsert.mockResolvedValue({
        id: 'd1',
        count: 4,
      });

      const result = await service.incrementDailyMessageCount({
        groupId: 'g1',
        telegramUserId: 'u1',
        date: day,
        increment: 2,
      });

      expect(result.count).toBe(4);
      const arg = dailyMessageStat.upsert.mock.calls[0][0];
      expect(arg.create.count).toBe(2);
      expect(arg.update.count).toEqual({ increment: 2 });
    });

    it('rejects increment <= 0', async () => {
      await expect(
        service.incrementDailyMessageCount({
          groupId: 'g1',
          telegramUserId: 'u1',
          date: day,
          increment: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.incrementDailyMessageCount({
          groupId: 'g1',
          telegramUserId: 'u1',
          date: day,
          increment: -1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(groupMember.findUnique).not.toHaveBeenCalled();
    });

    it('rejects when member does not exist', async () => {
      groupMember.findUnique.mockResolvedValue(null);

      await expect(
        service.incrementDailyMessageCount({
          groupId: 'g1',
          telegramUserId: 'missing',
          date: day,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dailyMessageStat.upsert).not.toHaveBeenCalled();
    });
  });
});
