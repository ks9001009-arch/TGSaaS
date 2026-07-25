import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { TelegramService } from '../telegram/telegram.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateAdDto, UpdateAdDto, AssignAdDto, SetAdButtonsDto } from './dto';
import { SecurityAlertService } from '../security/security-alert.service';

const PLACEMENTS = ['WELCOME', 'PRIVATE_MENU', 'POST_VERIFY', 'SCHEDULED', 'TEMPLATE'];

@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly telegram: TelegramService,
    private readonly alerts: SecurityAlertService,
  ) {}

  // Sub-admins only ever see/manage ads explicitly assigned to them (ownerAdminId).
  private ownershipWhere(ctx: { isSuper: boolean; tenantId: string; adminId: string }) {
    return ctx.isSuper
      ? { tenantId: ctx.tenantId }
      : { tenantId: ctx.tenantId, ownerAdminId: ctx.adminId };
  }

  private async getOwnedOrThrow(ctx: any, id: string) {
    const ad = await this.prisma.ad.findFirst({ where: { id, ...this.ownershipWhere(ctx) } });
    if (!ad) throw new NotFoundException('广告不存在或无权访问');
    return ad;
  }

  // bot/group assignment must stay inside the caller's scope (compliance).
  private assertBotScope(ctx: any, botId?: string | null) {
    if (!botId) return;
    if (!ctx.isSuper && !ctx.botIds.includes(botId)) {
      throw new ForbiddenException('无权将广告分配给该机器人');
    }
  }
  private assertGroupScope(ctx: any, groupId?: string | null) {
    if (!groupId) return;
    if (!ctx.isSuper && !ctx.groupIds.includes(groupId)) {
      throw new ForbiddenException('无权将广告分配给该群组');
    }
  }

  private sanitizePlacements(input?: string[]): any[] {
    if (!input) return [];
    return input.filter((p) => PLACEMENTS.includes(p));
  }

  // ---------- meta (selectors for the dashboard) ----------
  async meta(userId: string) {
    const ctx = await this.rbac.context(userId);
    const [bots, groups, admins] = await Promise.all([
      this.prisma.bot.findMany({
        where: { tenantId: ctx.tenantId, id: { in: ctx.botIds } },
        select: { id: true, name: true, username: true },
      }),
      this.prisma.group.findMany({
        where: { tenantId: ctx.tenantId, id: { in: ctx.groupIds } },
        select: { id: true, title: true },
      }),
      // only super admins assign ownership to sub-admins
      ctx.isSuper
        ? this.prisma.admin.findMany({
            where: { tenantId: ctx.tenantId, isSuperAdmin: false },
            select: { id: true, email: true, displayName: true },
          })
        : Promise.resolve([]),
    ]);
    return { placements: PLACEMENTS, bots, groups, admins, isSuper: ctx.isSuper };
  }

  // ---------- list / get ----------
  async list(userId: string) {
    const ctx = await this.rbac.context(userId);
    const ads = await this.prisma.ad.findMany({
      where: this.ownershipWhere(ctx),
      include: {
        buttons: { orderBy: [{ row: 'asc' }, { position: 'asc' }] },
        bot: { select: { id: true, name: true, username: true } },
        group: { select: { id: true, title: true } },
        ownerAdmin: { select: { id: true, email: true, displayName: true } },
        _count: { select: { clickLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ads;
  }

  async get(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    const ad = await this.prisma.ad.findFirst({
      where: { id, ...this.ownershipWhere(ctx) },
      include: {
        buttons: { orderBy: [{ row: 'asc' }, { position: 'asc' }] },
        bot: { select: { id: true, name: true, username: true } },
        group: { select: { id: true, title: true } },
        ownerAdmin: { select: { id: true, email: true, displayName: true } },
      },
    });
    if (!ad) throw new NotFoundException('广告不存在或无权访问');
    return ad;
  }

  // ---------- create ----------
  async create(userId: string, dto: CreateAdDto) {
    const ctx = await this.rbac.context(userId);
    this.assertBotScope(ctx, dto.botId);
    this.assertGroupScope(ctx, dto.groupId);

    // ownership: super may assign to any sub-admin in tenant; otherwise self
    let ownerAdminId = ctx.adminId;
    if (dto.ownerAdminId && ctx.isSuper) {
      const owner = await this.prisma.admin.findFirst({
        where: { id: dto.ownerAdminId, tenantId: ctx.tenantId },
      });
      if (!owner) throw new BadRequestException('指定的管理员不存在');
      ownerAdminId = owner.id;
    }

    const ad = await this.prisma.ad.create({
      data: {
        tenantId: ctx.tenantId,
        title: dto.title,
        body: dto.body ?? '',
        enabled: dto.enabled ?? true,
        placements: this.sanitizePlacements(dto.placements),
        botId: dto.botId ?? null,
        groupId: dto.groupId ?? null,
        ownerAdminId,
        intervalMinutes: dto.intervalMinutes ?? 0,
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        buttons: dto.buttons?.length
          ? {
              create: dto.buttons.map((b, i) => ({
                label: b.label,
                url: b.url,
                row: b.row ?? 0,
                position: b.position ?? i,
              })),
            }
          : undefined,
      },
      include: { buttons: true },
    });
    this.alerts.notify({
      tenantId: ctx.tenantId,
      reason: 'AD_CREATE',
      title: '广告已创建',
      detail: `操作者 ${ctx.adminId} 创建广告「${ad.title}」id=${ad.id}`,
    });
    return ad;
  }

  // ---------- update ----------
  async update(userId: string, id: string, dto: UpdateAdDto) {
    const ctx = await this.rbac.context(userId);
    await this.getOwnedOrThrow(ctx, id);
    this.assertBotScope(ctx, dto.botId);
    this.assertGroupScope(ctx, dto.groupId);

    return this.prisma.ad.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        enabled: dto.enabled,
        placements: dto.placements ? this.sanitizePlacements(dto.placements) : undefined,
        botId: dto.botId === undefined ? undefined : dto.botId || null,
        groupId: dto.groupId === undefined ? undefined : dto.groupId || null,
        intervalMinutes: dto.intervalMinutes,
        startAt: dto.startAt === undefined ? undefined : dto.startAt ? new Date(dto.startAt) : null,
        endAt: dto.endAt === undefined ? undefined : dto.endAt ? new Date(dto.endAt) : null,
      },
      include: { buttons: true },
    });
  }

  // ---------- buttons ----------
  async setButtons(userId: string, id: string, dto: SetAdButtonsDto) {
    const ctx = await this.rbac.context(userId);
    await this.getOwnedOrThrow(ctx, id);
    await this.prisma.adButton.deleteMany({ where: { adId: id } });
    if (dto.buttons.length) {
      await this.prisma.adButton.createMany({
        data: dto.buttons.map((b, i) => ({
          adId: id,
          label: b.label,
          url: b.url,
          row: b.row ?? 0,
          position: b.position ?? i,
        })),
      });
    }
    return this.prisma.adButton.findMany({
      where: { adId: id },
      orderBy: [{ row: 'asc' }, { position: 'asc' }],
    });
  }

  // ---------- toggle ----------
  async toggle(userId: string, id: string, enabled: boolean) {
    const ctx = await this.rbac.context(userId);
    await this.getOwnedOrThrow(ctx, id);
    return this.prisma.ad.update({ where: { id }, data: { enabled } });
  }

  // ---------- assign ----------
  async assign(userId: string, id: string, dto: AssignAdDto) {
    const ctx = await this.rbac.context(userId);
    await this.getOwnedOrThrow(ctx, id);

    const data: any = {};
    if (dto.botId !== undefined) {
      if (!this.rbac.has(ctx, PERMISSIONS.AD_ASSIGN_BOT)) {
        throw new ForbiddenException('没有给机器人分配广告的权限');
      }
      this.assertBotScope(ctx, dto.botId);
      data.botId = dto.botId || null;
    }
    if (dto.groupId !== undefined) {
      if (!this.rbac.has(ctx, PERMISSIONS.AD_ASSIGN_GROUP)) {
        throw new ForbiddenException('没有给群组分配广告的权限');
      }
      this.assertGroupScope(ctx, dto.groupId);
      data.groupId = dto.groupId || null;
    }
    if (dto.ownerAdminId !== undefined) {
      this.rbac.assertSuper(ctx); // only super reassigns ownership
      if (dto.ownerAdminId) {
        const owner = await this.prisma.admin.findFirst({
          where: { id: dto.ownerAdminId, tenantId: ctx.tenantId },
        });
        if (!owner) throw new BadRequestException('指定的管理员不存在');
      }
      data.ownerAdminId = dto.ownerAdminId || null;
    }
    return this.prisma.ad.update({ where: { id }, data, include: { buttons: true } });
  }

  // ---------- delete ----------
  async remove(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    await this.getOwnedOrThrow(ctx, id);
    await this.prisma.ad.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- stats ----------
  async stats(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    const ad = await this.prisma.ad.findFirst({
      where: { id, ...this.ownershipWhere(ctx) },
      select: { id: true, title: true, impressions: true, clicks: true },
    });
    if (!ad) throw new NotFoundException('广告不存在或无权访问');

    const [recent, perButton] = await Promise.all([
      this.prisma.adClick.findMany({
        where: { adId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          button: { select: { label: true } },
          bot: { select: { name: true, username: true } },
          group: { select: { title: true } },
        },
      }),
      this.prisma.adButton.findMany({
        where: { adId: id },
        select: { id: true, label: true, clicks: true },
        orderBy: [{ row: 'asc' }, { position: 'asc' }],
      }),
    ]);

    const ctr = ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 10000) / 100 : 0;
    return {
      ad,
      impressions: ad.impressions,
      clicks: ad.clicks,
      ctr, // %
      perButton,
      recentClicks: recent.map((c) => ({
        telegramUserId: c.telegramUserId,
        createdAt: c.createdAt,
        button: c.button?.label ?? null,
        bot: c.bot ? `${c.bot.name} (@${c.bot.username ?? '?'})` : null,
        group: c.group?.title ?? null,
      })),
    };
  }

  // ---------- manual send to a group (compliance enforced) ----------
  async sendNow(userId: string, id: string, groupId: string) {
    const ctx = await this.rbac.context(userId);
    const ad = await this.getOwnedOrThrow(ctx, id);
    // the target group must be in the caller's scope AND in the same tenant
    if (!ctx.isSuper && !ctx.groupIds.includes(groupId)) {
      throw new ForbiddenException('无权向该群组发送广告');
    }
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId: ctx.tenantId },
      include: { bot: true },
    });
    if (!group || !group.bot) throw new NotFoundException('群组不存在');
    if (group.status === 'LEFT') throw new BadRequestException('机器人已不在该群组');

    await this.telegram.sendAdToChat(group.bot, group.telegramChatId, ad.id, group.id);
    this.alerts.notify({
      tenantId: ctx.tenantId,
      reason: 'AD_SEND',
      title: '广告已立即发送',
      detail: `操作者 ${ctx.adminId} 向群 ${group.title || groupId} 发送广告「${ad.title}」`,
    });
    return { ok: true };
  }
}
