import { Injectable, Logger } from '@nestjs/common';
import { Bot, InlineKeyboard, Keyboard, Context } from 'grammy';
import type { Bot as BotRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { renderText, buildKeyboard } from './render.util';
import { makeMathChallenge, makeCaptchaChallenge, makeButtonChallenge } from './verification.util';
import { matchKeyword, looksLikeAd, looksLikeLink } from './moderation.util';
import { t, normalizeLocale, Locale } from '../i18n/locales';
import { CollectionService } from '../collection/collection.service';
import { EngagementService } from '../engagement/engagement.service';
import { CheckinService } from '../engagement/checkin.service';
import { ProfileService } from '../engagement/profile.service';
import { LeaderboardService } from '../engagement/leaderboard.service';
import {
  ENGAGEMENT_CHECKIN_COMMAND_RE,
  ENGAGEMENT_PROFILE_COMMAND_RE,
  ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE,
  ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE,
  isEngagementCommandText,
} from '../engagement/engagement-commands.util';
import { recordGroupMessageActivity } from './message-activity';
import { isCountableGroupUserMessage } from './message-activity.util';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly instances = new Map<string, Bot>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly collection: CollectionService,
    private readonly engagement: EngagementService,
    private readonly checkin: CheckinService,
    private readonly profile: ProfileService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  // ---------- per-user locale (private chat) ----------

  private async getUserLocale(botId: string, userId?: number): Promise<Locale> {
    if (!userId) return 'zh';
    try {
      const v = await this.redis.client.get(`loc:${botId}:${userId}`);
      return normalizeLocale(v);
    } catch {
      return 'zh';
    }
  }

  private async setUserLocale(botId: string, userId: number, locale: Locale) {
    try {
      await this.redis.client.set(`loc:${botId}:${userId}`, locale);
    } catch {
      // ignore
    }
  }

  // Register the chat-input command menu (bottom menu) for a bot.
  async setupCommands(record: BotRecord): Promise<void> {
    const bot = await this.getInstance(record);
    const zh = [
      { command: 'start', description: '开始' },
      { command: 'help', description: '帮助' },
      { command: 'id', description: '查看ID' },
      { command: 'getid', description: '查询用户ID' },
    ];
    const en = [
      { command: 'start', description: 'Start' },
      { command: 'help', description: 'Help' },
      { command: 'id', description: 'Show ID' },
      { command: 'getid', description: 'Look up user ID' },
    ];
    try {
      await bot.api.setMyCommands(zh);
      await bot.api.setMyCommands(en, { language_code: 'en' });
    } catch (e: any) {
      this.logger.warn(`setMyCommands failed: ${e.message}`);
    }
  }

  // Generic send used by the scheduler for timed posts.
  async sendMessage(record: BotRecord, chatId: string, text: string): Promise<void> {
    const bot = await this.getInstance(record);
    await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  // Make the bot leave a chat (best-effort; used when deleting a group).
  async leaveChat(record: BotRecord, chatId: string | number): Promise<void> {
    const bot = await this.getInstance(record);
    await bot.api.leaveChat(Number(chatId));
  }

  // ---------- bot instance lifecycle ----------

  async getInstance(record: BotRecord): Promise<Bot> {
    const cached = this.instances.get(record.id);
    if (cached) return cached;

    const bot = new Bot(record.token);
    this.installLeaveDetection(bot, record.id);
    this.registerHandlers(bot, record.id);
    await bot.init();
    this.instances.set(record.id, bot);
    return bot;
  }

  // Reactive membership sync: any Telegram API call that fails because the bot
  // is no longer in the target chat (kicked / left / chat deleted / chat not
  // found) flips that group to LEFT, which immediately pauses all its tasks
  // (loadGroup returns null for LEFT/inactive groups).
  private installLeaveDetection(bot: Bot, botId: string) {
    bot.api.config.use(async (prev, method, payload, signal) => {
      try {
        return await prev(method, payload, signal);
      } catch (err) {
        const chatId = (payload as any)?.chat_id;
        if (chatId != null && this.isBotRemovedError(err)) {
          void this.markGroupLeft(botId, String(chatId), this.describeErr(err));
        }
        throw err;
      }
    });
  }

  private describeErr(err: any): string {
    return String(err?.description || err?.message || 'unknown').slice(0, 200);
  }

  // True only for definitive "bot is not in this chat" / "chat is gone" errors.
  private isBotRemovedError(err: any): boolean {
    const code = err?.error_code;
    if (code !== 400 && code !== 403) return false;
    const desc = String(err?.description || err?.message || '').toLowerCase();
    if (!desc) return false;
    return (
      desc.includes('bot was kicked') ||
      desc.includes('bot is not a member') ||
      desc.includes('chat not found') ||
      desc.includes('group chat was deleted') ||
      desc.includes('the chat was deleted') ||
      desc.includes('user is deactivated and chat')
    );
  }

  // Flip a group to LEFT (idempotent). Config rows are preserved so a later
  // re-join simply re-reads them — no need to recreate the group.
  async markGroupLeft(botId: string, chatId: string, reason: string): Promise<void> {
    try {
      const group = await this.prisma.group.findUnique({
        where: { botId_telegramChatId: { botId, telegramChatId: chatId } },
        select: { id: true, status: true },
      });
      if (!group || group.status === 'LEFT') return;
      await this.prisma.group.update({
        where: { id: group.id },
        data: { status: 'LEFT', isActive: false, leftAt: new Date() },
      });
      this.logger.warn(
        `Bot ${botId} no longer in chat ${chatId} (${reason}) -> group ${group.id} marked LEFT; tasks paused`,
      );
    } catch (e: any) {
      this.logger.error(`markGroupLeft failed for ${botId}/${chatId}: ${e.message}`);
    }
  }

  invalidate(botId: string) {
    this.instances.delete(botId);
  }

  // Stop a running (polling) instance and drop it from the cache.
  async stopInstance(botId: string): Promise<void> {
    const bot = this.instances.get(botId);
    if (!bot) return;
    try {
      await bot.stop();
    } catch {
      // ignore (may not have been polling)
    }
    this.instances.delete(botId);
  }

  async fetchIdentity(token: string): Promise<{ id: string; username?: string; name: string }> {
    const probe = new Bot(token);
    await probe.init();
    const me = probe.botInfo;
    return { id: String(me.id), username: me.username, name: me.first_name };
  }

  async setWebhook(record: BotRecord, baseOverride?: string): Promise<string> {
    const bot = await this.getInstance(record);
    const base = (baseOverride || process.env.WEBHOOK_URL || process.env.PUBLIC_URL || 'http://localhost')
      .trim()
      .replace(/\/$/, '');
    const url = `${base}/webhook/${record.id}`;
    await bot.api.setWebhook(url, {
      secret_token: record.webhookSecret,
      allowed_updates: [
        'message',
        'callback_query',
        'my_chat_member',
        'chat_member',
      ],
    });
    this.logger.log(`Webhook set for bot ${record.id} -> ${url}`);
    return url;
  }

  async deleteWebhook(record: BotRecord): Promise<void> {
    const bot = await this.getInstance(record);
    await bot.api.deleteWebhook();
  }

  // Long-polling mode for local dev (no public HTTPS endpoint required).
  // Runs in the background; the returned promise is intentionally not awaited.
  async startPolling(record: BotRecord): Promise<void> {
    const bot = await this.getInstance(record);
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: false });
    } catch {
      // ignore
    }
    void bot
      .start({
        allowed_updates: ['message', 'callback_query', 'my_chat_member', 'chat_member'],
        onStart: (info) => this.logger.log(`Long polling started for @${info.username}`),
      })
      .catch((e: any) => this.logger.error(`polling error: ${e.message}`));
  }

  async handleUpdate(record: BotRecord, update: any): Promise<void> {
    const bot = await this.getInstance(record);
    await bot.handleUpdate(update);
  }

  // ---------- handler registration ----------

  private registerHandlers(bot: Bot, botId: string) {
    bot.command('start', (ctx) => this.onStart(ctx, botId));
    bot.command('help', (ctx) => this.onHelp(ctx, botId));
    bot.command('id', (ctx) => this.onId(ctx, botId));
    bot.command('getid', (ctx) => this.onGetId(ctx, botId));
    // Chinese engagement commands (not valid Bot API command names for setMyCommands).
    bot.hears(ENGAGEMENT_CHECKIN_COMMAND_RE, (ctx) => this.onCheckin(ctx, botId));
    bot.hears(ENGAGEMENT_PROFILE_COMMAND_RE, (ctx) => this.onMyProfile(ctx, botId));
    bot.hears(ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE, (ctx) =>
      this.onPointsLeaderboard(ctx, botId),
    );
    bot.hears(ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE, (ctx) =>
      this.onMessageLeaderboard(ctx, botId),
    );

    bot.on('my_chat_member', (ctx) => this.onMyChatMember(ctx, botId));
    bot.on('message:new_chat_members', (ctx) => this.onNewMembers(ctx, botId));
    // Fallback join detection: supergroups often deliver only chat_member
    // updates (no new_chat_members service message), e.g. when the member
    // list is hidden. Redis dedupe in handleMemberJoined prevents double runs.
    bot.on('chat_member', (ctx) => this.onChatMember(ctx, botId));
    // user picked via the "share a friend" button (Bot API 7.0+: users_shared)
    bot.on('message:users_shared', (ctx) => this.onUsersShared(ctx, botId));
    bot.on('callback_query:data', (ctx) => this.onCallback(ctx, botId));
    bot.on('message:text', (ctx) => this.onMessage(ctx, botId));
    bot.on('message:photo', (ctx) => this.onPhoto(ctx, botId));
    // Non-text user content (photos handled above). Counted after basic checks;
    // these types are not run through text moderation today.
    bot.on(
      [
        'message:video',
        'message:animation',
        'message:document',
        'message:voice',
        'message:video_note',
        'message:audio',
        'message:sticker',
      ],
      (ctx) => this.onMediaMessage(ctx, botId),
    );

    bot.catch((err) => this.logger.error(`grammY error: ${err.message}`));
  }

  // ---------- private-chat bot home ----------

  private buildHomeMenu(locale: Locale): InlineKeyboard {
    // Simplified home: only 我的群组 / 联系客服 / Language
    return new InlineKeyboard()
      .text(t(locale, 'btn_my_groups'), 'my_groups').row()
      .text(t(locale, 'btn_support'), 'support').row()
      .text(t(locale, 'btn_language'), 'language');
  }

  private async onStart(ctx: Context, botId: string) {
    if (ctx.chat?.type !== 'private') return;
    const payload = (typeof (ctx as any).match === 'string' ? (ctx as any).match : '').trim();
    if (payload.startsWith('ad_')) {
      await this.handleAdStart(ctx, botId, payload);
      return;
    }
    if (payload.startsWith('tb_')) {
      await this.handleTemplateButtonStart(ctx, botId, payload);
      return;
    }
    const locale = await this.getUserLocale(botId, ctx.from?.id);
    const record = await this.prisma.bot.findUnique({ where: { id: botId } });
    const text = record?.welcomeHomeText || t(locale, 'home_title');
    const kb = await this.appendAdsToKeyboard(this.buildHomeMenu(locale), botId, null, 'PRIVATE_MENU');
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
  }

  private async onHelp(ctx: Context, botId: string) {
    const locale = await this.getUserLocale(botId, ctx.from?.id);
    await ctx.reply(t(locale, 'help'));
  }

  private async onId(ctx: Context, botId: string) {
    const locale = await this.getUserLocale(botId, ctx.from?.id);
    await ctx.reply(
      t(locale, 'id_info', { uid: String(ctx.from?.id), cid: String(ctx.chat?.id) }),
      { parse_mode: 'Markdown' },
    );
  }

  // ---------- look up a user's ID by sharing a contact ----------

  private async onGetId(ctx: Context, botId: string) {
    if (ctx.chat?.type !== 'private') return;
    const locale = await this.getUserLocale(botId, ctx.from?.id);
    // request_users keyboard button opens Telegram's friend picker
    const kb = new Keyboard()
      .requestUsers(t(locale, 'getid_button'), 1, { max_quantity: 1 })
      .resized()
      .oneTime();
    await ctx.reply(t(locale, 'getid_prompt'), { reply_markup: kb });
  }

  // ---------- group engagement: 签到 / 我的 / 积分榜 / 消息榜（斜杠可选） ----------

  private isGroupChat(ctx: Context): boolean {
    const type = ctx.chat?.type;
    return type === 'group' || type === 'supergroup';
  }

  private formatLeaderboardMessage(
    title: string,
    unit: string,
    result: { entries: Array<{ rank: number; displayName: string; value: number }>; currentUser: { rank: number; value: number } | null },
  ): string {
    const lines = [title];
    if (!result.entries.length) {
      lines.push('暂无上榜数据。');
    } else {
      for (const e of result.entries) {
        lines.push(`${e.rank}. ${e.displayName} — ${e.value}${unit}`);
      }
    }
    if (result.currentUser) {
      lines.push(`你的排名：第 ${result.currentUser.rank} 名（${result.currentUser.value}${unit}）`);
    } else {
      lines.push('你的排名：未上榜');
    }
    return lines.join('\n');
  }

  private async onCheckin(ctx: Context, botId: string) {
    // group / supergroup only; private & channel ignored (same as other group tools).
    if (!this.isGroupChat(ctx) || !ctx.from?.id) return;
    const group = await this.loadGroup(botId, String(ctx.chat!.id));
    if (!group) {
      await ctx.reply('本群未启用或机器人未处于运行状态。');
      return;
    }

    try {
      const result = await this.checkin.checkin({
        groupId: group.id,
        telegramUserId: String(ctx.from.id),
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        lastName: ctx.from.last_name ?? null,
      });

      if (result.status === 'already_checked_in') {
        await ctx.reply(
          `今日已签到过啦。\n连续签到：${result.streak} 天\n当前积分：${result.member.points}`,
        );
        return;
      }

      const bonusLine =
        result.bonusPoints > 0
          ? `\n连续 ${result.streak} 天奖励：+${result.bonusPoints}`
          : '';
      await ctx.reply(
        `签到成功！\n基础积分：+${result.basePoints}${bonusLine}\n本次获得：+${result.pointsAwarded}\n连续签到：${result.streak} 天\n当前积分：${result.member.points}`,
      );
    } catch (e: any) {
      this.logger.warn(`checkin failed: ${e.message}`);
      await ctx.reply('签到失败，请稍后再试。');
    }
  }

  private async onMyProfile(ctx: Context, botId: string) {
    if (!this.isGroupChat(ctx) || !ctx.from?.id) return;
    const group = await this.loadGroup(botId, String(ctx.chat!.id));
    if (!group) {
      await ctx.reply('本群未启用或机器人未处于运行状态。');
      return;
    }

    try {
      const summary = await this.profile.getOrCreateProfileSummary({
        groupId: group.id,
        telegramUserId: String(ctx.from.id),
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        lastName: ctx.from.last_name ?? null,
      });

      await ctx.reply(
        [
          '我的互动档案',
          `用户：${summary.displayName}`,
          `等级：${summary.level}`,
          `积分：${summary.points}`,
          `连续签到：${summary.checkinStreak} 天`,
          `今日消息：${summary.todayMessages}`,
          `本月消息：${summary.monthMessages}`,
        ].join('\n'),
      );
    } catch (e: any) {
      this.logger.warn(`profile failed: ${e.message}`);
      await ctx.reply('查询失败，请稍后再试。');
    }
  }

  private async onPointsLeaderboard(ctx: Context, botId: string) {
    if (!this.isGroupChat(ctx) || !ctx.from?.id) return;
    const group = await this.loadGroup(botId, String(ctx.chat!.id));
    if (!group) {
      await ctx.reply('本群未启用或机器人未处于运行状态。');
      return;
    }

    try {
      const result = await this.leaderboard.getPointsLeaderboard(
        group.id,
        String(ctx.from.id),
        10,
      );
      await ctx.reply(this.formatLeaderboardMessage('积分榜 TOP10', ' 分', result));
    } catch (e: any) {
      this.logger.warn(`points leaderboard failed: ${e.message}`);
      await ctx.reply('排行榜查询失败，请稍后再试。');
    }
  }

  private async onMessageLeaderboard(ctx: Context, botId: string) {
    if (!this.isGroupChat(ctx) || !ctx.from?.id) return;
    const group = await this.loadGroup(botId, String(ctx.chat!.id));
    if (!group) {
      await ctx.reply('本群未启用或机器人未处于运行状态。');
      return;
    }

    try {
      const result = await this.leaderboard.getMonthlyMessageLeaderboard(
        group.id,
        String(ctx.from.id),
        new Date(),
        10,
      );
      await ctx.reply(this.formatLeaderboardMessage('本月消息榜 TOP10', ' 条', result));
    } catch (e: any) {
      this.logger.warn(`message leaderboard failed: ${e.message}`);
      await ctx.reply('排行榜查询失败，请稍后再试。');
    }
  }

  private async onUsersShared(ctx: Context, botId: string) {
    const locale = await this.getUserLocale(botId, ctx.from?.id);
    const shared: any = (ctx.message as any)?.users_shared;
    const users: any[] = shared?.users || shared?.user_ids?.map((id: number) => ({ user_id: id })) || [];
    if (!users.length) return;
    const ids = users.map((u) => u.user_id).join(', ');
    await ctx.reply(t(locale, 'getid_result', { uid: ids }), {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true },
    });
  }

  // Edit the current message in place when triggered from a button; otherwise reply.
  private async editOrReply(ctx: Context, text: string, kb: InlineKeyboard) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
    }
  }

  // "我的群组" -> only works if the Telegram user is bound to a backend account
  // that actually has management rights (platform admin / owns a bot / group admin).
  private async handleMyGroups(ctx: Context, locale: Locale) {
    const tgId = ctx.from?.id ? String(ctx.from.id) : null;
    if (!tgId) return;

    const admin = await this.prisma.admin.findUnique({
      where: { telegramUserId: tgId },
      include: { _count: { select: { adminBots: true, adminGroups: true } } },
    });

    const hasAccess =
      !!admin && admin.active && (admin.isSuperAdmin || admin._count.adminBots > 0 || admin._count.adminGroups > 0);

    if (!hasAccess) {
      await ctx.reply(t(locale, 'no_dashboard'));
      return;
    }

    // list groups this admin can manage within their tenant
    const groups = admin!.isSuperAdmin
      ? await this.prisma.group.findMany({
          where: { tenantId: admin!.tenantId },
          select: { title: true, memberCount: true },
          take: 30,
        })
      : await this.prisma.group.findMany({
          where: {
            tenantId: admin!.tenantId,
            OR: [
              { adminGroups: { some: { adminId: admin!.id } } },
              { bot: { adminBots: { some: { adminId: admin!.id } } } },
            ],
          },
          select: { title: true, memberCount: true },
          take: 30,
        });

    const base = (process.env.PUBLIC_URL || 'http://localhost').replace(/\/$/, '');
    const lines = groups.length
      ? groups.map((g) => `• ${g.title} (${g.memberCount})`).join('\n')
      : t(locale, 'no_groups');

    const kb = /^https?:\/\//.test(base)
      ? new InlineKeyboard().url(t(locale, 'open_dashboard'), `${base}/dashboard`)
      : undefined;

    await ctx.reply(t(locale, 'my_groups_header', { list: lines }), {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  }

  // ---------- group membership ----------

  // Bot added/removed from a chat -> register/deactivate the Group.
  private async onMyChatMember(ctx: Context, botId: string) {
    const upd = ctx.myChatMember;
    if (!upd || !ctx.chat) return;
    const status = upd.new_chat_member.status;
    const oldStatus = upd.old_chat_member.status;
    const chat = ctx.chat;
    if (chat.type === 'private') return;

    // membership vs. operability:
    //  - inGroup: bot is still a participant (member/administrator/restricted)
    //  - operational: bot can actually run moderation tasks (needs admin rights)
    const inGroup = status === 'member' || status === 'administrator' || status === 'restricted';
    const operational = status === 'administrator';
    const wasInGroup = oldStatus === 'member' || oldStatus === 'administrator' || oldStatus === 'restricted';
    const justAdded = inGroup && !wasInGroup;
    const justLeft = !inGroup && wasInGroup;
    const lostAdmin = inGroup && oldStatus === 'administrator' && status !== 'administrator';
    const type = chat.type === 'channel' ? 'CHANNEL' : chat.type === 'group' ? 'GROUP' : 'SUPERGROUP';

    // every group belongs to the bot's tenant (hard isolation)
    const botRow = await this.prisma.bot.findUnique({ where: { id: botId }, select: { tenantId: true } });
    if (!botRow) return;

    // status: ACTIVE while in the group, LEFT once removed/kicked/left.
    // isActive: only when the bot is an admin (otherwise tasks stay paused).
    const groupStatus = inGroup ? 'ACTIVE' : 'LEFT';

    const groupRow = await this.prisma.group.upsert({
      where: { botId_telegramChatId: { botId, telegramChatId: String(chat.id) } },
      create: {
        tenantId: botRow.tenantId,
        botId,
        telegramChatId: String(chat.id),
        title: (chat as any).title || 'Group',
        type: type as any,
        isActive: operational,
        status: groupStatus,
        leftAt: inGroup ? null : new Date(),
        welcome: { create: {} },
        verification: { create: {} },
        channelGate: { create: {} },
        filter: { create: {} },
        rules: { create: {} },
      },
      update: {
        isActive: operational,
        status: groupStatus,
        leftAt: inGroup ? null : new Date(),
        title: (chat as any).title || undefined,
      },
    });

    // Seed the IG/TK collection switch for a newly-joined group (tenant default).
    if (justAdded) {
      await this.collection.ensureConfig(botRow.tenantId, groupRow.id).catch(() => undefined);
      // Pull the real Telegram member count as soon as the bot joins.
      await this.syncMemberCount(botId, groupRow.id, groupRow.telegramChatId);
    }
    this.logger.log(
      `Bot ${botId} membership in chat ${chat.id}: ${oldStatus} -> ${status}` +
        (justLeft ? ' (left -> group LEFT, tasks paused)' : '') +
        (lostAdmin ? ' (lost admin -> tasks paused)' : '') +
        (justAdded && operational ? ' (joined as admin -> active)' : ''),
    );

    // Greet the group the moment the bot is added.
    if (justAdded && chat.type !== 'channel') {
      try {
        await ctx.api.sendMessage(
          chat.id,
          '👋 大家好，我是本群的管理机器人！\n\n已开始为本群提供：新人欢迎、人机验证、广告过滤、关键词拦截、统计分析等服务。\n\n请把我设为管理员以启用全部功能，管理员可在后台为本群单独配置。',
        );
      } catch (e: any) {
        this.logger.warn(`group intro send failed: ${e.message}`);
      }
    }
  }

  // ---------- new members: welcome + verification ----------

  private async onNewMembers(ctx: Context, botId: string) {
    if (!ctx.chat) return;
    const newMembers = ctx.message?.new_chat_members || [];
    this.logger.log(
      `[join] new_chat_members received: bot=${botId} chat=${ctx.chat.id} users=[${newMembers
        .map((m) => m.id)
        .join(', ')}]`,
    );
    const group = await this.loadGroup(botId, String(ctx.chat.id));
    if (!group) {
      this.logger.warn(
        `[join] loadGroup returned null for bot=${botId} chat=${ctx.chat.id} (new_chat_members ignored)`,
      );
      return;
    }

    for (const member of newMembers) {
      await this.handleMemberJoined(ctx, group, member, 'new_chat_members');
    }
  }

  // Fallback join detection via chat_member updates. Only reacts to a real
  // "join" transition: old status outside the chat -> new status inside it.
  private async onChatMember(ctx: Context, botId: string) {
    const upd = ctx.chatMember;
    if (!upd || !ctx.chat || ctx.chat.type === 'private') return;

    const oldStatus = upd.old_chat_member.status;
    const newStatus = upd.new_chat_member.status;
    this.logger.log(
      `[join] chat_member update: bot=${botId} chat=${ctx.chat.id} user=${upd.new_chat_member.user.id} ${oldStatus} -> ${newStatus}`,
    );

    const wasInChat = ['member', 'administrator', 'creator', 'restricted'].includes(oldStatus);
    const isInChat = ['member', 'administrator', 'creator', 'restricted'].includes(newStatus);
    if (wasInChat || !isInChat) return;

    const group = await this.loadGroup(botId, String(ctx.chat.id));
    if (!group) {
      this.logger.warn(
        `[join] loadGroup returned null for bot=${botId} chat=${ctx.chat.id} (chat_member ignored)`,
      );
      return;
    }

    await this.handleMemberJoined(ctx, group, upd.new_chat_member.user, 'chat_member');
  }

  // Unified join pipeline shared by new_chat_members and chat_member. A short
  // Redis lock makes it idempotent, since Telegram may deliver both updates
  // for the same join.
  private async handleMemberJoined(ctx: Context, group: any, member: any, source: string) {
    if (!member || member.is_bot) return;

    const dedupeKey = `joined:${group.id}:${member.id}`;
    try {
      const acquired = await this.redis.client.set(dedupeKey, source, 'EX', 10, 'NX');
      if (!acquired) {
        this.logger.log(
          `[join] duplicate join for group=${group.id} user=${member.id} (source=${source}), skipped`,
        );
        return;
      }
    } catch (e: any) {
      // if Redis is down we still process the join (risk: rare duplicate welcome)
      this.logger.warn(`[join] dedupe redis error: ${e.message}`);
    }

    this.logger.log(
      `[join] processing new member: group=${group.id} chat=${group.telegramChatId} user=${member.id} source=${source}`,
    );
    await this.incStat(group.id, 'newMembers');

    const v = group.verification;
    const cg = group.channelGate;
    const verifyOn = v && v.enabled !== false && v.mode !== 'NONE';
    const gateOn = cg && cg.enabled && cg.channel;

    // Independent gates that compose: verification runs first (if on); once it
    // passes, the channel-follow gate runs (if on). If neither is on -> welcome.
    // Member-count sync runs in finally so a branch failure still refreshes
    // the count, without swallowing the original error.
    try {
      if (verifyOn) {
        this.logger.log(`[join] branch=verification group=${group.id} user=${member.id}`);
        await this.startVerification(ctx, group, member);
      } else if (gateOn) {
        this.logger.log(`[join] branch=channelGate group=${group.id} user=${member.id}`);
        await this.startChannelGate(ctx, group, member);
      } else {
        this.logger.log(`[join] branch=welcome group=${group.id} user=${member.id}`);
        await this.sendWelcome(ctx, group, member);
      }
    } finally {
      await this.syncMemberCount(group.botId, group.id, group.telegramChatId);
    }
  }

  // ---------- channel-follow gate (independent feature) ----------

  private normalizeChannel(input: string): string {
    let s = (input || '').trim();
    if (!s) return s;
    if (s.startsWith('@') || s.startsWith('-100')) return s;
    const m = s.match(/t\.me\/([^/?\s]+)/i);
    if (m) {
      // public channel link -> @username; private invite (+xxxx) can't be resolved by username
      return m[1].startsWith('+') ? s : `@${m[1]}`;
    }
    if (/^\d+$/.test(s)) return s;
    return `@${s.replace(/^@/, '')}`;
  }

  private async isFollowingChannel(ctx: Context, channel: string, userId: number): Promise<boolean> {
    try {
      const m = await ctx.api.getChatMember(this.normalizeChannel(channel), userId);
      return ['member', 'administrator', 'creator'].includes(m.status);
    } catch (e: any) {
      this.logger.warn(`channel membership check failed: ${e.message}`);
      return false;
    }
  }

  private async startChannelGate(ctx: Context, group: any, member: any) {
    const cg = group.channelGate;
    try {
      await ctx.api.restrictChatMember(Number(group.telegramChatId), member.id, {
        can_send_messages: false,
      });
    } catch (e: any) {
      this.logger.warn(`restrict (channel gate) failed: ${e.message}`);
    }

    const name = member.first_name || '';
    const kb = new InlineKeyboard().text(
      cg.buttonText || '✅ 我已关注',
      `cgate:${group.id}:${member.id}`,
    );
    // include a quick link to the channel if it is a public @username / t.me link
    const ch = this.normalizeChannel(cg.channel);
    if (ch.startsWith('@')) {
      kb.row().url('📢 前往频道', `https://t.me/${ch.slice(1)}`);
    } else if (/^https?:\/\//.test(cg.channel)) {
      kb.row().url('📢 前往频道', cg.channel);
    }

    await ctx.reply(`${name ? name + '，' : ''}${cg.promptText}`, { reply_markup: kb });
  }

  private async handleChannelGateCallback(ctx: Context, data: string) {
    // cgate:<groupId>:<userId>
    const [, groupId, userId] = data.split(':');
    if (ctx.from?.id?.toString() !== userId) {
      await ctx.answerCallbackQuery({ text: '这不是给你的按钮 😉', show_alert: true });
      return;
    }
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { welcome: { include: { buttons: true } }, channelGate: true },
    });
    if (!group || !group.channelGate?.channel) {
      await ctx.answerCallbackQuery({ text: '配置已失效。' });
      return;
    }

    const followed = await this.isFollowingChannel(ctx, group.channelGate.channel, Number(userId));
    if (followed) {
      try {
        await ctx.api.restrictChatMember(Number(group.telegramChatId), Number(userId), {
          can_send_messages: true,
          can_send_other_messages: true,
          can_send_polls: true,
          can_add_web_page_previews: true,
        });
      } catch (e: any) {
        this.logger.warn(`unrestrict (channel gate) failed: ${e.message}`);
      }
      await this.incStat(groupId, 'verified');
      await this.log(groupId, 'CHANNEL_GATE_PASS', null, userId);
      await ctx.answerCallbackQuery({ text: '✅ 已解除禁言！' });
      try {
        await ctx.deleteMessage();
      } catch {}
      await this.sendWelcome(ctx, group, ctx.from);
    } else {
      await ctx.answerCallbackQuery({
        text: '❌ 未检测到你已关注频道，请先关注后再点击。',
        show_alert: true,
      });
    }
  }

  private async startVerification(ctx: Context, group: any, member: any) {
    const v = group.verification;
    // restrict the user until they pass
    try {
      await ctx.api.restrictChatMember(Number(group.telegramChatId), member.id, {
        can_send_messages: false,
      });
    } catch (e: any) {
      this.logger.warn(`restrict failed: ${e.message}`);
    }

    let challenge;
    if (v.mode === 'MATH') challenge = makeMathChallenge();
    else if (v.mode === 'CAPTCHA' || v.mode === 'IMAGE') challenge = makeCaptchaChallenge();
    else challenge = makeButtonChallenge();

    const expiresAt = new Date(Date.now() + v.timeoutSeconds * 1000);
    await this.prisma.pendingVerification.upsert({
      where: { groupId_telegramUserId: { groupId: group.id, telegramUserId: String(member.id) } },
      create: {
        groupId: group.id,
        telegramUserId: String(member.id),
        challenge: challenge.prompt,
        answer: challenge.answer,
        expiresAt,
      },
      update: { challenge: challenge.prompt, answer: challenge.answer, attempts: 0, status: 'PENDING', expiresAt },
    });

    const name = member.first_name || 'there';
    const kb = new InlineKeyboard();
    if (challenge.options) {
      challenge.options.forEach((opt, idx) => {
        kb.text(opt, `verify:${group.id}:${member.id}:${opt}`);
        if (idx % 2 === 1) kb.row();
      });
    } else {
      kb.text('✅ 我是真人', `verify:${group.id}:${member.id}:human`);
    }

    await ctx.reply(
      `👋 ${name}，欢迎！请在 ${v.timeoutSeconds} 秒内完成验证：\n\n${challenge.prompt}`,
      { parse_mode: 'Markdown', reply_markup: kb },
    );
  }

  private async sendWelcome(ctx: Context, group: any, member: any) {
    const w = group.welcome;
    if (!w || !w.enabled) return;

    const vars = {
      first_name: member.first_name || '',
      last_name: member.last_name || '',
      username: member.username ? `@${member.username}` : '',
      group_name: group.title,
    };

    // Marketing Center: if a WELCOME template is applied to this group (batch
    // assignment) or configured as a bot/tenant default, render it instead of
    // the legacy welcome config. Group override + per-group enable are honored.
    if (await this.renderGroupKind(ctx, group, 'WELCOME', vars)) {
      await this.incStat(group.id, 'welcomeSent');
      await this.log(group.id, 'WELCOME_SENT', null, String(member.id));
      return;
    }

    const text = renderText(w.text, vars);
    const kb = await this.appendAdsToKeyboard(
      buildKeyboard(w.buttons || []),
      group.botId,
      group.id,
      'WELCOME',
    );

    try {
      if (w.mediaType === 'PHOTO' && w.mediaUrl) {
        await ctx.replyWithPhoto(w.mediaUrl, { caption: text, parse_mode: 'Markdown', reply_markup: kb });
      } else if (w.mediaType === 'VIDEO' && w.mediaUrl) {
        await ctx.replyWithVideo(w.mediaUrl, { caption: text, parse_mode: 'Markdown', reply_markup: kb });
      } else if (w.mediaType === 'GIF' && w.mediaUrl) {
        await ctx.replyWithAnimation(w.mediaUrl, { caption: text, parse_mode: 'Markdown', reply_markup: kb });
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
      }
      await this.incStat(group.id, 'welcomeSent');
      await this.log(group.id, 'WELCOME_SENT', null, String(member.id));
    } catch (e: any) {
      this.logger.warn(`welcome send failed: ${e.message}`);
    }
  }

  // ---------- ads (button ad-slots) ----------

  private async adBotUsername(botId: string): Promise<string | null> {
    const b = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { username: true },
    });
    return b?.username ?? null;
  }

  // Active ads authorized (compliance) for this bot/group at the given placement.
  private async adsForPlacement(botId: string, groupId: string | null, placement: string) {
    const now = new Date();
    // groupId === null => private-menu context: only ads assigned to this bot.
    // group context => ad assigned to this exact group, or bot-wide ads.
    const scope: any[] =
      groupId === null ? [{ botId, groupId: null }] : [{ groupId }, { groupId: null, botId }];
    const ads = await this.prisma.ad.findMany({
      where: {
        enabled: true,
        placements: { has: placement as any },
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          { OR: scope },
        ],
      },
      include: { buttons: { orderBy: [{ row: 'asc' }, { position: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return ads.filter((a) => a.buttons.length > 0);
  }

  private adButtonTarget(button: { id: string; url: string }, username: string | null) {
    // route through the bot via a /start deep-link so clicks can be recorded,
    // falling back to the raw url if the bot username is unknown.
    return username ? `https://t.me/${username}?start=ad_${button.id}` : button.url;
  }

  private buildAdKeyboard(ad: any, username: string | null): InlineKeyboard | null {
    if (!ad.buttons?.length) return null;
    const sorted = [...ad.buttons].sort((a, b) =>
      a.row === b.row ? a.position - b.position : a.row - b.row,
    );
    const kb = new InlineKeyboard();
    let row = sorted[0].row;
    let first = true;
    for (const b of sorted) {
      if (!first && b.row !== row) {
        kb.row();
        row = b.row;
      }
      kb.url(b.label, this.adButtonTarget(b, username));
      first = false;
    }
    return kb;
  }

  private async appendAdsToKeyboard(
    base: InlineKeyboard | undefined,
    botId: string,
    groupId: string | null,
    placement: string,
  ): Promise<InlineKeyboard | undefined> {
    const ads = await this.adsForPlacement(botId, groupId, placement);
    if (!ads.length) return base;
    const username = await this.adBotUsername(botId);
    const kb = base ?? new InlineKeyboard();
    for (const ad of ads) {
      const sorted = [...ad.buttons].sort((a, b) =>
        a.row === b.row ? a.position - b.position : a.row - b.row,
      );
      for (const b of sorted) kb.row().url(b.label, this.adButtonTarget(b, username));
      await this.recordAdImpression(ad.id);
    }
    return kb;
  }

  private async recordAdImpression(adId: string) {
    await this.prisma.ad
      .update({ where: { id: adId }, data: { impressions: { increment: 1 } } })
      .catch(() => {});
  }

  // Send standalone ad messages for a placement into the current chat.
  private async sendPlacementAds(
    ctx: Context,
    botId: string,
    groupId: string | null,
    placement: string,
  ) {
    const ads = await this.adsForPlacement(botId, groupId, placement);
    if (!ads.length) return;
    const username = await this.adBotUsername(botId);
    for (const ad of ads) {
      const kb = this.buildAdKeyboard(ad, username);
      if (!kb) continue;
      const text = `${ad.title ? ad.title + '\n' : ''}${ad.body || ''}`.trim() || '🔥';
      await ctx.reply(text, { reply_markup: kb }).catch(() => {});
      await this.recordAdImpression(ad.id);
    }
  }

  // Public: push an ad to a chat (used by AdsService.sendNow and the scheduler).
  async sendAdToChat(record: any, chatId: string, adId: string, groupId: string | null) {
    const ad = await this.prisma.ad.findUnique({
      where: { id: adId },
      include: { buttons: { orderBy: [{ row: 'asc' }, { position: 'asc' }] } },
    });
    if (!ad || !ad.buttons.length) return;
    const bot = await this.getInstance(record);
    const kb = this.buildAdKeyboard(ad, record.username);
    if (!kb) return;
    const text = `${ad.title ? ad.title + '\n' : ''}${ad.body || ''}`.trim() || '🔥';
    await bot.api.sendMessage(chatId, text, { reply_markup: kb });
    await this.recordAdImpression(ad.id);
  }

  // Handle /start ad_<buttonId> deep-link: record the click, then hand over the link.
  private async handleAdStart(ctx: Context, botId: string, payload: string) {
    const buttonId = payload.slice('ad_'.length);
    const button = await this.prisma.adButton.findUnique({
      where: { id: buttonId },
      include: { ad: true },
    });
    if (!button || !button.ad) {
      await ctx.reply('该推广链接已失效。');
      return;
    }
    const ad = button.ad;
    await this.prisma
      .$transaction([
        this.prisma.adButton.update({
          where: { id: button.id },
          data: { clicks: { increment: 1 } },
        }),
        this.prisma.ad.update({ where: { id: ad.id }, data: { clicks: { increment: 1 } } }),
        this.prisma.adClick.create({
          data: {
            tenantId: ad.tenantId,
            adId: ad.id,
            buttonId: button.id,
            botId,
            groupId: ad.groupId ?? null,
            telegramUserId: ctx.from?.id ? String(ctx.from.id) : null,
          },
        }),
      ])
      .catch((e: any) => this.logger.warn(`ad click record failed: ${e.message}`));

    const kb = new InlineKeyboard().url(`👉 ${button.label}`, button.url);
    const text = `${ad.title ? '**' + ad.title + '**\n' : ''}${ad.body ? ad.body + '\n\n' : ''}点击下方按钮继续：`;
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb }).catch(() => {});
  }

  // ---------- marketing message templates (component-based) ----------

  private marketingButtonLabel(b: { emoji?: string | null; displayName: string }) {
    return b.emoji ? `${b.emoji} ${b.displayName}` : b.displayName;
  }

  private marketingButtonUrl(b: { linkType: string; target: string }) {
    const t = (b.target || '').trim();
    switch (b.linkType) {
      case 'URL':
      case 'MINIAPP':
        return t;
      case 'USER':
      case 'GROUP':
      case 'CHANNEL':
        return /^https?:\/\//.test(t) ? t : `https://t.me/${t.replace(/^@/, '')}`;
      default:
        return t;
    }
  }

  // Pick the most specific enabled template for a kind: group > bot > tenant-wide.
  private async findTemplate(kind: string, tenantId: string, botId?: string | null, groupId?: string | null) {
    const tpls = await this.prisma.messageTemplate.findMany({
      where: {
        tenantId,
        kind,
        enabled: true,
        OR: [
          groupId ? { groupId } : { id: '' },
          botId ? { groupId: null, botId } : { id: '' },
          { groupId: null, botId: null },
        ],
      },
    });
    return (
      tpls.find((t) => groupId && t.groupId === groupId) ||
      tpls.find((t) => !t.groupId && botId && t.botId === botId) ||
      tpls.find((t) => !t.groupId && !t.botId) ||
      null
    );
  }

  // Turn a template's components into a single renderable message.
  private async renderTemplate(
    template: any,
    vars: Record<string, string | undefined>,
    botId: string,
    groupId: string | null,
    assignment?: any,
  ): Promise<{ text: string; mediaType: string; mediaUrl: string | null; keyboard?: InlineKeyboard }> {
    // group-level override: replace components and/or disable specific buttons.
    const overrides = assignment?.overrides && typeof assignment.overrides === 'object' ? assignment.overrides : {};
    const assignmentId: string | null = assignment?.id || null;
    const disabled = new Set<string>(Array.isArray(overrides.disabledButtonIds) ? overrides.disabledButtonIds : []);
    const components: any[] =
      Array.isArray(overrides.components) && overrides.components.length
        ? overrides.components
        : Array.isArray(template.components)
          ? template.components
          : [];
    const textParts: string[] = [];
    let mediaType = 'NONE';
    let mediaUrl: string | null = null;
    const kb = new InlineKeyboard();
    let hasRows = false;
    const username = await this.adBotUsername(botId);

    for (const c of components) {
      switch (c?.type) {
        case 'TEXT':
          if (c.text) textParts.push(renderText(String(c.text), vars));
          break;
        case 'IMAGE':
          if (mediaType === 'NONE' && c.url) { mediaType = 'PHOTO'; mediaUrl = c.url; }
          if (c.caption) textParts.push(renderText(String(c.caption), vars));
          break;
        case 'VIDEO':
          if (mediaType === 'NONE' && c.url) { mediaType = 'VIDEO'; mediaUrl = c.url; }
          if (c.caption) textParts.push(renderText(String(c.caption), vars));
          break;
        case 'GIF':
          if (mediaType === 'NONE' && c.url) { mediaType = 'GIF'; mediaUrl = c.url; }
          break;
        case 'BUTTONS': {
          const items: any[] = Array.isArray(c.buttons) ? c.buttons : [];
          const refIds = items.filter((i) => i.buttonId).map((i) => i.buttonId);
          const refs = refIds.length
            ? await this.prisma.marketingButton.findMany({ where: { id: { in: refIds } } })
            : [];
          const refMap = new Map(refs.map((r) => [r.id, r]));
          for (const i of items) {
            if (i.buttonId) {
              if (disabled.has(i.buttonId)) continue;
              const b = refMap.get(i.buttonId);
              if (b && b.enabled) {
                // route library-button clicks through the bot when applied to a
                // group, so per-group/per-template clicks can be recorded.
                const url =
                  assignmentId && username
                    ? `https://t.me/${username}?start=tb_${assignmentId}_${b.id}`
                    : this.marketingButtonUrl(b);
                kb.row().url(this.marketingButtonLabel(b), url);
                hasRows = true;
              }
            } else if (i.label && i.url) {
              const label = i.emoji ? `${i.emoji} ${i.label}` : i.label;
              kb.row().url(label, i.url);
              hasRows = true;
            }
          }
          break;
        }
        case 'AD':
          if (c.adId) {
            const ad = await this.prisma.ad.findFirst({
              where: { id: c.adId },
              include: { buttons: { orderBy: [{ row: 'asc' }, { position: 'asc' }] } },
            });
            if (ad && ad.buttons.length) {
              if (ad.body) textParts.push(renderText(String(ad.body), vars));
              for (const b of ad.buttons) { kb.row().url(b.label, this.adButtonTarget(b, username)); }
              hasRows = true;
              await this.recordAdImpression(ad.id);
            }
          }
          break;
        case 'CHANNEL_CARD':
          if (c.channel) {
            const ch = this.normalizeChannel(String(c.channel));
            const url = ch.startsWith('@')
              ? `https://t.me/${ch.slice(1)}`
              : /^https?:\/\//.test(c.channel)
                ? c.channel
                : `https://t.me/${String(c.channel).replace(/^@/, '')}`;
            if (c.title) textParts.push(renderText(String(c.title), vars));
            kb.row().url(c.buttonText || '📢 关注频道', url);
            hasRows = true;
          }
          break;
        case 'CONTACT_CARD':
          if (c.username) {
            const u = String(c.username).replace(/^@/, '');
            kb.row().url(c.label || '📞 联系客服', `https://t.me/${u}`);
            hasRows = true;
          }
          break;
        default:
          break;
      }
    }

    return { text: textParts.join('\n\n'), mediaType, mediaUrl, keyboard: hasRows ? kb : undefined };
  }

  // Render + send a template into the current chat.
  private async sendTemplate(
    ctx: Context,
    template: any,
    vars: Record<string, string | undefined>,
    botId: string,
    groupId: string | null,
    assignment?: any,
  ) {
    const r = await this.renderTemplate(template, vars, botId, groupId, assignment);
    const text = r.text || '　';
    try {
      if (r.mediaType === 'PHOTO' && r.mediaUrl) {
        await ctx.replyWithPhoto(r.mediaUrl, { caption: text, parse_mode: 'Markdown', reply_markup: r.keyboard });
      } else if (r.mediaType === 'VIDEO' && r.mediaUrl) {
        await ctx.replyWithVideo(r.mediaUrl, { caption: text, parse_mode: 'Markdown', reply_markup: r.keyboard });
      } else if (r.mediaType === 'GIF' && r.mediaUrl) {
        await ctx.replyWithAnimation(r.mediaUrl, { caption: text, parse_mode: 'Markdown', reply_markup: r.keyboard });
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: r.keyboard });
      }
    } catch (e: any) {
      this.logger.warn(`template send failed: ${e.message}`);
    }
  }

  // Render the message(s) for a group + kind, honoring batch assignments and
  // group overrides. Priority: group assignment (enabled) > bot/tenant default.
  // Returns true if anything was sent.
  private async renderGroupKind(
    ctx: Context,
    group: any,
    kind: string,
    vars: Record<string, string | undefined>,
  ): Promise<boolean> {
    const assigns = await this.prisma.templateAssignment.findMany({
      where: { groupId: group.id, enabled: true, template: { kind, enabled: true } },
      include: { template: true },
    });
    if (assigns.length) {
      for (const a of assigns) {
        await this.sendTemplate(ctx, a.template, vars, group.botId, group.id, a);
        await this.prisma.templateAssignment
          .update({ where: { id: a.id }, data: { impressions: { increment: 1 } } })
          .catch(() => {});
      }
      return true;
    }
    const def = await this.findTemplate(kind, group.tenantId, group.botId, null);
    if (def) {
      await this.sendTemplate(ctx, def, vars, group.botId, group.id);
      return true;
    }
    return false;
  }

  // Handle /start tb_<assignmentId>_<marketingButtonId>: record the click, redirect.
  private async handleTemplateButtonStart(ctx: Context, botId: string, payload: string) {
    const rest = payload.slice('tb_'.length);
    const sep = rest.indexOf('_');
    const assignmentId = sep >= 0 ? rest.slice(0, sep) : '';
    const mbId = sep >= 0 ? rest.slice(sep + 1) : '';
    const [assignment, button] = await Promise.all([
      assignmentId ? this.prisma.templateAssignment.findUnique({ where: { id: assignmentId } }) : null,
      mbId ? this.prisma.marketingButton.findUnique({ where: { id: mbId } }) : null,
    ]);
    if (!button) {
      await ctx.reply('该推广链接已失效。');
      return;
    }
    if (assignment) {
      await this.prisma
        .$transaction([
          this.prisma.templateAssignment.update({
            where: { id: assignment.id },
            data: { clicks: { increment: 1 } },
          }),
          this.prisma.templateClick.create({
            data: {
              tenantId: assignment.tenantId,
              templateId: assignment.templateId,
              assignmentId: assignment.id,
              marketingButtonId: button.id,
              botId,
              groupId: assignment.groupId,
              telegramUserId: ctx.from?.id ? String(ctx.from.id) : null,
            },
          }),
        ])
        .catch((e: any) => this.logger.warn(`template click record failed: ${e.message}`));
    }
    const kb = new InlineKeyboard().url(`👉 ${this.marketingButtonLabel(button)}`, this.marketingButtonUrl(button));
    await ctx.reply('点击下方按钮继续：', { reply_markup: kb }).catch(() => {});
  }

  // ---------- callbacks (verify + button clicks) ----------

  private async onCallback(ctx: Context, botId: string) {
    const data = ctx.callbackQuery?.data || '';

    if (data.startsWith('verify:')) {
      await this.handleVerifyCallback(ctx, data);
      return;
    }

    if (data.startsWith('cgate:')) {
      await this.handleChannelGateCallback(ctx, data);
      return;
    }

    const locale = await this.getUserLocale(botId, ctx.from?.id);

    // Language submenu: open chooser
    if (data === 'language') {
      const kb = new InlineKeyboard()
        .text('🇨🇳 简体中文', 'lang:zh')
        .text('🇬🇧 English', 'lang:en')
        .row()
        .text(t(locale, 'btn_back'), 'home');
      await ctx.answerCallbackQuery();
      await this.editOrReply(ctx, t(locale, 'choose_language'), kb);
      return;
    }

    // Language submenu: pick a language
    if (data === 'lang:zh' || data === 'lang:en') {
      const picked: Locale = data === 'lang:en' ? 'en' : 'zh';
      if (ctx.from?.id) await this.setUserLocale(botId, ctx.from.id, picked);
      await ctx.answerCallbackQuery({ text: t(picked, 'language_set') });
      const record = await this.prisma.bot.findUnique({ where: { id: botId } });
      const text = record?.welcomeHomeText || t(picked, 'home_title');
      await this.editOrReply(ctx, text, this.buildHomeMenu(picked));
      return;
    }

    // Back to home menu
    if (data === 'home') {
      const record = await this.prisma.bot.findUnique({ where: { id: botId } });
      const text = record?.welcomeHomeText || t(locale, 'home_title');
      await ctx.answerCallbackQuery();
      await this.editOrReply(ctx, text, this.buildHomeMenu(locale));
      return;
    }

    // "我的群组" / dashboard entry with permission check
    if (data === 'my_groups') {
      await ctx.answerCallbackQuery();
      await this.handleMyGroups(ctx, locale);
      return;
    }

    if (data === 'support') {
      await ctx.answerCallbackQuery();
      await ctx.reply(t(locale, 'home_support'));
      return;
    }

    // otherwise treat as a tracked welcome button click
    await this.trackButtonClick(botId, ctx, data);
    await ctx.answerCallbackQuery();
  }

  private async handleVerifyCallback(ctx: Context, data: string) {
    // verify:<groupId>:<userId>:<answer>
    const [, groupId, userId, answer] = data.split(':');
    if (ctx.from?.id?.toString() !== userId) {
      await ctx.answerCallbackQuery({ text: '这不是给你的验证 😉', show_alert: true });
      return;
    }
    const pending = await this.prisma.pendingVerification.findUnique({
      where: { groupId_telegramUserId: { groupId, telegramUserId: userId } },
    });
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { welcome: { include: { buttons: true } }, verification: true, channelGate: true },
    });
    if (!pending || !group) {
      await ctx.answerCallbackQuery({ text: '验证已失效。' });
      return;
    }

    if (pending.expiresAt < new Date()) {
      await ctx.answerCallbackQuery({ text: '验证已超时。', show_alert: true });
      return;
    }

    if (pending.answer === answer) {
      await this.prisma.pendingVerification.update({
        where: { id: pending.id },
        data: { status: 'PASSED' },
      });
      await this.incStat(groupId, 'verified');
      await this.log(groupId, 'VERIFY_PASS', null, userId);
      await ctx.answerCallbackQuery({ text: '✅ 验证通过！' });
      try {
        await ctx.deleteMessage();
      } catch {}

      const cg = group.channelGate;
      if (cg && cg.enabled && cg.channel) {
        // verification passed but the channel-follow gate is also enabled:
        // keep the user muted and ask them to follow the channel next.
        await this.startChannelGate(ctx, group, ctx.from);
      } else {
        try {
          await ctx.api.restrictChatMember(Number(group.telegramChatId), Number(userId), {
            can_send_messages: true,
            can_send_other_messages: true,
            can_send_polls: true,
            can_add_web_page_previews: true,
          });
        } catch (e: any) {
          this.logger.warn(`unrestrict failed: ${e.message}`);
        }
        await this.sendWelcome(ctx, group, ctx.from);
        await this.sendPlacementAds(ctx, group.botId, group.id, 'POST_VERIFY');
        await this.renderGroupKind(ctx, group, 'VERIFY', {
          first_name: ctx.from?.first_name || '',
          username: ctx.from?.username ? `@${ctx.from.username}` : '',
          group_name: group.title,
        });
      }
    } else {
      const attempts = pending.attempts + 1;
      await this.prisma.pendingVerification.update({
        where: { id: pending.id },
        data: { attempts },
      });
      await ctx.answerCallbackQuery({ text: '❌ 答案错误，请重试。', show_alert: true });
      if (attempts >= 3) {
        await this.applyFailAction(ctx, group, Number(userId));
      }
    }
  }

  private async applyFailAction(ctx: Context, group: any, userId: number) {
    const action = group.verification?.failAction || 'KICK';
    try {
      if (action === 'BAN') {
        await ctx.api.banChatMember(Number(group.telegramChatId), userId);
      } else if (action === 'KICK') {
        await ctx.api.banChatMember(Number(group.telegramChatId), userId);
        await ctx.api.unbanChatMember(Number(group.telegramChatId), userId);
      }
      await this.log(group.id, `VERIFY_FAIL_${action}`, null, String(userId));
    } catch (e: any) {
      this.logger.warn(`fail action error: ${e.message}`);
    }
  }

  private async trackButtonClick(botId: string, ctx: Context, data: string) {
    // data shaped as cb:<label> for welcome buttons
    if (!data.startsWith('cb:')) return;
    const label = data.slice(3);
    await this.prisma.button.updateMany({
      where: { label, welcome: { group: { botId } } },
      data: { clickCount: { increment: 1 } },
    });
  }

  // ---------- message moderation ----------

  // Photo messages: collection (screenshots) + group message activity stats.
  private async onPhoto(ctx: Context, botId: string) {
    if (ctx.chat?.type === 'private') {
      await this.collection.onPrivateMessage(botId, ctx).catch(() => undefined);
      return;
    }
    await this.collection.onGroupMessage(botId, ctx).catch(() => undefined);
    // Photos are not text-moderated today; count after collection (best-effort).
    await this.tryRecordGroupMessageActivity(ctx, botId);
  }

  /** Video / document / voice / sticker / etc. — activity stats only. */
  private async onMediaMessage(ctx: Context, botId: string) {
    await this.tryRecordGroupMessageActivity(ctx, botId);
  }

  private async onMessage(ctx: Context, botId: string) {
    // Private chat: IG/TK query for authorized admins (no-op otherwise).
    if (ctx.chat?.type === 'private') {
      await this.collection.onPrivateMessage(botId, ctx).catch(() => undefined);
      return;
    }
    if (!ctx.chat) return;

    // IG/TK collection runs first so captured data survives even if moderation
    // later deletes the message. Safe no-op when collection is disabled.
    await this.collection.onGroupMessage(botId, ctx).catch(() => undefined);

    const text = ctx.message?.text || '';
    if (!text) return;
    // Engagement commands are handled by dedicated hears filters.
    if (isEngagementCommandText(text)) return;

    const group = await this.loadGroup(botId, String(ctx.chat.id));
    if (!group) return;

    const userId = String(ctx.from?.id);

    // diagnostic: confirms the bot actually receives group text (privacy mode off / is admin)
    this.logger.log(
      `[msg] group=${group.id} user=${userId} antiFlood=${group.filter?.antiFlood ?? false}`,
    );

    // whitelist bypasses moderation — message stays, so it counts.
    const white = group.listEntries?.find(
      (l: any) => l.type === 'WHITE' && l.telegramUserId === userId,
    );
    if (white) {
      await this.recordGroupMessageActivitySafe(ctx, botId, group);
      return;
    }

    // blacklist => remove immediately
    const black = group.listEntries?.find(
      (l: any) => l.type === 'BLACK' && l.telegramUserId === userId,
    );
    if (black) {
      await this.deleteAnd(ctx, group, 'BLACKLIST', userId, 'BAN');
      return;
    }

    // anti-flood (防刷屏): rate-limit messages per user using a Redis window
    const ff = group.filter;
    if (ff?.antiFlood) {
      const mid = ctx.message?.message_id;
      const { flooded, ids } = await this.trackFlood(
        group.id,
        userId,
        ff.floodMaxMessages,
        ff.floodWindowSeconds,
        mid,
      );
      if (flooded) {
        await this.applyFlood(ctx, group, userId, ff, ids);
        return;
      }
    }

    // keyword rules
    for (const kw of group.keywords || []) {
      if (matchKeyword(text, kw)) {
        await this.deleteAnd(ctx, group, 'KEYWORD', userId, kw.action);
        return;
      }
    }

    // filters
    const f = group.filter;
    if (f) {
      if (f.linkFilter && looksLikeLink(text)) {
        await this.deleteAnd(ctx, group, 'LINK', userId, 'DELETE');
        return;
      }
      if ((f.antiAd || f.antiSpam) && looksLikeAd(text)) {
        await this.incStat(group.id, 'adsBlocked');
        await this.deleteAnd(ctx, group, 'AD_BLOCKED', userId, 'DELETE');
        return;
      }
    }

    // auto replies
    for (const ar of group.autoReplies || []) {
      if (matchKeyword(text, { ...ar, action: 'NONE' } as any)) {
        await ctx.reply(ar.response);
        break;
      }
    }

    // Count only messages that passed moderation (not deleted / blocked / flooded).
    await this.recordGroupMessageActivitySafe(ctx, botId, group);
  }

  /**
   * Load group then record activity. Used for non-text content paths that do
   * not already hold a loaded group row.
   */
  private async tryRecordGroupMessageActivity(ctx: Context, botId: string) {
    if (!isCountableGroupUserMessage(ctx) || !ctx.chat) return;
    let group: Awaited<ReturnType<TelegramService['loadGroup']>>;
    try {
      group = await this.loadGroup(botId, String(ctx.chat.id));
    } catch (e: any) {
      this.logger.error(
        `[msg-stat] loadGroup failed bot=${botId} chat=${ctx.chat.id} user=${ctx.from?.id}: ${e?.message ?? e}`,
      );
      return;
    }
    if (!group) return;
    await this.recordGroupMessageActivitySafe(ctx, botId, group);
  }

  /**
   * Best-effort DailyMessageStat + GroupMember sync. Failures are logged and
   * never rethrown — moderation / replies must keep working.
   */
  private async recordGroupMessageActivitySafe(
    ctx: Context,
    botId: string,
    group: { id: string },
  ) {
    if (!isCountableGroupUserMessage(ctx)) return;
    const from = ctx.from!;
    const messageDateUnix = ctx.message?.date;
    if (messageDateUnix == null) return;

    const telegramChatId = ctx.chat ? String(ctx.chat.id) : '';
    const telegramUserId = String(from.id);

    try {
      await recordGroupMessageActivity(this.engagement, {
        groupId: group.id,
        telegramUserId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        messageDateUnix,
      });
    } catch (e: any) {
      this.logger.error(
        `[msg-stat] failed bot=${botId} chat=${telegramChatId} user=${telegramUserId}: ${e?.message ?? e}`,
      );
    }
  }

  // Tracks message rate + recent message ids for a user within the window.
  // When the limit is exceeded, returns the full list of message ids in the
  // current burst so they can be deleted in one shot.
  private async trackFlood(
    groupId: string,
    userId: string,
    max: number,
    windowSec: number,
    messageId?: number,
  ): Promise<{ flooded: boolean; ids: number[] }> {
    const limit = Math.max(1, max || 5);
    const window = Math.max(1, windowSec || 5);
    const countKey = `flood:${groupId}:${userId}`;
    const idsKey = `floodids:${groupId}:${userId}`;
    try {
      // record this message id (used to bulk-delete the whole burst on trigger)
      if (messageId) {
        await this.redis.client.rpush(idsKey, String(messageId));
        await this.redis.client.expire(idsKey, window);
        await this.redis.client.ltrim(idsKey, -100, -1); // cap to last 100
      }
      const n = await this.redis.client.incr(countKey);
      if (n === 1) await this.redis.client.expire(countKey, window);
      this.logger.log(`[flood] ${countKey} count=${n}/${limit} window=${window}s`);

      if (n > limit) {
        const raw = await this.redis.client.lrange(idsKey, 0, -1);
        await this.redis.client.del(idsKey); // reset burst; further messages re-accumulate
        const ids = raw.map((x) => Number(x)).filter((x) => Number.isFinite(x));
        if (messageId && !ids.includes(messageId)) ids.push(messageId);
        return { flooded: true, ids };
      }
      return { flooded: false, ids: [] };
    } catch (e: any) {
      this.logger.warn(`anti-flood redis error: ${e.message}`);
      return { flooded: false, ids: [] };
    }
  }

  // Escalating punishment for repeated flooding:
  //   offense 1 .. (banThreshold-1) => mute for floodMuteSeconds
  //   offense >= banThreshold       => kick + add to blacklist (banned, can't rejoin)
  private async applyFlood(ctx: Context, group: any, userId: string, f: any, messageIds: number[] = []) {
    const chatId = Number(group.telegramChatId);
    const uid = Number(userId);

    // 1) delete the whole burst of flood messages immediately (single bulk call)
    const ids = Array.from(new Set(messageIds.filter((x) => Number.isFinite(x))));
    if (ids.length) {
      try {
        await ctx.api.deleteMessages(chatId, ids);
      } catch {
        await Promise.allSettled(ids.map((id) => ctx.api.deleteMessage(chatId, id)));
      }
    } else {
      try {
        await ctx.deleteMessage();
      } catch {}
    }

    // 2) count this offense (reset window in hours)
    const banThreshold = Math.max(1, f.floodBanThreshold || 3);
    const windowHours = Math.max(1, f.floodOffenseWindowHours || 24);
    const offenseKey = `floodoff:${group.id}:${userId}`;
    let offense = 1;
    try {
      offense = await this.redis.client.incr(offenseKey);
      if (offense === 1) await this.redis.client.expire(offenseKey, windowHours * 3600);
    } catch {
      // if redis fails, fall back to a single offense (mute)
    }

    // 3) escalate
    try {
      if (offense >= banThreshold) {
        // kick + blacklist (permanent ban => removed and cannot rejoin)
        await ctx.api.banChatMember(chatId, uid);
        await this.incStat(group.id, 'bans');
        await this.prisma.listEntry
          .upsert({
            where: {
              groupId_type_telegramUserId: {
                groupId: group.id,
                type: 'BLACK' as any,
                telegramUserId: userId,
              },
            },
            create: {
              groupId: group.id,
              type: 'BLACK' as any,
              telegramUserId: userId,
              note: `刷屏第${offense}次自动踢出拉黑`,
            },
            update: { note: `刷屏第${offense}次自动踢出拉黑` },
          })
          .catch(() => undefined);
        await this.redis.client.del(offenseKey).catch(() => undefined);
        await this.log(group.id, `ANTI_FLOOD_BAN(${offense})`, null, userId);
        try {
          await ctx.reply('🚫 多次刷屏，已被移出群组并加入黑名单。');
        } catch {}
      } else {
        // mute
        const until = Math.floor(Date.now() / 1000) + Math.max(30, f.floodMuteSeconds || 60);
        await ctx.api.restrictChatMember(
          chatId,
          uid,
          { can_send_messages: false },
          { until_date: until },
        );
        await this.log(group.id, `ANTI_FLOOD_MUTE(${offense}/${banThreshold})`, null, userId);
        try {
          await ctx.reply(
            `⚠️ 检测到刷屏，已禁言（第 ${offense}/${banThreshold} 次，达到 ${banThreshold} 次将被踢出拉黑）。`,
          );
        } catch {}
      }
    } catch (e: any) {
      this.logger.warn(`anti-flood action failed: ${e.message}`);
    }
  }

  private async deleteAnd(ctx: Context, group: any, reason: string, userId: string, action: string) {
    try {
      await ctx.deleteMessage();
    } catch {}
    try {
      const chatId = Number(group.telegramChatId);
      const uid = Number(userId);
      if (action === 'BAN') {
        await ctx.api.banChatMember(chatId, uid);
        await this.incStat(group.id, 'bans');
      } else if (action === 'KICK') {
        await ctx.api.banChatMember(chatId, uid);
        await ctx.api.unbanChatMember(chatId, uid);
      } else if (action === 'MUTE') {
        await ctx.api.restrictChatMember(chatId, uid, { can_send_messages: false });
      }
    } catch (e: any) {
      this.logger.warn(`moderation action failed: ${e.message}`);
    }
    await this.log(group.id, reason, null, userId);
  }

  // ---------- helpers ----------

  /**
   * Refresh Group.memberCount via Telegram getChatMemberCount.
   * On failure, keeps the previous DB value and logs a warning.
   * Returns the new count, or null if the sync failed / bot missing.
   */
  async syncMemberCount(
    botId: string,
    groupId: string,
    telegramChatId: string,
  ): Promise<number | null> {
    this.logger.log(
      `[memberCount] enter syncMemberCount bot=${botId} group=${groupId} chat=${telegramChatId}`,
    );
    try {
      const record = await this.prisma.bot.findUnique({ where: { id: botId } });
      if (!record) {
        this.logger.warn(
          `[memberCount] bot ${botId} not found, skip sync for group=${groupId}`,
        );
        return null;
      }
      const bot = await this.getInstance(record);
      const count = await bot.api.getChatMemberCount(telegramChatId);
      // Constrain by both id and botId so a mismatched caller cannot update
      // another bot's group. updateMany accepts non-unique compound where;
      // Group.id alone is unique, but (id, botId) is not a @@unique.
      const result = await this.prisma.group.updateMany({
        where: { id: groupId, botId },
        data: { memberCount: count },
      });
      if (result.count === 0) {
        this.logger.warn(
          `[memberCount] no row matched group=${groupId} bot=${botId}, skipped write (count=${count})`,
        );
        return null;
      }
      this.logger.log(
        `[memberCount] group=${groupId} chat=${telegramChatId} synced to ${count}`,
      );
      return count;
    } catch (e: any) {
      this.logger.warn(
        `[memberCount] sync failed for group=${groupId} chat=${telegramChatId}: ${e.message}`,
      );
      return null;
    }
  }

  private async loadGroup(botId: string, chatId: string) {
    const group = await this.prisma.group.findUnique({
      where: { botId_telegramChatId: { botId, telegramChatId: chatId } },
      include: {
        welcome: { include: { buttons: true } },
        verification: true,
        channelGate: true,
        filter: true,
        keywords: { where: { enabled: true } },
        listEntries: true,
        autoReplies: { where: { enabled: true } },
      },
    });
    // bot no longer in the group -> stop running any tasks / stats for it
    if (group && (group.status === 'LEFT' || !group.isActive)) return null;
    return group;
  }

  // small cache so per-message stat/log writes don't re-query the tenant each time
  private readonly groupTenantCache = new Map<string, string>();

  private async tenantOfGroup(groupId: string): Promise<string | null> {
    const cached = this.groupTenantCache.get(groupId);
    if (cached) return cached;
    const g = await this.prisma.group.findUnique({ where: { id: groupId }, select: { tenantId: true } });
    if (g?.tenantId) this.groupTenantCache.set(groupId, g.tenantId);
    return g?.tenantId ?? null;
  }

  private async incStat(groupId: string, field: string) {
    const tenantId = await this.tenantOfGroup(groupId);
    if (!tenantId) return;
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    await this.prisma.statDaily.upsert({
      where: { groupId_date: { groupId, date } },
      create: { tenantId, groupId, date, [field]: 1 } as any,
      update: { [field]: { increment: 1 } } as any,
    });
  }

  private async log(groupId: string, action: string, actorId: string | null, targetUserId: string | null) {
    const tenantId = await this.tenantOfGroup(groupId);
    if (!tenantId) return;
    await this.prisma.adminLog.create({
      data: { tenantId, groupId, action, actorId, targetUserId },
    });
  }
}
