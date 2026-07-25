import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { BotManagerService } from '../telegram/bot-manager.service';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateBotDto, UpdateBotHomeDto, ChangeTokenDto } from './dto';

@Injectable()
export class BotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly manager: BotManagerService,
    private readonly rbac: RbacService,
  ) {}

  /** Never return bot token / webhookSecret to the dashboard. */
  private sanitizeBot<T extends { token?: string | null; webhookSecret?: string | null }>(bot: T) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token, webhookSecret, ...safe } = bot as any;
    return { ...safe, token: undefined, webhookSecret: undefined, hasToken: Boolean(token) };
  }

  // Bots the current admin can access (super => all tenant bots; sub => assigned).
  async list(userId: string) {
    const ctx = await this.rbac.context(userId);
    const bots = await this.prisma.bot.findMany({
      where: { id: { in: ctx.botIds }, tenantId: ctx.tenantId },
      include: { _count: { select: { groups: true, adminBots: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return bots.map((b) => ({
      ...this.sanitizeBot(b),
      permissions: ctx.isSuper ? ['*'] : Array.from(ctx.permissions),
    }));
  }

  async get(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    if (!ctx.botIds.includes(id)) throw new NotFoundException('Bot not found');
    const bot = await this.prisma.bot.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!bot) throw new NotFoundException('Bot not found');
    return this.sanitizeBot(bot);
  }

  async create(userId: string, dto: CreateBotDto) {
    const ctx = await this.rbac.context(userId);
    // super admin or an admin explicitly granted the "create bot" permission
    if (!this.rbac.has(ctx, PERMISSIONS.BOTS_CREATE)) {
      throw new ForbiddenException('没有创建机器人的权限');
    }

    let identity;
    try {
      identity = await this.telegram.fetchIdentity(dto.token);
    } catch {
      throw new BadRequestException('无效的 Bot Token，请检查 BotFather 提供的 token');
    }

    const existing = await this.prisma.bot.findUnique({ where: { telegramBotId: identity.id } });
    if (existing) throw new BadRequestException('该机器人已被添加');

    const bot = await this.prisma.bot.create({
      data: {
        tenantId: ctx.tenantId,
        ownerAdminId: ctx.adminId,
        token: dto.token,
        name: dto.name || identity.name,
        telegramBotId: identity.id,
        username: identity.username,
        status: 'STOPPED',
      },
    });

    // a non-super creator must be bound to the new bot to keep managing it
    if (!ctx.isSuper) {
      await this.prisma.adminBot.create({
        data: { tenantId: ctx.tenantId, adminId: ctx.adminId, botId: bot.id },
      });
    }

    // automated: register commands + bring the bot online (webhook or polling)
    await this.manager.startBot(bot);
    const created = await this.prisma.bot.findUnique({ where: { id: bot.id } });
    return this.sanitizeBot(created!);
  }

  async updateHome(userId: string, id: string, dto: UpdateBotHomeDto) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertBot(ctx, id, PERMISSIONS.BOT_EDIT);
    const updated = await this.prisma.bot.update({
      where: { id },
      data: {
        name: dto.name,
        welcomeHomeText: dto.welcomeHomeText,
        homeMediaType: dto.homeMediaType as any,
        homeMediaUrl: dto.homeMediaUrl,
        defaultLocale: dto.defaultLocale,
      },
    });
    return this.sanitizeBot(updated);
  }

  async changeToken(userId: string, id: string, dto: ChangeTokenDto) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertBot(ctx, id, PERMISSIONS.BOT_TOKEN);

    let identity;
    try {
      identity = await this.telegram.fetchIdentity(dto.token);
    } catch {
      throw new BadRequestException('无效的 Bot Token');
    }
    const bot = await this.prisma.bot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');
    if (bot.telegramBotId && bot.telegramBotId !== identity.id) {
      throw new BadRequestException('该 Token 属于另一个机器人，无法更换');
    }
    await this.prisma.bot.update({
      where: { id },
      data: { token: dto.token, username: identity.username, telegramBotId: identity.id },
    });
    await this.manager.restartBot(id);
    const updated = await this.prisma.bot.findUnique({ where: { id } });
    return this.sanitizeBot(updated!);
  }

  async setWebhook(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertBot(ctx, id, PERMISSIONS.BOT_START);
    const bot = await this.prisma.bot.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!bot) throw new NotFoundException('Bot not found');
    const url = await this.telegram.setWebhook(bot);
    return { url };
  }

  async start(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertBot(ctx, id, PERMISSIONS.BOT_START);
    const bot = await this.prisma.bot.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!bot) throw new NotFoundException('Bot not found');
    return this.manager.startBot(bot);
  }

  async stop(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertBot(ctx, id, PERMISSIONS.BOT_STOP);
    return this.manager.stopBot(id);
  }

  // restart = stop + start, so require both lifecycle permissions
  async restart(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertBot(ctx, id, PERMISSIONS.BOT_STOP);
    this.rbac.assertBot(ctx, id, PERMISSIONS.BOT_START);
    return this.manager.restartBot(id);
  }

  // Recent activity for a bot: status + aggregated admin logs across its groups.
  async logs(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertBot(ctx, id, PERMISSIONS.LOGS_VIEW);
    const bot = await this.prisma.bot.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true, username: true, status: true, lastError: true, lastSeenAt: true, isActive: true },
    });
    if (!bot) throw new NotFoundException('Bot not found');
    const logs = await this.prisma.adminLog.findMany({
      where: { tenantId: ctx.tenantId, group: { botId: id } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { group: { select: { title: true, telegramChatId: true } } },
    });
    return { bot, logs };
  }

  async remove(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertBot(ctx, id, PERMISSIONS.BOTS_DELETE);
    const bot = await this.prisma.bot.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!bot) throw new NotFoundException('Bot not found');
    await this.manager.teardownBot(id);
    await this.prisma.bot.delete({ where: { id } });
    return { ok: true };
  }
}
