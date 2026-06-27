import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService, AccessContext } from '../rbac/rbac.service';
import { PERMISSIONS } from '../rbac/permissions';
import { ListenerGatewayService } from './listener-gateway.service';
import {
  CreateAccountDto,
  UpdateAccountDto,
  CreateRuleDto,
  UpdateRuleDto,
  CreateTargetDto,
  UpdateTargetDto,
  CreateBotWhitelistDto,
  UpdateBotWhitelistDto,
} from './dto';

@Injectable()
export class ListenerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly gateway: ListenerGatewayService,
  ) {}

  private normalizePhone(v: string): string {
    const digits = (v || '').replace(/[^\d]/g, '');
    return '+' + digits;
  }

  private async accountInScope(ctx: AccessContext, accountId: string) {
    const account = await this.prisma.listenerAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw new NotFoundException('监听账号不存在');
    if (!ctx.isSuper && !ctx.listenerIds.includes(accountId)) {
      throw new ForbiddenException('没有该监听账号的操作权限');
    }
    return account;
  }

  // ---------------- accounts ----------------

  async listAccounts(userId: string) {
    const ctx = await this.rbac.context(userId);
    const where: any = { tenantId: ctx.tenantId };
    if (!ctx.isSuper) where.id = { in: ctx.listenerIds };

    const accounts = await this.prisma.listenerAccount.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { groups: true } } },
    });

    // listening group counts per account
    const listening = await this.prisma.listenerGroup.groupBy({
      by: ['accountId'],
      where: { tenantId: ctx.tenantId, listening: true },
      _count: { _all: true },
    });
    const listenMap = new Map(listening.map((l) => [l.accountId, l._count._all]));

    return accounts.map((a) => ({
      id: a.id,
      phone: a.phone,
      label: a.label,
      loginStatus: a.loginStatus,
      onlineStatus: a.onlineStatus,
      sessionStatus: a.sessionStatus,
      enabled: a.enabled,
      lastConnectedAt: a.lastConnectedAt,
      lastError: a.lastError,
      groupCount: a._count.groups,
      listeningCount: listenMap.get(a.id) ?? 0,
      createdAt: a.createdAt,
    }));
  }

  async createAccount(userId: string, dto: CreateAccountDto) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_ACCOUNT)) {
      throw new ForbiddenException('没有管理监听账号的权限');
    }
    const phone = this.normalizePhone(dto.phone);
    const exists = await this.prisma.listenerAccount.findUnique({
      where: { tenantId_phone: { tenantId: ctx.tenantId, phone } },
    });
    if (exists) throw new ConflictException('该手机号已添加');

    const account = await this.prisma.listenerAccount.create({
      data: {
        tenantId: ctx.tenantId,
        phone,
        label: dto.label || '',
        loginStatus: 'NEW',
        onlineStatus: 'OFFLINE',
        sessionStatus: 'NONE',
      },
    });

    // auto-bind for sub-admins so they can manage what they created
    if (!ctx.isSuper) {
      await this.prisma.adminListener.create({
        data: { tenantId: ctx.tenantId, adminId: ctx.adminId, accountId: account.id },
      });
    }
    return account;
  }

  async updateAccount(userId: string, id: string, dto: UpdateAccountDto) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_ACCOUNT)) {
      throw new ForbiddenException('没有管理监听账号的权限');
    }
    await this.accountInScope(ctx, id);
    const account = await this.prisma.listenerAccount.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
    await this.gateway.reload();
    return account;
  }

  async removeAccount(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_ACCOUNT)) {
      throw new ForbiddenException('没有管理监听账号的权限');
    }
    await this.accountInScope(ctx, id);
    // best-effort: log out + remove the session in the listener first
    await this.gateway.logout(id).catch(() => undefined);
    await this.prisma.listenerAccount.delete({ where: { id } });
    return { ok: true };
  }

  // ---------------- login flow (proxied to the Telethon service) ----------------

  private async assertAccountManage(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_ACCOUNT)) {
      throw new ForbiddenException('没有管理监听账号的权限');
    }
    await this.accountInScope(ctx, id);
  }

  async sendCode(userId: string, id: string) {
    await this.assertAccountManage(userId, id);
    return this.gateway.sendCode(id);
  }
  async confirmCode(userId: string, id: string, code: string) {
    await this.assertAccountManage(userId, id);
    return this.gateway.confirmCode(id, code);
  }
  async submitPassword(userId: string, id: string, password: string) {
    await this.assertAccountManage(userId, id);
    return this.gateway.submitPassword(id, password);
  }
  async relogin(userId: string, id: string) {
    await this.assertAccountManage(userId, id);
    return this.gateway.relogin(id);
  }
  async logout(userId: string, id: string) {
    await this.assertAccountManage(userId, id);
    return this.gateway.logout(id);
  }
  async status(userId: string, id: string) {
    await this.assertAccountManage(userId, id);
    return this.gateway.status(id);
  }

  // ---------------- groups ----------------

  async syncDialogs(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_GROUP)) {
      throw new ForbiddenException('没有管理监听群组的权限');
    }
    await this.accountInScope(ctx, id);
    await this.gateway.syncDialogs(id);
    return this.listGroups(userId, id);
  }

  async listGroups(userId: string, accountId?: string) {
    const ctx = await this.rbac.context(userId);
    const where: any = { tenantId: ctx.tenantId };
    if (!ctx.isSuper) where.accountId = { in: ctx.listenerIds };
    if (accountId) {
      if (!ctx.isSuper && !ctx.listenerIds.includes(accountId)) {
        throw new ForbiddenException('没有该监听账号的操作权限');
      }
      where.accountId = accountId;
    }
    const groups = await this.prisma.listenerGroup.findMany({
      where,
      orderBy: [{ listening: 'desc' }, { title: 'asc' }],
      include: { account: { select: { phone: true, label: true } } },
    });
    return groups.map((g) => ({
      id: g.id,
      accountId: g.accountId,
      accountPhone: g.account?.phone,
      accountLabel: g.account?.label,
      tgChatId: g.tgChatId,
      title: g.title,
      username: g.username,
      type: g.type,
      listening: g.listening,
      lastMessageAt: g.lastMessageAt,
    }));
  }

  async setListen(userId: string, groupId: string, listening: boolean) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_GROUP)) {
      throw new ForbiddenException('没有管理监听群组的权限');
    }
    const group = await this.prisma.listenerGroup.findFirst({
      where: { id: groupId, tenantId: ctx.tenantId },
    });
    if (!group) throw new NotFoundException('群组不存在');
    if (!ctx.isSuper && !ctx.listenerIds.includes(group.accountId)) {
      throw new ForbiddenException('没有该监听账号的操作权限');
    }
    await this.prisma.listenerGroup.update({ where: { id: groupId }, data: { listening } });
    await this.gateway.reload();
    return { ok: true };
  }

  async batchListen(userId: string, ids: string[], listening: boolean) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_GROUP)) {
      throw new ForbiddenException('没有管理监听群组的权限');
    }
    const where: any = { id: { in: ids }, tenantId: ctx.tenantId };
    if (!ctx.isSuper) where.accountId = { in: ctx.listenerIds };
    const res = await this.prisma.listenerGroup.updateMany({ where, data: { listening } });
    await this.gateway.reload();
    return { ok: true, count: res.count };
  }

  // ---------------- keyword rules ----------------

  async listRules(userId: string) {
    const ctx = await this.rbac.context(userId);
    const where: any = { tenantId: ctx.tenantId };
    if (!ctx.isSuper) {
      where.OR = [{ accountId: null }, { accountId: { in: ctx.listenerIds } }];
    }
    return this.prisma.listenerKeywordRule.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  private validateRuleScope(ctx: AccessContext, scope: string, accountId?: string) {
    if ((scope === 'ACCOUNT' || scope === 'GROUP') && accountId) {
      if (!ctx.isSuper && !ctx.listenerIds.includes(accountId)) {
        throw new ForbiddenException('没有该监听账号的操作权限');
      }
    }
    if (scope === 'ACCOUNT' && !accountId) throw new BadRequestException('按账号配置需指定监听账号');
  }

  async createRule(userId: string, dto: CreateRuleDto) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_RULE)) {
      throw new ForbiddenException('没有管理关键词规则的权限');
    }
    this.validateRuleScope(ctx, dto.scope, dto.accountId);
    if (!dto.include?.length) throw new BadRequestException('请至少填写一个包含关键词');
    return this.prisma.listenerKeywordRule.create({
      data: {
        tenantId: ctx.tenantId,
        name: dto.name || '',
        scope: dto.scope,
        accountId: dto.accountId || null,
        chatId: dto.chatId || null,
        include: dto.include,
        exclude: dto.exclude || [],
        regex: dto.regex || null,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async updateRule(userId: string, id: string, dto: UpdateRuleDto) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_RULE)) {
      throw new ForbiddenException('没有管理关键词规则的权限');
    }
    const rule = await this.prisma.listenerKeywordRule.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!rule) throw new NotFoundException('规则不存在');
    const scope = dto.scope ?? rule.scope;
    const accountId = dto.accountId !== undefined ? dto.accountId : rule.accountId ?? undefined;
    this.validateRuleScope(ctx, scope, accountId || undefined);
    const updated = await this.prisma.listenerKeywordRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.accountId !== undefined ? { accountId: dto.accountId || null } : {}),
        ...(dto.chatId !== undefined ? { chatId: dto.chatId || null } : {}),
        ...(dto.include !== undefined ? { include: dto.include } : {}),
        ...(dto.exclude !== undefined ? { exclude: dto.exclude } : {}),
        ...(dto.regex !== undefined ? { regex: dto.regex || null } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
    await this.gateway.reload();
    return updated;
  }

  async removeRule(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_RULE)) {
      throw new ForbiddenException('没有管理关键词规则的权限');
    }
    const rule = await this.prisma.listenerKeywordRule.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!rule) throw new NotFoundException('规则不存在');
    await this.prisma.listenerKeywordRule.delete({ where: { id } });
    await this.gateway.reload();
    return { ok: true };
  }

  // ---------------- push targets ----------------

  async listTargets(userId: string) {
    const ctx = await this.rbac.context(userId);
    return this.prisma.listenerPushTarget.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTarget(userId: string, dto: CreateTargetDto) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_PUSH)) {
      throw new ForbiddenException('没有管理推送目标的权限');
    }
    const target = await this.prisma.listenerPushTarget.create({
      data: {
        tenantId: ctx.tenantId,
        label: dto.label || '',
        type: dto.type,
        chatId: dto.chatId,
        mode: dto.mode || 'PREFER_FORWARD',
        enabled: dto.enabled ?? true,
      },
    });
    await this.gateway.reload();
    return target;
  }

  async updateTarget(userId: string, id: string, dto: UpdateTargetDto) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_PUSH)) {
      throw new ForbiddenException('没有管理推送目标的权限');
    }
    const t = await this.prisma.listenerPushTarget.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!t) throw new NotFoundException('推送目标不存在');
    const updated = await this.prisma.listenerPushTarget.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.chatId !== undefined ? { chatId: dto.chatId } : {}),
        ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
    await this.gateway.reload();
    return updated;
  }

  async removeTarget(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_PUSH)) {
      throw new ForbiddenException('没有管理推送目标的权限');
    }
    const t = await this.prisma.listenerPushTarget.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!t) throw new NotFoundException('推送目标不存在');
    await this.prisma.listenerPushTarget.delete({ where: { id } });
    await this.gateway.reload();
    return { ok: true };
  }

  // ---------------- bot whitelist (forward only bots / listed senders) ----------------

  async listBotWhitelist(userId: string) {
    const ctx = await this.rbac.context(userId);
    return this.prisma.listenerBotWhitelist.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private cleanUsername(v?: string): string | null {
    const s = (v || '').trim().replace(/^@+/, '').toLowerCase();
    return s || null;
  }

  async createBotWhitelist(userId: string, dto: CreateBotWhitelistDto) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_RULE)) {
      throw new ForbiddenException('没有管理监控机器人名单的权限');
    }
    const username = this.cleanUsername(dto.username);
    const uid = (dto.userId || '').trim() || null;
    if (!username && !uid) throw new BadRequestException('请至少填写 @用户名 或 用户ID');
    const row = await this.prisma.listenerBotWhitelist.create({
      data: {
        tenantId: ctx.tenantId,
        label: dto.label || '',
        username,
        userId: uid,
        enabled: dto.enabled ?? true,
      },
    });
    await this.gateway.reload();
    return row;
  }

  async updateBotWhitelist(userId: string, id: string, dto: UpdateBotWhitelistDto) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_RULE)) {
      throw new ForbiddenException('没有管理监控机器人名单的权限');
    }
    const row = await this.prisma.listenerBotWhitelist.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!row) throw new NotFoundException('名单项不存在');
    const updated = await this.prisma.listenerBotWhitelist.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.username !== undefined ? { username: this.cleanUsername(dto.username) } : {}),
        ...(dto.userId !== undefined ? { userId: (dto.userId || '').trim() || null } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
    await this.gateway.reload();
    return updated;
  }

  async removeBotWhitelist(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    if (!this.rbac.has(ctx, PERMISSIONS.LISTENER_RULE)) {
      throw new ForbiddenException('没有管理监控机器人名单的权限');
    }
    const row = await this.prisma.listenerBotWhitelist.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!row) throw new NotFoundException('名单项不存在');
    await this.prisma.listenerBotWhitelist.delete({ where: { id } });
    await this.gateway.reload();
    return { ok: true };
  }

  // ---------------- hits & stats ----------------

  async listHits(userId: string, limit = 100, accountId?: string) {
    const ctx = await this.rbac.context(userId);
    const where: any = { tenantId: ctx.tenantId };
    if (!ctx.isSuper) where.accountId = { in: ctx.listenerIds };
    if (accountId) where.accountId = accountId;
    const hits = await this.prisma.listenerHit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
    return hits;
  }

  async listPushLogs(userId: string, limit = 100) {
    const ctx = await this.rbac.context(userId);
    return this.prisma.listenerPushLog.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  async stats(userId: string) {
    const ctx = await this.rbac.context(userId);
    const accWhere: any = { tenantId: ctx.tenantId };
    if (!ctx.isSuper) accWhere.id = { in: ctx.listenerIds };

    const [accounts, online, listeningGroups, hits, pushed, failed] = await Promise.all([
      this.prisma.listenerAccount.count({ where: accWhere }),
      this.prisma.listenerAccount.count({ where: { ...accWhere, onlineStatus: 'ONLINE' } }),
      this.prisma.listenerGroup.count({
        where: { tenantId: ctx.tenantId, listening: true, ...(ctx.isSuper ? {} : { accountId: { in: ctx.listenerIds } }) },
      }),
      this.prisma.listenerHit.count({
        where: { tenantId: ctx.tenantId, ...(ctx.isSuper ? {} : { accountId: { in: ctx.listenerIds } }) },
      }),
      this.prisma.listenerPushLog.count({ where: { tenantId: ctx.tenantId, status: 'SENT' } }),
      this.prisma.listenerPushLog.count({ where: { tenantId: ctx.tenantId, status: 'FAILED' } }),
    ]);

    return { accounts, online, listeningGroups, hits, pushed, failed };
  }
}
