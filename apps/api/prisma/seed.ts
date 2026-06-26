import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Mirror of src/rbac/permissions.ts (inlined so the seed compiles standalone).
const PERMISSION_CATALOG: { key: string; label: string; category: string }[] = [
  { key: 'bot.view', label: '查看机器人', category: 'bot' },
  { key: 'bots.create', label: '创建机器人', category: 'bot' },
  { key: 'bots.delete', label: '删除机器人', category: 'bot' },
  { key: 'bot.start', label: '启动机器人', category: 'bot' },
  { key: 'bot.stop', label: '停止机器人', category: 'bot' },
  { key: 'bot.edit', label: '修改机器人资料', category: 'bot' },
  { key: 'bot.token', label: '更换机器人 Token', category: 'bot' },
  { key: 'groups.view', label: '查看群组', category: 'group' },
  { key: 'groups.edit', label: '编辑群组配置', category: 'group' },
  { key: 'groups.delete', label: '删除群组', category: 'group' },
  { key: 'welcome.edit', label: '欢迎消息', category: 'content' },
  { key: 'verify.edit', label: '进群验证', category: 'content' },
  { key: 'channelGate.edit', label: '关注频道解禁', category: 'content' },
  { key: 'filter.ads', label: '广告过滤', category: 'content' },
  { key: 'filter.links', label: '链接过滤', category: 'content' },
  { key: 'filter.keywords', label: '关键词过滤', category: 'content' },
  { key: 'antiflood.edit', label: '自动禁言 / 防刷屏', category: 'content' },
  { key: 'blacklist.edit', label: '黑名单', category: 'content' },
  { key: 'whitelist.edit', label: '白名单', category: 'content' },
  { key: 'schedule.manage', label: '定时发送', category: 'content' },
  { key: 'stats.view', label: '查看统计', category: 'data' },
  { key: 'logs.view', label: '查看日志', category: 'data' },
  { key: 'ad.view', label: '查看广告', category: 'ad' },
  { key: 'ad.create', label: '创建广告', category: 'ad' },
  { key: 'ad.edit', label: '编辑广告', category: 'ad' },
  { key: 'ad.delete', label: '删除广告', category: 'ad' },
  { key: 'ad.toggle', label: '启用/关闭广告', category: 'ad' },
  { key: 'ad.assignBot', label: '给机器人分配广告', category: 'ad' },
  { key: 'ad.assignGroup', label: '给群组分配广告', category: 'ad' },
  { key: 'ad.stats', label: '查看广告统计', category: 'ad' },
  { key: 'marketing.view', label: '进入营销中心', category: 'marketing' },
  { key: 'button.manage', label: '管理按钮库', category: 'marketing' },
  { key: 'template.manage', label: '管理消息模板', category: 'marketing' },
  { key: 'template.apply', label: '批量应用广告模板', category: 'marketing' },
  { key: 'template.unapply', label: '移除广告模板应用', category: 'marketing' },
  { key: 'listener.view', label: '进入监听中心', category: 'listener' },
  { key: 'listener.account', label: '管理监听账号', category: 'listener' },
  { key: 'listener.group', label: '管理监听群组', category: 'listener' },
  { key: 'listener.rule', label: '管理关键词规则', category: 'listener' },
  { key: 'listener.push', label: '管理推送目标', category: 'listener' },
  { key: 'listener.stats', label: '查看监听统计', category: 'listener' },
  { key: 'admins.manage', label: '管理管理员', category: 'system' },
  { key: 'settings.manage', label: '系统设置', category: 'system' },
];
const BASIC = ['bot.view', 'groups.view', 'stats.view', 'logs.view', 'welcome.edit'];

async function main() {
  // 1) permission catalog (global)
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: p,
      update: { label: p.label, category: p.category },
    });
  }
  const allPerms = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  // 2) default tenant
  let tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!tenant) tenant = await prisma.tenant.create({ data: { name: '平台租户' } });

  // 3) tenant roles
  const superRole = await prisma.role.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'SUPER_ADMIN' } },
    create: { tenantId: tenant.id, key: 'SUPER_ADMIN', name: '超级管理员', isSystem: true },
    update: {},
  });
  const botAdminRole = await prisma.role.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'BOT_ADMIN' } },
    create: { tenantId: tenant.id, key: 'BOT_ADMIN', name: '机器人管理员', isSystem: true },
    update: {},
  });

  async function setRolePerms(roleId: string, keys: string[]) {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: keys.map((k) => ({ roleId, permissionId: idByKey.get(k)! })).filter((r) => r.permissionId),
      skipDuplicates: true,
    });
  }
  await setRolePerms(superRole.id, PERMISSION_CATALOG.map((p) => p.key));
  if ((await prisma.rolePermission.count({ where: { roleId: botAdminRole.id } })) === 0) {
    await setRolePerms(botAdminRole.id, BASIC);
  }

  // 4) demo super admin (owns the .env platform bot's tenant)
  const email = 'admin@demo.local';
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (!existing) {
    await prisma.admin.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: await bcrypt.hash('admin12345', 10),
        displayName: 'Platform Admin',
        isSuperAdmin: true,
        roleId: superRole.id,
      },
    });
    console.log('[seed] created demo super admin: admin@demo.local / admin12345');
  } else {
    console.log('[seed] demo admin already exists, skipping');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
