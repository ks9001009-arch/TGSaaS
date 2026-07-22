import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {
    this.logger.log('[memberCount] SchedulerService constructed');
  }

  onModuleInit() {
    this.logger.log('[memberCount] SchedulerService onModuleInit');
  }

  // Compute the next run time for a post given its schedule.
  computeNextRun(post: {
    scheduleType: string;
    intervalMinutes: number;
    dailyTime?: string | null;
  }, from = new Date()): Date {
    if (post.scheduleType === 'INTERVAL') {
      const mins = Math.max(1, post.intervalMinutes || 0);
      return new Date(from.getTime() + mins * 60 * 1000);
    }
    // DAILY at HH:mm (UTC)
    const [hh, mm] = (post.dailyTime || '09:00').split(':').map((n) => parseInt(n, 10));
    const next = new Date(from);
    next.setUTCHours(hh || 0, mm || 0, 0, 0);
    if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  // Runs every minute; sends any due posts.
  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    const now = new Date();
    const due = await this.prisma.scheduledPost.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      take: 50,
    });
    if (!due.length) return;

    for (const post of due) {
      try {
        const bot = await this.prisma.bot.findUnique({ where: { id: post.botId } });
        if (!bot || !bot.isActive || bot.status !== 'RUNNING') continue;
        // skip groups the bot has left
        const group = await this.prisma.group.findFirst({
          where: { botId: post.botId, telegramChatId: post.targetChatId },
          select: { status: true },
        });
        if (group && group.status === 'LEFT') continue;
        await this.telegram.sendMessage(bot, post.targetChatId, post.text);
        this.logger.log(`Sent scheduled post ${post.id} -> ${post.targetChatId}`);
      } catch (e: any) {
        this.logger.warn(`scheduled post ${post.id} failed: ${e.message}`);
      } finally {
        const nextRunAt = this.computeNextRun(post, now);
        await this.prisma.scheduledPost.update({
          where: { id: post.id },
          data: { lastSentAt: now, nextRunAt },
        });
      }
    }
  }

  // Runs every minute; delivers SCHEDULED ads to their authorized groups only.
  @Cron(CronExpression.EVERY_MINUTE)
  async tickAds() {
    const now = new Date();
    const ads = await this.prisma.ad.findMany({
      where: {
        enabled: true,
        intervalMinutes: { gt: 0 },
        placements: { has: 'SCHEDULED' },
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      include: { group: { include: { bot: true } }, bot: true },
      take: 50,
    });

    for (const ad of ads) {
      const due =
        !ad.lastSentAt || ad.lastSentAt.getTime() + ad.intervalMinutes * 60 * 1000 <= now.getTime();
      if (!due) continue;

      // Compliance: only send to the assigned group, or to the assigned bot's active groups.
      const targets: { bot: any; chatId: string; groupId: string }[] = [];
      if (ad.group && ad.group.bot && ad.group.status === 'ACTIVE' && ad.group.isActive) {
        targets.push({ bot: ad.group.bot, chatId: ad.group.telegramChatId, groupId: ad.group.id });
      } else if (!ad.groupId && ad.bot && ad.botId) {
        const groups = await this.prisma.group.findMany({
          where: { botId: ad.botId, status: 'ACTIVE', isActive: true },
          select: { id: true, telegramChatId: true },
        });
        for (const g of groups) {
          targets.push({ bot: ad.bot, chatId: g.telegramChatId, groupId: g.id });
        }
      }

      for (const tgt of targets) {
        try {
          if (!tgt.bot.isActive || tgt.bot.status !== 'RUNNING') continue;
          await this.telegram.sendAdToChat(tgt.bot, tgt.chatId, ad.id, tgt.groupId);
        } catch (e: any) {
          this.logger.warn(`scheduled ad ${ad.id} -> ${tgt.chatId} failed: ${e.message}`);
        }
      }
      await this.prisma.ad.update({ where: { id: ad.id }, data: { lastSentAt: now } });
    }
  }

  // Refresh Group.memberCount from Telegram for every ACTIVE group.
  // Failures keep the previous DB value (handled inside syncMemberCount).
  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncMemberCounts() {
    this.logger.log('[memberCount] cron started');
    const groups = await this.prisma.group.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, botId: true, telegramChatId: true },
    });
    if (!groups.length) return;
    this.logger.log(`[memberCount] cron sync starting for ${groups.length} ACTIVE group(s)`);
    for (const g of groups) {
      this.logger.log('[memberCount] syncing group=' + g.id);
      await this.telegram.syncMemberCount(g.botId, g.id, g.telegramChatId);
    }
  }
}
