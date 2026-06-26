import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { TelegramService } from '../telegram/telegram.service';
import { PERMISSIONS, PermissionKey } from '../rbac/permissions';
import { DEFAULT_AD_KEYWORDS } from '../telegram/moderation.util';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly telegram: TelegramService,
  ) {}

  // Access requires the group to be in the caller's (tenant-scoped) group set
  // AND the caller to hold the permission. Super admin passes everything in-tenant.
  private async assertAccess(userId: string, groupId: string, perm: PermissionKey) {
    const ctx = await this.rbac.context(userId);
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId: ctx.tenantId },
    });
    if (!group) throw new ForbiddenException('无权访问该群组');
    this.rbac.assertGroup(ctx, groupId, perm);
    return group;
  }

  async list(userId: string) {
    const ctx = await this.rbac.context(userId);
    return this.prisma.group.findMany({
      where: { tenantId: ctx.tenantId, id: { in: ctx.groupIds } },
      include: {
        bot: { select: { id: true, name: true, username: true } },
        _count: { select: { keywords: true, adminLogs: true } },
      },
      orderBy: { joinedAt: 'desc' },
    });
  }

  async detail(userId: string, groupId: string) {
    await this.assertAccess(userId, groupId, PERMISSIONS.GROUPS_VIEW);
    return this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        bot: { select: { id: true, name: true, username: true } },
        welcome: { include: { buttons: { orderBy: [{ row: 'asc' }, { position: 'asc' }] } } },
        verification: true,
        channelGate: true,
        filter: true,
        rules: true,
        keywords: { orderBy: { createdAt: 'desc' } },
        listEntries: true,
        announcements: true,
        autoReplies: true,
        adminGroups: { include: { admin: { select: { id: true, email: true, displayName: true } } } },
      },
    });
  }

  // ---------- welcome ----------
  async updateWelcome(userId: string, groupId: string, data: any) {
    await this.assertAccess(userId, groupId, PERMISSIONS.WELCOME_EDIT);
    return this.prisma.welcomeMessage.update({
      where: { groupId },
      data: {
        enabled: data.enabled,
        text: data.text,
        mediaType: data.mediaType,
        mediaUrl: data.mediaUrl,
        autoDeleteSeconds: data.autoDeleteSeconds,
        deletePreviousOnNewJoin: data.deletePreviousOnNewJoin,
      },
    });
  }

  // ---------- buttons (welcome) ----------
  async setButtons(userId: string, groupId: string, buttons: any[]) {
    await this.assertAccess(userId, groupId, PERMISSIONS.WELCOME_EDIT);
    const welcome = await this.prisma.welcomeMessage.findUnique({ where: { groupId } });
    if (!welcome) throw new NotFoundException('welcome not found');

    await this.prisma.button.deleteMany({ where: { welcomeId: welcome.id } });
    if (buttons.length) {
      await this.prisma.button.createMany({
        data: buttons.map((b, i) => ({
          welcomeId: welcome.id,
          label: b.label,
          type: b.type || 'URL',
          url: b.url,
          callbackData: b.callbackData,
          emoji: b.emoji,
          style: b.style || 'default',
          row: b.row ?? 0,
          position: b.position ?? i,
        })),
      });
    }
    return this.prisma.button.findMany({
      where: { welcomeId: welcome.id },
      orderBy: [{ row: 'asc' }, { position: 'asc' }],
    });
  }

  // ---------- verification ----------
  async updateVerification(userId: string, groupId: string, data: any) {
    await this.assertAccess(userId, groupId, PERMISSIONS.VERIFY_EDIT);
    return this.prisma.verificationConfig.update({ where: { groupId }, data });
  }

  // ---------- channel-follow gate (独立于验证) ----------
  async updateChannelGate(userId: string, groupId: string, data: any) {
    await this.assertAccess(userId, groupId, PERMISSIONS.CHANNEL_GATE_EDIT);
    return this.prisma.channelGate.upsert({
      where: { groupId },
      create: {
        groupId,
        enabled: data.enabled ?? false,
        channel: data.channel ?? null,
        promptText: data.promptText ?? undefined,
        buttonText: data.buttonText ?? undefined,
      },
      update: {
        enabled: data.enabled,
        channel: data.channel,
        promptText: data.promptText,
        buttonText: data.buttonText,
      },
    });
  }

  // ---------- filters ----------
  // The filter form is a single object covering ad/link/anti-flood toggles. We
  // enforce per-field: an admin only needs the permission for the fields they
  // actually changed (compared against current DB values).
  async updateFilter(userId: string, groupId: string, data: any) {
    const ctx = await this.rbac.context(userId);
    const group = await this.prisma.group.findFirst({ where: { id: groupId, tenantId: ctx.tenantId } });
    if (!group) throw new ForbiddenException('无权访问该群组');
    if (!ctx.groupIds.includes(groupId)) throw new ForbiddenException('无权访问该群组');

    const current: any = (await this.prisma.filterConfig.findUnique({ where: { groupId } })) ?? {};
    const changed = (k: string) => data[k] !== undefined && data[k] !== current[k];

    const adFields = ['antiAd', 'antiSpam', 'mediaFilter'];
    const floodFields = [
      'antiFlood', 'floodMaxMessages', 'floodWindowSeconds', 'floodAction',
      'floodMuteSeconds', 'floodBanThreshold', 'floodOffenseWindowHours',
      'warnLimit', 'warnAction',
    ];

    const needed: PermissionKey[] = [];
    if (adFields.some(changed)) needed.push(PERMISSIONS.FILTER_ADS);
    if (changed('linkFilter')) needed.push(PERMISSIONS.FILTER_LINKS);
    if (floodFields.some(changed)) needed.push(PERMISSIONS.ANTIFLOOD_EDIT);
    // nothing recognizably changed => require the general group-edit permission
    if (needed.length === 0) needed.push(PERMISSIONS.GROUPS_EDIT);

    for (const perm of needed) this.rbac.assertGroup(ctx, groupId, perm);

    return this.prisma.filterConfig.update({ where: { groupId }, data });
  }

  // ---------- rules ----------
  async updateRules(userId: string, groupId: string, text: string) {
    await this.assertAccess(userId, groupId, PERMISSIONS.GROUPS_EDIT);
    return this.prisma.groupRule.update({ where: { groupId }, data: { text } });
  }

  // ---------- keywords ----------
  async addKeyword(userId: string, groupId: string, data: any) {
    await this.assertAccess(userId, groupId, PERMISSIONS.FILTER_KEYWORDS);
    return this.prisma.keyword.create({
      data: {
        groupId,
        pattern: data.pattern,
        match: data.match || 'CONTAINS',
        action: data.action || 'DELETE',
        enabled: data.enabled ?? true,
      },
    });
  }

  async deleteKeyword(userId: string, groupId: string, keywordId: string) {
    await this.assertAccess(userId, groupId, PERMISSIONS.FILTER_KEYWORDS);
    await this.prisma.keyword.deleteMany({ where: { id: keywordId, groupId } });
    return { ok: true };
  }

  // Bulk import the curated default ad keyword list (skips ones already present).
  async importAdKeywords(userId: string, groupId: string) {
    await this.assertAccess(userId, groupId, PERMISSIONS.FILTER_KEYWORDS);
    const existing = await this.prisma.keyword.findMany({
      where: { groupId },
      select: { pattern: true },
    });
    const have = new Set(existing.map((k) => k.pattern.toLowerCase()));
    const toAdd = DEFAULT_AD_KEYWORDS.filter((w) => !have.has(w.toLowerCase()));
    if (toAdd.length) {
      await this.prisma.keyword.createMany({
        data: toAdd.map((pattern) => ({
          groupId,
          pattern,
          match: 'CONTAINS' as any,
          action: 'DELETE' as any,
          enabled: true,
        })),
      });
    }
    return { added: toAdd.length, total: have.size + toAdd.length };
  }

  // ---------- black / white list ----------
  async addListEntry(userId: string, groupId: string, data: any) {
    const perm = data.type === 'WHITE' ? PERMISSIONS.WHITELIST_EDIT : PERMISSIONS.BLACKLIST_EDIT;
    await this.assertAccess(userId, groupId, perm);
    return this.prisma.listEntry.upsert({
      where: {
        groupId_type_telegramUserId: {
          groupId,
          type: data.type,
          telegramUserId: String(data.telegramUserId),
        },
      },
      create: {
        groupId,
        type: data.type,
        telegramUserId: String(data.telegramUserId),
        note: data.note,
      },
      update: { note: data.note },
    });
  }

  async deleteListEntry(userId: string, groupId: string, entryId: string) {
    const entry = await this.prisma.listEntry.findFirst({ where: { id: entryId, groupId } });
    const perm = entry?.type === 'WHITE' ? PERMISSIONS.WHITELIST_EDIT : PERMISSIONS.BLACKLIST_EDIT;
    await this.assertAccess(userId, groupId, perm);
    await this.prisma.listEntry.deleteMany({ where: { id: entryId, groupId } });
    return { ok: true };
  }

  // ---------- announcements ----------
  async addAnnouncement(userId: string, groupId: string, data: any) {
    await this.assertAccess(userId, groupId, PERMISSIONS.SCHEDULE_MANAGE);
    return this.prisma.announcement.create({
      data: {
        groupId,
        text: data.text,
        enabled: data.enabled ?? true,
        intervalMinutes: data.intervalMinutes ?? 0,
      },
    });
  }

  async deleteAnnouncement(userId: string, groupId: string, id: string) {
    await this.assertAccess(userId, groupId, PERMISSIONS.SCHEDULE_MANAGE);
    await this.prisma.announcement.deleteMany({ where: { id, groupId } });
    return { ok: true };
  }

  // ---------- auto replies ----------
  async addAutoReply(userId: string, groupId: string, data: any) {
    await this.assertAccess(userId, groupId, PERMISSIONS.GROUPS_EDIT);
    return this.prisma.autoReply.create({
      data: {
        groupId,
        trigger: data.trigger,
        match: data.match || 'CONTAINS',
        response: data.response,
        enabled: data.enabled ?? true,
      },
    });
  }

  async deleteAutoReply(userId: string, groupId: string, id: string) {
    await this.assertAccess(userId, groupId, PERMISSIONS.GROUPS_EDIT);
    await this.prisma.autoReply.deleteMany({ where: { id, groupId } });
    return { ok: true };
  }

  // ---------- delete group ----------
  // Bot leaves the chat (best-effort) and the group record + config is removed.
  async remove(userId: string, groupId: string) {
    await this.assertAccess(userId, groupId, PERMISSIONS.GROUPS_DELETE);
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { bot: true },
    });
    if (!group) throw new NotFoundException('group not found');
    if (group.bot) {
      try {
        await this.telegram.leaveChat(group.bot, group.telegramChatId);
      } catch {
        // bot may already be gone / lack permission — delete the record regardless
      }
    }
    await this.prisma.group.delete({ where: { id: groupId } });
    return { ok: true };
  }

  // ---------- logs ----------
  async logs(userId: string, groupId: string, take = 100) {
    await this.assertAccess(userId, groupId, PERMISSIONS.LOGS_VIEW);
    return this.prisma.adminLog.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
