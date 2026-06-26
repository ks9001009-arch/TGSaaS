import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey } from './permissions';

/**
 * Resolved access for a request, always bound to exactly one tenant.
 *
 * Tenant isolation rule: every query in every service must be constrained to
 * `ctx.tenantId` (and, for sub-admins, to `botIds`/`groupIds`). A request can
 * never reference another tenant's rows.
 */
export interface AccessContext {
  adminId: string;
  tenantId: string;
  isSuper: boolean;          // tenant owner => all permissions within the tenant
  permissions: Set<string>;  // permission keys granted by the admin's role
  botIds: string[];          // bots in scope (super => all tenant bots)
  groupIds: string[];        // groups in scope (super => all tenant groups)
  listenerIds: string[];     // listener accounts in scope (super => all tenant)
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  // Recomputed per request so role/permission/binding changes apply immediately.
  async context(adminId: string): Promise<AccessContext> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!admin || !admin.active) {
      throw new ForbiddenException('账号不存在或已停用');
    }
    const tenantId = admin.tenantId;

    if (admin.isSuperAdmin) {
      const [bots, groups, listeners] = await Promise.all([
        this.prisma.bot.findMany({ where: { tenantId }, select: { id: true } }),
        this.prisma.group.findMany({ where: { tenantId }, select: { id: true } }),
        this.prisma.listenerAccount.findMany({ where: { tenantId }, select: { id: true } }),
      ]);
      return {
        adminId,
        tenantId,
        isSuper: true,
        permissions: new Set<string>(), // not consulted for super admins
        botIds: bots.map((b) => b.id),
        groupIds: groups.map((g) => g.id),
        listenerIds: listeners.map((l) => l.id),
      };
    }

    const permissions = new Set<string>(
      (admin.role?.permissions ?? []).map((rp) => rp.permission.key),
    );

    const [adminBots, adminGroups, adminListeners] = await Promise.all([
      this.prisma.adminBot.findMany({ where: { adminId, tenantId }, select: { botId: true } }),
      this.prisma.adminGroup.findMany({ where: { adminId, tenantId }, select: { groupId: true } }),
      this.prisma.adminListener.findMany({ where: { adminId, tenantId }, select: { accountId: true } }),
    ]);
    const botIds = adminBots.map((b) => b.botId);

    // groups in scope = groups of bound bots ∪ explicitly bound groups (all in-tenant)
    const groups = await this.prisma.group.findMany({
      where: {
        tenantId,
        OR: [
          botIds.length ? { botId: { in: botIds } } : { id: '' },
          adminGroups.length ? { id: { in: adminGroups.map((g) => g.groupId) } } : { id: '' },
        ],
      },
      select: { id: true },
    });

    return {
      adminId,
      tenantId,
      isSuper: false,
      permissions,
      botIds,
      groupIds: groups.map((g) => g.id),
      listenerIds: adminListeners.map((l) => l.accountId),
    };
  }

  has(ctx: AccessContext, perm: PermissionKey): boolean {
    return ctx.isSuper || ctx.permissions.has(perm);
  }

  // Bot must be in tenant scope AND admin must hold the permission.
  canBot(ctx: AccessContext, botId: string, perm: PermissionKey): boolean {
    return ctx.botIds.includes(botId) && this.has(ctx, perm);
  }

  assertBot(ctx: AccessContext, botId: string, perm: PermissionKey) {
    if (!this.canBot(ctx, botId, perm)) throw new ForbiddenException('没有该机器人的操作权限');
  }

  canGroup(ctx: AccessContext, groupId: string, perm: PermissionKey): boolean {
    return ctx.groupIds.includes(groupId) && this.has(ctx, perm);
  }

  assertGroup(ctx: AccessContext, groupId: string, perm: PermissionKey) {
    if (!this.canGroup(ctx, groupId, perm)) throw new ForbiddenException('没有该群组的操作权限');
  }

  canListener(ctx: AccessContext, accountId: string, perm: PermissionKey): boolean {
    return ctx.listenerIds.includes(accountId) && this.has(ctx, perm);
  }

  assertListener(ctx: AccessContext, accountId: string, perm: PermissionKey) {
    if (!this.canListener(ctx, accountId, perm)) throw new ForbiddenException('没有该监听账号的操作权限');
  }

  assertSuper(ctx: AccessContext) {
    if (!ctx.isSuper) throw new ForbiddenException('需要租户超级管理员权限');
  }
}
