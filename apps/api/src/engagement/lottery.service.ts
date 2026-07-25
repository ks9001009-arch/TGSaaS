import { randomInt } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PointTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS } from '../rbac/permissions';

export type LotteryPrizeInput = {
  id?: string;
  name: string;
  weight: number;
  rewardPoints: number;
  sortOrder: number;
  isActive: boolean;
};

export type UpsertLotteryConfigInput = {
  enabled: boolean;
  costPoints: number;
  winRatePercent: number;
  prizes: LotteryPrizeInput[];
};

export type LotteryDrawResult =
  | { status: 'disabled' }
  | { status: 'no_prizes' }
  | { status: 'insufficient_points'; points: number; costPoints: number }
  | {
      status: 'drawn';
      won: boolean;
      costPoints: number;
      prizeName: string | null;
      rewardPoints: number;
      pointsAfter: number;
    };

/** Pick an index by relative weight. weights must be positive ints. */
export function pickWeightedIndex(weights: number[], roll: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error('weights must sum to > 0');
  let cursor = roll % total;
  for (let i = 0; i < weights.length; i++) {
    cursor -= weights[i];
    if (cursor < 0) return i;
  }
  return weights.length - 1;
}

@Injectable()
export class LotteryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async getConfig(userId: string, groupId: string) {
    await this.assertGroupEdit(userId, groupId, PERMISSIONS.GROUPS_VIEW);
    return this.loadOrEmptyConfig(groupId);
  }

  async upsertConfig(userId: string, groupId: string, input: UpsertLotteryConfigInput) {
    await this.assertGroupEdit(userId, groupId, PERMISSIONS.GROUPS_EDIT);
    this.validateConfigInput(input);

    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');

    return this.prisma.$transaction(async (tx) => {
      const config = await tx.groupLotteryConfig.upsert({
        where: { groupId },
        create: {
          groupId,
          enabled: input.enabled,
          costPoints: input.costPoints,
          winRatePercent: input.winRatePercent,
        },
        update: {
          enabled: input.enabled,
          costPoints: input.costPoints,
          winRatePercent: input.winRatePercent,
        },
      });

      const keepIds = input.prizes.map((p) => p.id).filter(Boolean) as string[];
      await tx.groupLotteryPrize.deleteMany({
        where: {
          configId: config.id,
          ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
        },
      });

      for (const [index, prize] of input.prizes.entries()) {
        const data = {
          name: prize.name.trim(),
          weight: prize.weight,
          rewardPoints: prize.rewardPoints,
          sortOrder: prize.sortOrder ?? index,
          isActive: prize.isActive,
        };
        if (prize.id) {
          const updated = await tx.groupLotteryPrize.updateMany({
            where: { id: prize.id, configId: config.id },
            data,
          });
          if (updated.count === 0) {
            await tx.groupLotteryPrize.create({
              data: { ...data, configId: config.id },
            });
          }
        } else {
          await tx.groupLotteryPrize.create({
            data: { ...data, configId: config.id },
          });
        }
      }

      return tx.groupLotteryConfig.findUniqueOrThrow({
        where: { id: config.id },
        include: { prizes: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      });
    });
  }

  async draw(input: {
    groupId: string;
    telegramUserId: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    /** Injected RNG for tests: returns 0..9999 for win check. */
    winRoll?: number;
    /** Injected RNG for tests: absolute roll for weighted pick. */
    prizeRoll?: number;
  }): Promise<LotteryDrawResult> {
    const config = await this.prisma.groupLotteryConfig.findUnique({
      where: { groupId: input.groupId },
      include: {
        prizes: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!config || !config.enabled) return { status: 'disabled' };
    if (config.prizes.length === 0) return { status: 'no_prizes' };

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.groupMember.upsert({
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
          lastActiveAt: new Date(),
        },
        update: {
          ...(input.username !== undefined ? { username: input.username } : {}),
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          lastActiveAt: new Date(),
        },
      });

      if (member.points < config.costPoints) {
        return {
          status: 'insufficient_points' as const,
          points: member.points,
          costPoints: config.costPoints,
        };
      }

      const afterCost = await tx.groupMember.update({
        where: { id: member.id },
        data: { points: { decrement: config.costPoints } },
      });

      await tx.pointTransaction.create({
        data: {
          groupId: member.groupId,
          groupMemberId: member.id,
          telegramUserId: member.telegramUserId,
          amount: -config.costPoints,
          type: PointTransactionType.LOTTERY,
          reason: 'lottery_draw',
        },
      });

      const winRoll = input.winRoll ?? randomInt(0, 10000);
      const threshold = Math.min(100, Math.max(0, config.winRatePercent)) * 100;
      const won = winRoll < threshold;

      let prizeName: string | null = null;
      let prizeId: string | null = null;
      let rewardPoints = 0;
      let pointsAfter = afterCost.points;

      if (won) {
        const weights = config.prizes.map((p) => Math.max(1, p.weight));
        const prizeRoll = input.prizeRoll ?? randomInt(0, weights.reduce((a, b) => a + b, 0));
        const prize = config.prizes[pickWeightedIndex(weights, prizeRoll)];
        prizeId = prize.id;
        prizeName = prize.name;
        rewardPoints = Math.max(0, prize.rewardPoints);

        if (rewardPoints > 0) {
          const rewarded = await tx.groupMember.update({
            where: { id: member.id },
            data: { points: { increment: rewardPoints } },
          });
          pointsAfter = rewarded.points;
          await tx.pointTransaction.create({
            data: {
              groupId: member.groupId,
              groupMemberId: member.id,
              telegramUserId: member.telegramUserId,
              amount: rewardPoints,
              type: PointTransactionType.REWARD,
              reason: `lottery_prize:${prize.name}`,
            },
          });
        }
      }

      await tx.lotteryDraw.create({
        data: {
          groupId: member.groupId,
          groupMemberId: member.id,
          telegramUserId: member.telegramUserId,
          configId: config.id,
          costPoints: config.costPoints,
          won,
          prizeId,
          prizeName,
          rewardPoints,
        },
      });

      return {
        status: 'drawn' as const,
        won,
        costPoints: config.costPoints,
        prizeName,
        rewardPoints,
        pointsAfter,
      };
    });
  }

  private async loadOrEmptyConfig(groupId: string) {
    const existing = await this.prisma.groupLotteryConfig.findUnique({
      where: { groupId },
      include: { prizes: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (existing) return existing;
    return {
      id: null,
      groupId,
      enabled: false,
      costPoints: 10,
      winRatePercent: 20,
      prizes: [] as Prisma.GroupLotteryPrizeGetPayload<object>[],
      createdAt: null,
      updatedAt: null,
    };
  }

  private validateConfigInput(input: UpsertLotteryConfigInput) {
    if (!Number.isInteger(input.costPoints) || input.costPoints < 1 || input.costPoints > 1_000_000) {
      throw new BadRequestException('costPoints must be an integer between 1 and 1000000');
    }
    if (
      !Number.isInteger(input.winRatePercent) ||
      input.winRatePercent < 0 ||
      input.winRatePercent > 100
    ) {
      throw new BadRequestException('winRatePercent must be an integer between 0 and 100');
    }
    if (!Array.isArray(input.prizes) || input.prizes.length > 50) {
      throw new BadRequestException('prizes must be an array of at most 50 items');
    }
    for (const p of input.prizes) {
      if (!p.name?.trim() || p.name.trim().length > 80) {
        throw new BadRequestException('each prize needs a name (1..80 chars)');
      }
      if (!Number.isInteger(p.weight) || p.weight < 1 || p.weight > 10000) {
        throw new BadRequestException('prize weight must be an integer between 1 and 10000');
      }
      if (!Number.isInteger(p.rewardPoints) || p.rewardPoints < 0 || p.rewardPoints > 1_000_000) {
        throw new BadRequestException('prize rewardPoints must be an integer between 0 and 1000000');
      }
    }
  }

  private async assertGroupEdit(
    userId: string,
    groupId: string,
    perm: (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
  ) {
    const ctx = await this.rbac.context(userId);
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!group) throw new ForbiddenException('Group not found or not in tenant');
    this.rbac.assertGroup(ctx, groupId, perm);
  }
}
