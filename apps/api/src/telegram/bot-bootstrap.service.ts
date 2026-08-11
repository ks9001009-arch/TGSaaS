import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { RbacBootstrapService } from '../rbac/rbac-bootstrap.service';
import { encryptBotToken } from '../common/crypto.util';

const SYSTEM_EMAIL = 'system@platform.local';

/**
 * Seeds the platform .env BOT_TOKEN bot (if any) plus the baseline RBAC data:
 * permission catalog, a default tenant, its roles and a super-admin account.
 * Starting bots is handled by BotManager.startAll().
 */
@Injectable()
export class BotBootstrapService {
  private readonly logger = new Logger(BotBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly rbacBootstrap: RbacBootstrapService,
  ) {}

  async ensureEnvBot() {
    const owner = await this.ensureSuperAdmin();

    const token = (process.env.BOT_TOKEN || '').trim();
    if (!token) {
      this.logger.log('BOT_TOKEN not set - no platform bot seeded (add bots from the dashboard instead).');
      return null;
    }
    let identity;
    try {
      identity = await this.telegram.fetchIdentity(token);
    } catch (e: any) {
      this.logger.error(`BOT_TOKEN invalid, skipping seed: ${e.message}`);
      return null;
    }

    const storedToken = encryptBotToken(token);
    const bot = await this.prisma.bot.upsert({
      where: { telegramBotId: identity.id },
      create: {
        tenantId: owner.tenantId,
        ownerAdminId: owner.id,
        token: storedToken,
        name: process.env.BOT_USERNAME?.trim() || identity.name,
        telegramBotId: identity.id,
        username: identity.username,
      },
      update: {
        token: storedToken,
        username: identity.username,
        name: process.env.BOT_USERNAME?.trim() || identity.name,
        isActive: true,
      },
    });
    this.telegram.invalidate(bot.id);
    return bot;
  }

  // Ensure RBAC catalog + a default tenant + a super-admin account exist.
  // Prefers an existing real super admin; otherwise creates the system one.
  async ensureSuperAdmin() {
    await this.rbacBootstrap.ensurePermissions();

    const existing = await this.prisma.admin.findFirst({
      where: { isSuperAdmin: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      // make sure the tenant's roles are present (idempotent)
      await this.rbacBootstrap.ensureTenantRoles(existing.tenantId);
      return existing;
    }

    // create (or reuse) the default tenant
    let tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!tenant) tenant = await this.prisma.tenant.create({ data: { name: '平台租户' } });
    const { superRole } = await this.rbacBootstrap.ensureTenantRoles(tenant.id);

    const admin = await this.prisma.admin.create({
      data: {
        tenantId: tenant.id,
        email: SYSTEM_EMAIL,
        passwordHash: await bcrypt.hash(`system-${Date.now()}`, 10),
        displayName: 'System',
        isSuperAdmin: true,
        roleId: superRole.id,
      },
    });
    this.logger.log('Created system super-admin account and default tenant.');
    return admin;
  }
}
