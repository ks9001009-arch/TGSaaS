import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DailyMessageStat,
  GroupMember,
  PointTransaction,
  PointTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type UpsertGroupMemberInput = {
  groupId: string;
  telegramUserId: string;
  /** Pass undefined to leave unchanged; pass null to clear (e.g. Telegram cleared username). */
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  joinedAt?: Date;
  lastActiveAt?: Date;
};

export type AddPointsInput = {
  groupId: string;
  telegramUserId: string;
  amount: number;
  type: PointTransactionType;
  reason?: string;
  referenceId?: string;
};

/** Stable keyset cursor for point transaction pages (createdAt desc, id desc). */
export type PointTransactionCursor = {
  createdAt: Date;
  id: string;
};

export type GetPointTransactionsInput = {
  groupId: string;
  telegramUserId: string;
  limit?: number;
  cursor?: PointTransactionCursor;
};

export type IncrementDailyMessageCountInput = {
  groupId: string;
  telegramUserId: string;
  /** Normalized business-day marker; caller must normalize before write. */
  date: Date;
  increment?: number;
};

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertGroupMember(input: UpsertGroupMemberInput): Promise<GroupMember> {
    // undefined => omit from update (keep DB value).
    // null => explicitly clear nullable profile fields (Telegram can remove username).
    const update: Prisma.GroupMemberUpdateInput = {};
    if (input.username !== undefined) update.username = input.username;
    if (input.firstName !== undefined) update.firstName = input.firstName;
    if (input.lastName !== undefined) update.lastName = input.lastName;
    if (input.lastActiveAt !== undefined) update.lastActiveAt = input.lastActiveAt;
    // joinedAt is create-only — never overwrite an existing join timestamp.

    return this.prisma.groupMember.upsert({
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
        joinedAt: input.joinedAt,
        lastActiveAt: input.lastActiveAt ?? null,
      },
      update,
    });
  }

  async getGroupMember(groupId: string, telegramUserId: string): Promise<GroupMember | null> {
    return this.prisma.groupMember.findUnique({
      where: {
        groupId_telegramUserId: { groupId, telegramUserId },
      },
    });
  }

  async addPoints(
    input: AddPointsInput,
  ): Promise<{ member: GroupMember; transaction: PointTransaction }> {
    if (input.amount === 0) {
      throw new BadRequestException('amount must not be 0');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.groupMember.findUnique({
        where: {
          groupId_telegramUserId: {
            groupId: input.groupId,
            telegramUserId: input.telegramUserId,
          },
        },
      });
      if (!existing) {
        throw new NotFoundException(
          `Group member not found: groupId=${input.groupId} telegramUserId=${input.telegramUserId}`,
        );
      }

      const member = await tx.groupMember.update({
        where: { id: existing.id },
        data: { points: { increment: input.amount } },
      });

      // Denormalized fields always come from the loaded member row, never from
      // caller input, so groupId/telegramUserId cannot drift from groupMemberId.
      const transaction = await tx.pointTransaction.create({
        data: {
          groupId: existing.groupId,
          groupMemberId: existing.id,
          telegramUserId: existing.telegramUserId,
          amount: input.amount,
          type: input.type,
          reason: input.reason,
          referenceId: input.referenceId,
        },
      });

      return { member, transaction };
    });
  }

  async getPointTransactions(input: GetPointTransactionsInput): Promise<PointTransaction[]> {
    const take = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const cursor = input.cursor;

    return this.prisma.pointTransaction.findMany({
      where: {
        groupId: input.groupId,
        telegramUserId: input.telegramUserId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  async incrementDailyMessageCount(
    input: IncrementDailyMessageCountInput,
  ): Promise<DailyMessageStat> {
    const increment = input.increment ?? 1;
    if (increment <= 0) {
      throw new BadRequestException('increment must be greater than 0');
    }

    const member = await this.prisma.groupMember.findUnique({
      where: {
        groupId_telegramUserId: {
          groupId: input.groupId,
          telegramUserId: input.telegramUserId,
        },
      },
    });
    if (!member) {
      throw new NotFoundException(
        `Group member not found: groupId=${input.groupId} telegramUserId=${input.telegramUserId}`,
      );
    }

    return this.prisma.dailyMessageStat.upsert({
      where: {
        groupId_telegramUserId_date: {
          groupId: member.groupId,
          telegramUserId: member.telegramUserId,
          date: input.date,
        },
      },
      create: {
        groupId: member.groupId,
        groupMemberId: member.id,
        telegramUserId: member.telegramUserId,
        date: input.date,
        count: increment,
      },
      update: {
        count: { increment },
      },
    });
  }
}
