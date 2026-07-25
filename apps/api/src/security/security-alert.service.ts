import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

const ALERT_USERNAME = '@ji_labs';
const THROTTLE_MS = 5 * 60 * 1000;

@Injectable()
export class SecurityAlertService {
  private readonly logger = new Logger(SecurityAlertService.name);
  private readonly lastSent = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /** Fire-and-forget alert to the platform super-admin Telegram. */
  notify(opts: {
    tenantId?: string;
    reason: string;
    title: string;
    detail: string;
    ip?: string;
  }): void {
    this.send(opts).catch((e) =>
      this.logger.warn(`security alert failed: ${e?.message || e}`),
    );
  }

  private throttleKey(reason: string, ip?: string) {
    return `${reason}|${ip || '-'}`;
  }

  private async send(opts: {
    tenantId?: string;
    reason: string;
    title: string;
    detail: string;
    ip?: string;
  }) {
    const key = this.throttleKey(opts.reason, opts.ip);
    const now = Date.now();
    const prev = this.lastSent.get(key) || 0;
    if (now - prev < THROTTLE_MS) return;
    this.lastSent.set(key, now);

    const superAdmin = await this.prisma.admin.findFirst({
      where: {
        isSuperAdmin: true,
        active: true,
        ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    const chatId =
      superAdmin?.telegramUserId ||
      superAdmin?.telegramUsername ||
      ALERT_USERNAME;

    const bot = await this.prisma.bot.findFirst({
      where: {
        isActive: true,
        status: 'RUNNING',
        ...(superAdmin ? { tenantId: superAdmin.tenantId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!bot) {
      this.logger.warn('no RUNNING bot to send security alert');
      return;
    }

    const text = [
      `🛡 *安全告警*`,
      `*${escapeMd(opts.title)}*`,
      `原因: \`${escapeMd(opts.reason)}\``,
      opts.ip ? `IP: \`${escapeMd(opts.ip)}\`` : null,
      escapeMd(opts.detail),
      `_时间: ${new Date().toISOString()}_`,
    ]
      .filter(Boolean)
      .join('\n');

    await this.telegram.sendMessage(bot as any, chatId, text);
  }
}

function escapeMd(s: string): string {
  return String(s || '').replace(/([_*`\[])/g, '\\$1');
}
