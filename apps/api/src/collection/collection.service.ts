import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Context } from 'grammy';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS } from '../rbac/permissions';
import { OcrService } from '../ocr/ocr.service';
import {
  extractAccounts,
  extractQuery,
  hasPlatformKeyword,
  platformLabel,
  Platform,
} from './parser.util';
import { SetGroupConfigDto, ListSubmissionsQuery } from './dto';

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);
  private readonly tokenCache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly ocr: OcrService,
  ) {}

  // =========================================================================
  //  Runtime (called from TelegramService for each relevant update)
  // =========================================================================

  // Ensure a group has a CollectionConfig row, seeded from the tenant default.
  // Called when the bot joins a new group.
  async ensureConfig(tenantId: string, groupId: string): Promise<void> {
    const existing = await this.prisma.collectionConfig.findUnique({ where: { groupId } });
    if (existing) return;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { collectionDefaultEnabled: true },
    });
    await this.prisma.collectionConfig
      .create({
        data: { tenantId, groupId, enabled: tenant?.collectionDefaultEnabled ?? false },
      })
      .catch(() => undefined);
  }

  // Group message (text or photo). Collects IG/TK accounts when the group's
  // collection is enabled and the message mentions a platform (or has a photo).
  async onGroupMessage(botId: string, ctx: Context): Promise<void> {
    const chat = ctx.chat;
    if (!chat || chat.type === 'private') return;

    const group = await this.prisma.group.findUnique({
      where: { botId_telegramChatId: { botId, telegramChatId: String(chat.id) } },
      include: { collectionConfig: true },
    });
    if (!group || group.status === 'LEFT' || !group.isActive) return;
    const cfg = group.collectionConfig;
    if (!cfg || !cfg.enabled) return;

    const msg = ctx.message;
    if (!msg) return;
    const text = msg.text || msg.caption || '';
    const photos = (msg as any).photo as Array<{ file_id: string }> | undefined;
    const hasPhoto = Array.isArray(photos) && photos.length > 0;
    if (!hasPlatformKeyword(text) && !hasPhoto) return;

    let screenshotFileId: string | null = null;
    let ocrText: string | null = null;
    if (hasPhoto) {
      screenshotFileId = photos![photos!.length - 1].file_id;
      const buf = await this.downloadFile(botId, screenshotFileId);
      if (buf) ocrText = (await this.ocr.recognize(buf)) || null;
    }

    let accounts = extractAccounts(text);
    if (!accounts.length && ocrText) accounts = extractAccounts(ocrText);
    accounts = accounts.filter(
      (a) =>
        (a.platform === 'INSTAGRAM' && cfg.collectInstagram) ||
        (a.platform === 'TIKTOK' && cfg.collectTiktok),
    );
    if (!accounts.length) return;

    const from = ctx.from;
    const labels: string[] = [];
    for (const a of accounts) {
      await this.prisma.submission
        .create({
          data: {
            tenantId: group.tenantId,
            botId,
            groupId: group.id,
            platform: a.platform as any,
            username: a.username,
            normalizedUsername: a.normalizedUsername,
            rawText: text || null,
            screenshotFileId,
            ocrText,
            submittedByTgId: from?.id ? String(from.id) : null,
            submittedByUsername: from?.username || null,
            chatId: String(chat.id),
            chatTitle: (chat as any).title || null,
            messageId: msg.message_id ? String(msg.message_id) : null,
          },
        })
        .catch((e) => this.logger.warn(`submission create failed: ${e.message}`));
      labels.push(`${platformLabel(a.platform)} + ${a.username}`);
    }

    if (cfg.replyOnCapture && labels.length) {
      await ctx.reply('已记录：\n' + labels.join('\n')).catch(() => undefined);
    }
  }

  // Private message from an admin: query by username / link / screenshot.
  // Returns true if it handled the message (so the caller stops processing).
  async onPrivateMessage(botId: string, ctx: Context): Promise<boolean> {
    const chat = ctx.chat;
    if (!chat || chat.type !== 'private') return false;
    const msg = ctx.message;
    if (!msg) return false;

    const tgId = ctx.from?.id ? String(ctx.from.id) : null;
    if (!tgId) return false;

    // Only authorized admins of THIS bot's tenant may query.
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { tenantId: true },
    });
    if (!bot) return false;
    const admin = await this.prisma.admin.findUnique({ where: { telegramUserId: tgId } });
    if (!admin || !admin.active || admin.tenantId !== bot.tenantId) return false;

    let authorized = false;
    try {
      const rc = await this.rbac.context(admin.id);
      authorized = rc.isSuper || rc.permissions.has(PERMISSIONS.COLLECTION_VIEW);
    } catch {
      return false;
    }
    if (!authorized) return false;

    const photos = (msg as any).photo as Array<{ file_id: string }> | undefined;
    const hasPhoto = Array.isArray(photos) && photos.length > 0;
    const text = msg.text || msg.caption || '';

    let queries = extractQuery(text);
    if (hasPhoto) {
      const fileId = photos![photos!.length - 1].file_id;
      const buf = await this.downloadFile(botId, fileId);
      const ocrText = buf ? await this.ocr.recognize(buf) : '';
      if (!ocrText) {
        await ctx.reply('没有从截图里识别到文字，请换一张更清晰的截图。').catch(() => undefined);
        return true;
      }
      queries = extractQuery(ocrText);
      if (!queries.length) {
        await ctx.reply('没有从截图里识别到 IG/TK 用户名。').catch(() => undefined);
        return true;
      }
    }

    if (!queries.length) return false; // not a query -> let other handlers run

    let anyFound = false;
    for (const q of queries) {
      const rows = await this.prisma.submission.findMany({
        where: {
          tenantId: bot.tenantId,
          normalizedUsername: q.normalizedUsername,
          ...(q.platform ? { platform: q.platform as any } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      if (!rows.length) continue;
      anyFound = true;
      const row = rows[0];
      const submitter = row.submittedByUsername
        ? `@${row.submittedByUsername}`
        : '(无用户名)';
      const extra = rows.length > 1 ? `\n（共有 ${rows.length} 条记录）` : '';
      const info =
        '✅ 找到记录\n' +
        `平台：${platformLabel(row.platform as Platform)}\n` +
        `用户名：${row.username}\n` +
        `提交人：${submitter} (ID: ${row.submittedByTgId ?? '未知'})\n` +
        `来源群：${row.chatTitle || '未知群组'} (ID: ${row.chatId ?? '未知'})\n` +
        `提交时间：${row.createdAt.toISOString().replace('T', ' ').slice(0, 19)}` +
        extra;
      await ctx.reply(info).catch(() => undefined);
      if (row.screenshotFileId) {
        // file_id only works for the bot that captured it (same tenant, usually
        // the same bot). Best-effort: ignore if it can't be re-sent.
        await ctx.replyWithPhoto(row.screenshotFileId, { caption: '原始截图' }).catch(() => undefined);
      }
    }

    if (!anyFound) {
      await ctx.reply('数据库里没有找到这个账号。').catch(() => undefined);
    }
    return true;
  }

  // ---- helpers ----

  private async botToken(botId: string): Promise<string | null> {
    const cached = this.tokenCache.get(botId);
    if (cached) return cached;
    const bot = await this.prisma.bot.findUnique({ where: { id: botId }, select: { token: true } });
    if (bot?.token) this.tokenCache.set(botId, bot.token);
    return bot?.token ?? null;
  }

  invalidateToken(botId: string) {
    this.tokenCache.delete(botId);
  }

  private async downloadFile(botId: string, fileId: string): Promise<Buffer | null> {
    const token = await this.botToken(botId);
    if (!token) return null;
    try {
      const metaRes = await fetch(
        `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      );
      const meta: any = await metaRes.json();
      const filePath = meta?.result?.file_path;
      if (!filePath) return null;
      const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
      const arr = await fileRes.arrayBuffer();
      return Buffer.from(arr);
    } catch (e: any) {
      this.logger.warn(`downloadFile failed: ${e?.message || e}`);
      return null;
    }
  }

  // =========================================================================
  //  Dashboard APIs (tenant-scoped via RBAC)
  // =========================================================================

  async listSubmissions(userId: string, query: ListSubmissionsQuery) {
    const ctx = await this.rbac.context(userId);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: any = { tenantId: ctx.tenantId };
    if (!ctx.isSuper) where.groupId = { in: ctx.groupIds.length ? ctx.groupIds : ['__none__'] };
    if (query.platform === 'INSTAGRAM' || query.platform === 'TIKTOK') where.platform = query.platform;
    // Prevent IDOR: query.groupId must stay inside the caller's scoped groups
    if (query.groupId) {
      if (ctx.isSuper) {
        where.groupId = query.groupId;
      } else if (ctx.groupIds.includes(query.groupId)) {
        where.groupId = query.groupId;
      } else {
        where.groupId = '__none__';
      }
    }
    if (query.q && query.q.trim()) {
      where.normalizedUsername = { contains: query.q.trim().replace(/^@/, '').toLowerCase() };
    }
    const [total, items] = await Promise.all([
      this.prisma.submission.count({ where }),
      this.prisma.submission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { group: { select: { title: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((s) => ({
        id: s.id,
        platform: s.platform,
        username: s.username,
        rawText: s.rawText,
        ocrText: s.ocrText,
        hasScreenshot: !!s.screenshotFileId,
        submittedByTgId: s.submittedByTgId,
        submittedByUsername: s.submittedByUsername,
        chatId: s.chatId,
        chatTitle: s.chatTitle || s.group?.title || null,
        messageId: s.messageId,
        createdAt: s.createdAt,
      })),
    };
  }

  // Fetch the screenshot bytes for a submission (proxied through the bot token).
  async fetchScreenshot(userId: string, id: string): Promise<Buffer> {
    const ctx = await this.rbac.context(userId);
    const sub = await this.prisma.submission.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { screenshotFileId: true, botId: true, groupId: true },
    });
    if (!sub || !sub.screenshotFileId || !sub.botId) throw new NotFoundException('没有截图');
    if (!ctx.isSuper && sub.groupId && !ctx.groupIds.includes(sub.groupId)) {
      throw new NotFoundException('没有截图');
    }
    const buf = await this.downloadFile(sub.botId, sub.screenshotFileId);
    if (!buf) throw new NotFoundException('截图下载失败');
    return buf;
  }

  // Overview: tenant default + per-group collection state with submission counts.
  async overview(userId: string) {
    const ctx = await this.rbac.context(userId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { collectionDefaultEnabled: true },
    });
    const groups = await this.prisma.group.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'ACTIVE',
        ...(ctx.isSuper ? {} : { id: { in: ctx.groupIds.length ? ctx.groupIds : ['__none__'] } }),
      },
      select: {
        id: true,
        title: true,
        telegramChatId: true,
        collectionConfig: true,
        _count: { select: { submissions: true } },
      },
      orderBy: { joinedAt: 'desc' },
    });
    return {
      defaultEnabled: tenant?.collectionDefaultEnabled ?? false,
      groups: groups.map((g) => ({
        groupId: g.id,
        title: g.title,
        telegramChatId: g.telegramChatId,
        enabled: g.collectionConfig?.enabled ?? false,
        collectInstagram: g.collectionConfig?.collectInstagram ?? true,
        collectTiktok: g.collectionConfig?.collectTiktok ?? true,
        replyOnCapture: g.collectionConfig?.replyOnCapture ?? true,
        submissionCount: g._count.submissions,
      })),
    };
  }

  async setGroupConfig(userId: string, groupId: string, dto: SetGroupConfigDto) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertGroup(ctx, groupId, PERMISSIONS.COLLECTION_MANAGE);
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId: ctx.tenantId },
      select: { id: true, tenantId: true },
    });
    if (!group) throw new NotFoundException('群组不存在');
    const data: any = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.collectInstagram !== undefined) data.collectInstagram = dto.collectInstagram;
    if (dto.collectTiktok !== undefined) data.collectTiktok = dto.collectTiktok;
    if (dto.replyOnCapture !== undefined) data.replyOnCapture = dto.replyOnCapture;
    return this.prisma.collectionConfig.upsert({
      where: { groupId },
      create: { tenantId: group.tenantId, groupId, ...data },
      update: data,
    });
  }

  // One-click enable/disable for ALL of the tenant's groups in scope.
  async bulkToggle(userId: string, enabled: boolean) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.COLLECTION_MANAGE)) {
      throw new NotFoundException('没有管理采集的权限');
    }
    const groups = await this.prisma.group.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(ctx.isSuper ? {} : { id: { in: ctx.groupIds.length ? ctx.groupIds : ['__none__'] } }),
      },
      select: { id: true },
    });
    for (const g of groups) {
      await this.prisma.collectionConfig.upsert({
        where: { groupId: g.id },
        create: { tenantId: ctx.tenantId, groupId: g.id, enabled },
        update: { enabled },
      });
    }
    return { ok: true, count: groups.length, enabled };
  }

  // Default applied to newly-joined groups (super admin only).
  async setTenantDefault(userId: string, enabled: boolean) {
    const ctx = await this.rbac.context(userId);
    this.rbac.assertSuper(ctx);
    await this.prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { collectionDefaultEnabled: enabled },
    });
    return { ok: true, defaultEnabled: enabled };
  }
}
