import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Bot as BotRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { BotBootstrapService } from './bot-bootstrap.service';

/**
 * Owns the runtime lifecycle of every hosted bot (multi-bot SaaS).
 *
 * On boot it ensures the platform .env bot row exists, then starts every
 * active bot in the database. Each bot uses the SAME codebase/handlers, so
 * platform upgrades (new features, bug fixes) apply to all bots automatically.
 *
 * - WEBHOOK_URL (https) set -> all bots use webhooks.
 * - otherwise               -> all bots use long polling (local dev).
 */
@Injectable()
export class BotManagerService implements OnModuleInit {
  private readonly logger = new Logger(BotManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly bootstrap: BotBootstrapService,
  ) {}

  async onModuleInit() {
    try {
      await this.bootstrap.ensureEnvBot();
    } catch (e: any) {
      this.logger.error(`env bot bootstrap failed: ${e.message}`);
    }
    await this.startAll();
  }

  private get webhookBase(): string | null {
    const base = (process.env.WEBHOOK_URL || '').trim();
    return base.startsWith('https://') ? base.replace(/\/$/, '') : null;
  }

  // Start every active bot in the DB.
  async startAll(): Promise<void> {
    const bots = await this.prisma.bot.findMany({ where: { isActive: true } });
    this.logger.log(`Starting ${bots.length} active bot(s)...`);
    for (const bot of bots) {
      await this.startBot(bot).catch((e) =>
        this.logger.error(`start bot ${bot.id} failed: ${e.message}`),
      );
    }
  }

  // Bring a single bot online (webhook or polling) and record its status.
  async startBot(record: BotRecord): Promise<BotRecord> {
    // refresh the cached grammY instance so a new token is picked up
    this.telegram.invalidate(record.id);
    try {
      await this.telegram.setupCommands(record);
      if (this.webhookBase) {
        await this.telegram.setWebhook(record, this.webhookBase);
        this.logger.log(`Bot ${record.id} (@${record.username}) online via WEBHOOK`);
      } else {
        await this.telegram.startPolling(record);
        this.logger.log(`Bot ${record.id} (@${record.username}) online via POLLING`);
      }
      return this.prisma.bot.update({
        where: { id: record.id },
        data: { status: 'RUNNING', isActive: true, lastError: null, lastSeenAt: new Date() },
      });
    } catch (e: any) {
      // most commonly an invalid/revoked token -> mark offline
      this.logger.warn(`Bot ${record.id} failed to start: ${e.message}`);
      return this.prisma.bot.update({
        where: { id: record.id },
        data: { status: 'OFFLINE', lastError: String(e.message).slice(0, 480) },
      });
    }
  }

  // Stop a single bot and mark it stopped.
  async stopBot(botId: string): Promise<BotRecord> {
    const record = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (record) {
      try {
        if (this.webhookBase) await this.telegram.deleteWebhook(record);
      } catch {
        // ignore
      }
    }
    await this.telegram.stopInstance(botId);
    return this.prisma.bot.update({
      where: { id: botId },
      data: { status: 'STOPPED', isActive: false },
    });
  }

  async restartBot(botId: string): Promise<BotRecord> {
    await this.stopBot(botId);
    const record = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!record) throw new Error('bot not found');
    return this.startBot(record);
  }

  // Fully remove a bot from the runtime (used right before deletion).
  async teardownBot(botId: string): Promise<void> {
    const record = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (record) {
      try {
        await this.telegram.deleteWebhook(record);
      } catch {
        // ignore
      }
    }
    await this.telegram.stopInstance(botId);
  }
}
