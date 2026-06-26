import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async overview(userId: string) {
    const ctx = await this.rbac.context(userId);
    const groups = await this.prisma.group.findMany({
      where: { tenantId: ctx.tenantId, id: { in: ctx.groupIds } },
      select: { id: true, memberCount: true, isActive: true },
    });
    const groupIds = groups.map((g) => g.id);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [bots, todayStats, totals] = await Promise.all([
      this.prisma.bot.findMany({ where: { tenantId: ctx.tenantId, id: { in: ctx.botIds } }, select: { isActive: true } }),
      this.prisma.statDaily.aggregate({
        where: { tenantId: ctx.tenantId, groupId: { in: groupIds }, date: today },
        _sum: { newMembers: true, verified: true, adsBlocked: true, bans: true, welcomeSent: true, buttonClicks: true },
      }),
      this.prisma.statDaily.aggregate({
        where: { tenantId: ctx.tenantId, groupId: { in: groupIds } },
        _sum: { newMembers: true, verified: true, adsBlocked: true, bans: true, buttonClicks: true },
      }),
    ]);

    return {
      groupCount: groups.length,
      activeGroupCount: groups.filter((g) => g.isActive).length,
      memberCount: groups.reduce((s, g) => s + g.memberCount, 0),
      botCount: bots.length,
      onlineBotCount: bots.filter((b) => b.isActive).length,
      today: {
        newMembers: todayStats._sum.newMembers ?? 0,
        verified: todayStats._sum.verified ?? 0,
        adsBlocked: todayStats._sum.adsBlocked ?? 0,
        bans: todayStats._sum.bans ?? 0,
        welcomeSent: todayStats._sum.welcomeSent ?? 0,
        buttonClicks: todayStats._sum.buttonClicks ?? 0,
      },
      total: {
        newMembers: totals._sum.newMembers ?? 0,
        verified: totals._sum.verified ?? 0,
        adsBlocked: totals._sum.adsBlocked ?? 0,
        bans: totals._sum.bans ?? 0,
        buttonClicks: totals._sum.buttonClicks ?? 0,
      },
    };
  }

  // last N days time series for charts
  async timeseries(userId: string, days = 14) {
    const ctx = await this.rbac.context(userId);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const rows = await this.prisma.statDaily.findMany({
      where: { tenantId: ctx.tenantId, groupId: { in: ctx.groupIds }, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    const byDate = new Map<string, any>();
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      const acc = byDate.get(key) || { date: key, newMembers: 0, verified: 0, adsBlocked: 0, bans: 0 };
      acc.newMembers += r.newMembers;
      acc.verified += r.verified;
      acc.adsBlocked += r.adsBlocked;
      acc.bans += r.bans;
      byDate.set(key, acc);
    }

    const out: any[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      out.push(byDate.get(key) || { date: key, newMembers: 0, verified: 0, adsBlocked: 0, bans: 0 });
    }
    return out;
  }
}
