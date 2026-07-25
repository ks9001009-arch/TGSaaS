import { LotteryService, pickWeightedIndex } from './lottery.service';
import { PointTransactionType } from '@prisma/client';

describe('pickWeightedIndex', () => {
  it('picks by cumulative weight', () => {
    const weights = [10, 20, 70];
    expect(pickWeightedIndex(weights, 0)).toBe(0);
    expect(pickWeightedIndex(weights, 9)).toBe(0);
    expect(pickWeightedIndex(weights, 10)).toBe(1);
    expect(pickWeightedIndex(weights, 29)).toBe(1);
    expect(pickWeightedIndex(weights, 30)).toBe(2);
    expect(pickWeightedIndex(weights, 99)).toBe(2);
  });
});

describe('LotteryService.draw', () => {
  const groupMember = {
    upsert: jest.fn(),
    update: jest.fn(),
  };
  const pointTransaction = { create: jest.fn() };
  const lotteryDraw = { create: jest.fn() };
  const groupLotteryConfig = { findUnique: jest.fn() };
  const tx = {
    groupMember,
    pointTransaction,
    lotteryDraw,
  };
  const prisma = {
    groupLotteryConfig,
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const rbac = {
    context: jest.fn(),
    assertGroup: jest.fn(),
  };

  let service: LotteryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LotteryService(prisma as never, rbac as never);
  });

  it('returns disabled when config missing', async () => {
    groupLotteryConfig.findUnique.mockResolvedValue(null);
    await expect(
      service.draw({ groupId: 'g1', telegramUserId: 'u1' }),
    ).resolves.toEqual({ status: 'disabled' });
  });

  it('returns no_prizes when enabled but empty prize pool', async () => {
    groupLotteryConfig.findUnique.mockResolvedValue({
      id: 'c1',
      enabled: true,
      costPoints: 10,
      winRatePercent: 50,
      prizes: [],
    });
    await expect(
      service.draw({ groupId: 'g1', telegramUserId: 'u1' }),
    ).resolves.toEqual({ status: 'no_prizes' });
  });

  it('returns insufficient_points without charging', async () => {
    groupLotteryConfig.findUnique.mockResolvedValue({
      id: 'c1',
      enabled: true,
      costPoints: 20,
      winRatePercent: 50,
      prizes: [{ id: 'p1', name: 'A', weight: 1, rewardPoints: 0 }],
    });
    groupMember.upsert.mockResolvedValue({
      id: 'm1',
      groupId: 'g1',
      telegramUserId: 'u1',
      points: 5,
    });

    await expect(
      service.draw({ groupId: 'g1', telegramUserId: 'u1' }),
    ).resolves.toEqual({
      status: 'insufficient_points',
      points: 5,
      costPoints: 20,
    });
    expect(groupMember.update).not.toHaveBeenCalled();
    expect(pointTransaction.create).not.toHaveBeenCalled();
  });

  it('charges points and returns lose when roll misses', async () => {
    groupLotteryConfig.findUnique.mockResolvedValue({
      id: 'c1',
      enabled: true,
      costPoints: 10,
      winRatePercent: 20,
      prizes: [{ id: 'p1', name: 'A', weight: 1, rewardPoints: 5 }],
    });
    groupMember.upsert.mockResolvedValue({
      id: 'm1',
      groupId: 'g1',
      telegramUserId: 'u1',
      points: 50,
    });
    groupMember.update.mockResolvedValue({
      id: 'm1',
      groupId: 'g1',
      telegramUserId: 'u1',
      points: 40,
    });

    const result = await service.draw({
      groupId: 'g1',
      telegramUserId: 'u1',
      winRoll: 2000, // 20% => threshold 2000, roll < threshold wins; 2000 is lose
    });

    expect(result).toEqual({
      status: 'drawn',
      won: false,
      costPoints: 10,
      prizeName: null,
      rewardPoints: 0,
      pointsAfter: 40,
    });
    expect(pointTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: -10,
        type: PointTransactionType.LOTTERY,
      }),
    });
    expect(lotteryDraw.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ won: false, costPoints: 10 }),
    });
  });

  it('awards prize points on win', async () => {
    groupLotteryConfig.findUnique.mockResolvedValue({
      id: 'c1',
      enabled: true,
      costPoints: 10,
      winRatePercent: 50,
      prizes: [{ id: 'p1', name: '礼包', weight: 100, rewardPoints: 30 }],
    });
    groupMember.upsert.mockResolvedValue({
      id: 'm1',
      groupId: 'g1',
      telegramUserId: 'u1',
      points: 50,
    });
    groupMember.update
      .mockResolvedValueOnce({
        id: 'm1',
        groupId: 'g1',
        telegramUserId: 'u1',
        points: 40,
      })
      .mockResolvedValueOnce({
        id: 'm1',
        groupId: 'g1',
        telegramUserId: 'u1',
        points: 70,
      });

    const result = await service.draw({
      groupId: 'g1',
      telegramUserId: 'u1',
      winRoll: 0,
      prizeRoll: 0,
    });

    expect(result).toEqual({
      status: 'drawn',
      won: true,
      costPoints: 10,
      prizeName: '礼包',
      rewardPoints: 30,
      pointsAfter: 70,
    });
    expect(pointTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 30,
        type: PointTransactionType.REWARD,
      }),
    });
  });
});

describe('LotteryService.validateConfigInput via upsertConfig', () => {
  const prisma = {
    group: { findUnique: jest.fn(), findFirst: jest.fn() },
    groupLotteryConfig: { upsert: jest.fn(), findUniqueOrThrow: jest.fn() },
    groupLotteryPrize: { deleteMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const rbac = {
    context: jest.fn().mockResolvedValue({ tenantId: 't1', isSuper: true, permissions: new Set() }),
    assertGroup: jest.fn(),
  };
  let service: LotteryService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.group.findUnique.mockResolvedValue({ id: 'g1' });
    prisma.group.findFirst.mockResolvedValue({ id: 'g1' });
    service = new LotteryService(prisma as never, rbac as never);
  });

  it('rejects active prize percents that do not sum to 100', async () => {
    await expect(
      service.upsertConfig('u1', 'g1', {
        enabled: true,
        costPoints: 10,
        winRatePercent: 20,
        prizes: [
          { name: 'A', weight: 30, rewardPoints: 0, sortOrder: 0, isActive: true },
          { name: 'B', weight: 30, rewardPoints: 0, sortOrder: 1, isActive: true },
        ],
      }),
    ).rejects.toThrow(/100%/);
  });

  it('accepts active prize percents that sum to 100', async () => {
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        groupLotteryConfig: {
          upsert: jest.fn().mockResolvedValue({ id: 'c1' }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'c1',
            prizes: [],
          }),
        },
        groupLotteryPrize: {
          deleteMany: jest.fn(),
          updateMany: jest.fn(),
          create: jest.fn(),
        },
      }),
    );

    await expect(
      service.upsertConfig('u1', 'g1', {
        enabled: true,
        costPoints: 10,
        winRatePercent: 20,
        prizes: [
          { name: 'A', weight: 70, rewardPoints: 0, sortOrder: 0, isActive: true },
          { name: 'B', weight: 30, rewardPoints: 0, sortOrder: 1, isActive: true },
        ],
      }),
    ).resolves.toBeTruthy();
  });
});
