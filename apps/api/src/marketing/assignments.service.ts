import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // template must be visible to the caller (own / tenant-shared / super).
  private async assertTemplate(ctx: any, templateId: string) {
    const t = await this.prisma.messageTemplate.findFirst({ where: { id: templateId, tenantId: ctx.tenantId } });
    if (!t) throw new NotFoundException('模板不存在');
    if (!ctx.isSuper && t.ownerAdminId && t.ownerAdminId !== ctx.adminId) {
      throw new ForbiddenException('无权操作该模板');
    }
    return t;
  }

  private assertGroupsInScope(ctx: any, groupIds: string[]) {
    if (ctx.isSuper) return;
    const bad = groupIds.filter((g) => !ctx.groupIds.includes(g));
    if (bad.length) throw new ForbiddenException('包含无权管理的群组');
  }

  // Group list for the batch-apply UI, filtered by bot, with applied/enabled flags
  // for the given template. Only the caller's in-scope groups are returned.
  async batchGroups(userId: string, templateId?: string, botId?: string) {
    const ctx = await this.rbac.context(userId);
    const where: any = { tenantId: ctx.tenantId };
    if (!ctx.isSuper) where.id = { in: ctx.groupIds };
    if (botId) where.botId = botId;

    const groups = await this.prisma.group.findMany({
      where,
      select: { id: true, title: true, status: true, isActive: true, memberCount: true, botId: true },
      orderBy: { title: 'asc' },
    });

    let appliedMap = new Map<string, { enabled: boolean; hasOverride: boolean }>();
    if (templateId) {
      const assigns = await this.prisma.templateAssignment.findMany({
        where: { templateId, tenantId: ctx.tenantId, groupId: { in: groups.map((g) => g.id) } },
        select: { groupId: true, enabled: true, overrides: true },
      });
      appliedMap = new Map(
        assigns.map((a) => [
          a.groupId,
          { enabled: a.enabled, hasOverride: !!a.overrides && Object.keys(a.overrides as any).length > 0 },
        ]),
      );
    }

    const bots = await this.prisma.bot.findMany({
      where: { tenantId: ctx.tenantId, id: { in: ctx.botIds } },
      select: { id: true, name: true, username: true },
    });

    return {
      bots,
      groups: groups.map((g) => ({
        ...g,
        applied: appliedMap.has(g.id),
        appliedEnabled: appliedMap.get(g.id)?.enabled ?? false,
        hasOverride: appliedMap.get(g.id)?.hasOverride ?? false,
      })),
    };
  }

  // Apply (enable) a template to a set of groups. Idempotent upsert.
  async apply(userId: string, templateId: string, groupIds: string[]) {
    const ctx = await this.rbac.context(userId);
    await this.assertTemplate(ctx, templateId);
    this.assertGroupsInScope(ctx, groupIds);
    if (!groupIds.length) return { ok: true, count: 0 };

    // confirm groups exist within tenant
    const groups = await this.prisma.group.findMany({
      where: { id: { in: groupIds }, tenantId: ctx.tenantId },
      select: { id: true },
    });
    const valid = new Set(groups.map((g) => g.id));

    let count = 0;
    for (const groupId of groupIds.filter((g) => valid.has(g))) {
      await this.prisma.templateAssignment.upsert({
        where: { templateId_groupId: { templateId, groupId } },
        create: { tenantId: ctx.tenantId, templateId, groupId, enabled: true },
        update: { enabled: true },
      });
      count++;
    }
    return { ok: true, count };
  }

  // Remove the template from a set of groups.
  async remove(userId: string, templateId: string, groupIds: string[]) {
    const ctx = await this.rbac.context(userId);
    await this.assertTemplate(ctx, templateId);
    this.assertGroupsInScope(ctx, groupIds);
    const res = await this.prisma.templateAssignment.deleteMany({
      where: { templateId, tenantId: ctx.tenantId, groupId: { in: groupIds } },
    });
    return { ok: true, count: res.count };
  }

  // Toggle a single group's enable flag for a template.
  async toggle(userId: string, templateId: string, groupId: string, enabled: boolean) {
    const ctx = await this.rbac.context(userId);
    await this.assertTemplate(ctx, templateId);
    this.assertGroupsInScope(ctx, [groupId]);
    await this.prisma.templateAssignment.upsert({
      where: { templateId_groupId: { templateId, groupId } },
      create: { tenantId: ctx.tenantId, templateId, groupId, enabled },
      update: { enabled },
    });
    return { ok: true };
  }

  // Group-level override (disable specific buttons or replace components).
  async setOverride(userId: string, templateId: string, groupId: string, overrides: any) {
    const ctx = await this.rbac.context(userId);
    await this.assertTemplate(ctx, templateId);
    this.assertGroupsInScope(ctx, [groupId]);
    const clean =
      overrides && typeof overrides === 'object'
        ? {
            disabledButtonIds: Array.isArray(overrides.disabledButtonIds) ? overrides.disabledButtonIds : [],
            components: Array.isArray(overrides.components) ? overrides.components : undefined,
          }
        : {};
    const existing = await this.prisma.templateAssignment.findUnique({
      where: { templateId_groupId: { templateId, groupId } },
    });
    if (!existing) throw new BadRequestException('请先将模板应用到该群组');
    await this.prisma.templateAssignment.update({
      where: { templateId_groupId: { templateId, groupId } },
      data: { overrides: clean },
    });
    return { ok: true };
  }

  // Per-group stats for a template: impressions/clicks + recent click detail.
  async stats(userId: string, templateId: string) {
    const ctx = await this.rbac.context(userId);
    await this.assertTemplate(ctx, templateId);

    const assignments = await this.prisma.templateAssignment.findMany({
      where: { templateId, tenantId: ctx.tenantId },
      include: { group: { select: { title: true } } },
      orderBy: { impressions: 'desc' },
    });

    const recent = await this.prisma.templateClick.findMany({
      where: { templateId, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // resolve button + group labels for the recent clicks
    const mbIds = Array.from(new Set(recent.map((r) => r.marketingButtonId).filter(Boolean))) as string[];
    const groupIds = Array.from(new Set(recent.map((r) => r.groupId).filter(Boolean))) as string[];
    const [mbs, groups] = await Promise.all([
      mbIds.length
        ? this.prisma.marketingButton.findMany({ where: { id: { in: mbIds } }, select: { id: true, displayName: true } })
        : Promise.resolve([]),
      groupIds.length
        ? this.prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, title: true } })
        : Promise.resolve([]),
    ]);
    const mbMap = new Map<string, string>(mbs.map((m) => [m.id, m.displayName] as [string, string]));
    const gMap = new Map<string, string>(groups.map((g) => [g.id, g.title] as [string, string]));

    const totals = assignments.reduce(
      (acc, a) => ({ impressions: acc.impressions + a.impressions, clicks: acc.clicks + a.clicks }),
      { impressions: 0, clicks: 0 },
    );

    return {
      totals,
      perGroup: assignments.map((a) => ({
        groupId: a.groupId,
        group: a.group?.title || a.groupId,
        enabled: a.enabled,
        impressions: a.impressions,
        clicks: a.clicks,
        ctr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
      })),
      recentClicks: recent.map((r) => ({
        button: r.marketingButtonId ? mbMap.get(r.marketingButtonId) || '?' : null,
        group: r.groupId ? gMap.get(r.groupId) || r.groupId : null,
        telegramUserId: r.telegramUserId,
        createdAt: r.createdAt,
      })),
    };
  }
}
