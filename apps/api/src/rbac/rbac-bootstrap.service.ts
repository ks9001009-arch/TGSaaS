import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PERMISSION_CATALOG,
  ALL_PERMISSIONS,
  DEFAULT_SUBADMIN_PERMISSIONS,
  PermissionKey,
} from './permissions';

/**
 * Idempotent helpers that keep the RBAC catalog and per-tenant roles in sync.
 * Safe to call repeatedly (on boot, on tenant creation, on sub-admin creation).
 */
@Injectable()
export class RbacBootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  // Upsert the global permission catalog.
  async ensurePermissions() {
    for (const p of PERMISSION_CATALOG) {
      await this.prisma.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, label: p.label, category: p.category },
        update: { label: p.label, category: p.category },
      });
    }
  }

  private async permissionIds(keys: PermissionKey[]): Promise<string[]> {
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: keys as string[] } },
      select: { id: true },
    });
    return perms.map((p) => p.id);
  }

  // Replace a role's permissions with exactly the given keys.
  async setRolePermissions(roleId: string, keys: PermissionKey[]) {
    const ids = await this.permissionIds(keys);
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    if (ids.length) {
      await this.prisma.rolePermission.createMany({
        data: ids.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
    }
  }

  // Ensure the two standard roles exist for a tenant. Returns them.
  async ensureTenantRoles(tenantId: string) {
    await this.ensurePermissions();

    const superRole = await this.prisma.role.upsert({
      where: { tenantId_key: { tenantId, key: 'SUPER_ADMIN' } },
      create: { tenantId, key: 'SUPER_ADMIN', name: '超级管理员', isSystem: true },
      update: {},
    });
    await this.setRolePermissions(superRole.id, ALL_PERMISSIONS);

    const botAdminRole = await this.prisma.role.upsert({
      where: { tenantId_key: { tenantId, key: 'BOT_ADMIN' } },
      create: { tenantId, key: 'BOT_ADMIN', name: '机器人管理员', isSystem: true },
      update: {},
    });
    // only seed defaults the first time (don't clobber later edits)
    const existing = await this.prisma.rolePermission.count({ where: { roleId: botAdminRole.id } });
    if (existing === 0) await this.setRolePermissions(botAdminRole.id, DEFAULT_SUBADMIN_PERMISSIONS);

    return { superRole, botAdminRole };
  }

  // Create a dedicated role for a sub-admin so permissions can be toggled per admin.
  async createCustomRole(tenantId: string, adminId: string, keys: PermissionKey[]) {
    const role = await this.prisma.role.upsert({
      where: { tenantId_key: { tenantId, key: `admin-${adminId}` } },
      create: { tenantId, key: `admin-${adminId}`, name: '自定义权限' },
      update: {},
    });
    await this.setRolePermissions(role.id, keys);
    return role;
  }
}
