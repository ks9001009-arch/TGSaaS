import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { RbacBootstrapService } from '../rbac/rbac-bootstrap.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  PERMISSIONS,
  DEFAULT_SUBADMIN_PERMISSIONS,
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  PermissionKey,
} from '../rbac/permissions';
import { CreateAdminDto, UpdatePermissionsDto, ToggleActiveDto, UpdateAdminDto, AssignBotDto } from './dto';

@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly rbacBootstrap: RbacBootstrapService,
    private readonly realtime: RealtimeService,
  ) {}

  meta() {
    return { groups: PERMISSION_GROUPS, all: ALL_PERMISSIONS };
  }

  // Normalize a Telegram handle: trim, strip leading @(s), store as "@username".
  private normalizeTgUsername(v?: string | null): string | null {
    if (!v) return null;
    const cleaned = v.trim().replace(/^@+/, '');
    return cleaned ? `@${cleaned}` : null;
  }

  // Effective access for the current admin (frontend show/hide + scope).
  async myAccess(userId: string) {
    const ctx = await this.rbac.context(userId);
    const permissions = ctx.isSuper ? (ALL_PERMISSIONS as string[]) : Array.from(ctx.permissions);
    return {
      isSuper: ctx.isSuper,
      tenantId: ctx.tenantId,
      permissions,
      // every accessible bot carries the same (role-based) permission set
      bots: ctx.botIds.map((botId) => ({ botId, permissions })),
    };
  }

  private async assertCanManage(userId: string, botId?: string) {
    const ctx = await this.rbac.context(userId);
    if (ctx.isSuper) return ctx;
    if (!ctx.permissions.has(PERMISSIONS.ADMINS_MANAGE)) {
      throw new ForbiddenException('没有管理下级管理员的权限');
    }
    if (botId && !ctx.botIds.includes(botId)) {
      throw new ForbiddenException('无权管理该机器人');
    }
    return ctx;
  }

  async list(userId: string, botId: string) {
    const ctx = await this.assertCanManage(userId, botId);
    const bindings = await this.prisma.adminBot.findMany({
      where: { tenantId: ctx.tenantId, botId },
      include: {
        admin: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const subs = bindings.filter((b) => !b.admin.isSuperAdmin); // never list the tenant owner
    // load all bot bindings for these admins so the UI can show/manage them
    const adminIds = subs.map((b) => b.admin.id);
    const allBindings = adminIds.length
      ? await this.prisma.adminBot.findMany({
          where: { tenantId: ctx.tenantId, adminId: { in: adminIds } },
          include: { bot: { select: { id: true, name: true, username: true } } },
        })
      : [];
    const botsByAdmin = new Map<string, any[]>();
    for (const b of allBindings) {
      const arr = botsByAdmin.get(b.adminId) ?? [];
      arr.push(b.bot);
      botsByAdmin.set(b.adminId, arr);
    }

    return subs.map((b) => ({
      id: b.admin.id,
      botId: b.botId,
      active: b.admin.active,
      permissions: (b.admin.role?.permissions ?? []).map((rp) => rp.permission.key),
      bots: botsByAdmin.get(b.admin.id) ?? [],
      admin: {
        id: b.admin.id,
        email: b.admin.email,
        displayName: b.admin.displayName,
        telegramUsername: b.admin.telegramUsername,
      },
    }));
  }

  async create(userId: string, dto: CreateAdminDto) {
    const ctx = await this.assertCanManage(userId, dto.botId);

    const bot = await this.prisma.bot.findFirst({ where: { id: dto.botId, tenantId: ctx.tenantId } });
    if (!bot) throw new NotFoundException('Bot not found');

    const requested = (dto.permissions ?? DEFAULT_SUBADMIN_PERMISSIONS).filter((p) =>
      (ALL_PERMISSIONS as string[]).includes(p),
    ) as PermissionKey[];

    // the login account (username) is globally unique; an account from another
    // tenant cannot be reused
    const existingByEmail = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (existingByEmail && existingByEmail.tenantId !== ctx.tenantId) {
      throw new BadRequestException('该用户名已被其他租户使用');
    }

    let admin = existingByEmail;
    if (!admin) {
      admin = await this.prisma.admin.create({
        data: {
          tenantId: ctx.tenantId,
          email: dto.email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          displayName: dto.displayName || dto.telegramUsername || dto.email,
          telegramUsername: this.normalizeTgUsername(dto.telegramUsername),
          isSuperAdmin: false,
        },
      });
    }

    // per-admin custom role so permissions are individually toggleable
    const role = await this.rbacBootstrap.createCustomRole(ctx.tenantId, admin.id, requested);
    await this.prisma.admin.update({ where: { id: admin.id }, data: { roleId: role.id } });

    const existingBinding = await this.prisma.adminBot.findUnique({
      where: { adminId_botId: { adminId: admin.id, botId: dto.botId } },
    });
    if (existingBinding) throw new BadRequestException('该账号已是此机器人的管理员');

    await this.prisma.adminBot.create({
      data: { tenantId: ctx.tenantId, adminId: admin.id, botId: dto.botId },
    });

    this.realtime.permissionsChanged(admin.id);
    return { id: admin.id, email: admin.email };
  }

  // id = Admin.id (the target sub-admin)
  async updatePermissions(userId: string, id: string, dto: UpdatePermissionsDto) {
    const ctx = await this.assertCanManage(userId);
    const target = await this.assertTargetInScope(ctx.tenantId, id);

    const perms = dto.permissions.filter((p) => (ALL_PERMISSIONS as string[]).includes(p)) as PermissionKey[];
    const role = await this.rbacBootstrap.createCustomRole(ctx.tenantId, target.id, perms);
    if (target.roleId !== role.id) {
      await this.prisma.admin.update({ where: { id: target.id }, data: { roleId: role.id } });
    }
    this.realtime.permissionsChanged(target.id);
    return { ok: true };
  }

  async toggleActive(userId: string, id: string, dto: ToggleActiveDto) {
    const ctx = await this.assertCanManage(userId);
    const target = await this.assertTargetInScope(ctx.tenantId, id);
    const updated = await this.prisma.admin.update({ where: { id: target.id }, data: { active: dto.active } });
    this.realtime.permissionsChanged(target.id);
    return { id: updated.id, active: updated.active };
  }

  async remove(userId: string, id: string) {
    const ctx = await this.assertCanManage(userId);
    const target = await this.assertTargetInScope(ctx.tenantId, id);
    await this.prisma.admin.delete({ where: { id: target.id } });
    this.realtime.permissionsChanged(target.id);
    return { ok: true };
  }

  // Edit profile / reset password.
  async update(userId: string, id: string, dto: UpdateAdminDto) {
    const ctx = await this.assertCanManage(userId);
    const target = await this.assertTargetInScope(ctx.tenantId, id);
    const data: any = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.telegramUsername !== undefined) data.telegramUsername = this.normalizeTgUsername(dto.telegramUsername);
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    const updated = await this.prisma.admin.update({ where: { id: target.id }, data });
    return { id: updated.id, email: updated.email, displayName: updated.displayName };
  }

  async listBots(userId: string, id: string) {
    const ctx = await this.assertCanManage(userId);
    const target = await this.assertTargetInScope(ctx.tenantId, id);
    const bindings = await this.prisma.adminBot.findMany({
      where: { tenantId: ctx.tenantId, adminId: target.id },
      include: { bot: { select: { id: true, name: true, username: true } } },
    });
    return bindings.map((b) => b.bot);
  }

  async assignBot(userId: string, id: string, dto: AssignBotDto) {
    const ctx = await this.assertCanManage(userId, dto.botId);
    const target = await this.assertTargetInScope(ctx.tenantId, id);
    const bot = await this.prisma.bot.findFirst({ where: { id: dto.botId, tenantId: ctx.tenantId } });
    if (!bot) throw new NotFoundException('Bot not found');
    await this.prisma.adminBot.upsert({
      where: { adminId_botId: { adminId: target.id, botId: dto.botId } },
      create: { tenantId: ctx.tenantId, adminId: target.id, botId: dto.botId },
      update: {},
    });
    this.realtime.permissionsChanged(target.id);
    return { ok: true };
  }

  async unassignBot(userId: string, id: string, botId: string) {
    const ctx = await this.assertCanManage(userId, botId);
    const target = await this.assertTargetInScope(ctx.tenantId, id);
    await this.prisma.adminBot.deleteMany({
      where: { tenantId: ctx.tenantId, adminId: target.id, botId },
    });
    this.realtime.permissionsChanged(target.id);
    return { ok: true };
  }

  private async assertTargetInScope(tenantId: string, adminId: string) {
    const admin = await this.prisma.admin.findFirst({ where: { id: adminId, tenantId } });
    if (!admin) throw new NotFoundException('Admin not found');
    if (admin.isSuperAdmin) throw new ForbiddenException('不能修改租户超级管理员');
    return admin;
  }
}
