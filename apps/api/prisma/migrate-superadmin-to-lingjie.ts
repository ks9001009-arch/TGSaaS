/**
 * One-shot: make `lingjie` the sole super-admin, reassign ownership, hard-delete
 * every other super-admin (pikesi, demo, system@platform.local, …).
 *
 * Run inside the API container:
 *   npx ts-node prisma/migrate-superadmin-to-lingjie.ts
 * or compiled:
 *   node -e "require('ts-node/register'); require('./prisma/migrate-superadmin-to-lingjie.ts')"
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TARGET = 'lingjie';
const ALERT_TG = '@ji_labs';

async function main() {
  const beforeAdmins = await prisma.admin.findMany({
    select: { id: true, email: true, isSuperAdmin: true, active: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('[migrate] admins before:', beforeAdmins);

  let lingjie = await prisma.admin.findUnique({ where: { email: TARGET } });
  if (!lingjie) {
    throw new Error(`Admin "${TARGET}" not found. Create/login as lingjie first.`);
  }

  const superRole = await prisma.role.findFirst({
    where: { tenantId: lingjie.tenantId, key: 'SUPER_ADMIN', isSystem: true },
  });

  lingjie = await prisma.admin.update({
    where: { id: lingjie.id },
    data: {
      isSuperAdmin: true,
      active: true,
      telegramUsername: ALERT_TG,
      roleId: superRole?.id ?? lingjie.roleId,
    },
  });
  console.log('[migrate] lingjie locked as sole target super-admin', lingjie.id);

  const others = await prisma.admin.findMany({
    where: {
      OR: [
        { isSuperAdmin: true, id: { not: lingjie.id } },
        { email: { in: ['admin@demo.local', 'system@platform.local'] } },
      ],
    },
  });
  const otherIds = others.map((a) => a.id);
  console.log(
    '[migrate] other supers / demo to wipe:',
    others.map((a) => a.email),
  );

  // Reassign ownership from every other admin in tenant (and specifically other supers)
  const reassignFrom = otherIds.length
    ? otherIds
    : (
        await prisma.admin.findMany({
          where: { tenantId: lingjie.tenantId, id: { not: lingjie.id }, isSuperAdmin: true },
          select: { id: true },
        })
      ).map((a) => a.id);

  if (reassignFrom.length) {
    const bots = await prisma.bot.updateMany({
      where: { ownerAdminId: { in: reassignFrom } },
      data: { ownerAdminId: lingjie.id },
    });
    const ads = await prisma.ad.updateMany({
      where: { ownerAdminId: { in: reassignFrom } },
      data: { ownerAdminId: lingjie.id },
    });
    const buttons = await prisma.marketingButton.updateMany({
      where: { ownerAdminId: { in: reassignFrom } },
      data: { ownerAdminId: lingjie.id },
    });
    const templates = await prisma.messageTemplate.updateMany({
      where: { ownerAdminId: { in: reassignFrom } },
      data: { ownerAdminId: lingjie.id },
    });
    console.log('[migrate] reassigned', { bots: bots.count, ads: ads.count, buttons: buttons.count, templates: templates.count });

    // Merge bindings onto lingjie (skip duplicates)
    const adminBots = await prisma.adminBot.findMany({ where: { adminId: { in: reassignFrom } } });
    for (const row of adminBots) {
      await prisma.adminBot.upsert({
        where: { adminId_botId: { adminId: lingjie.id, botId: row.botId } },
        create: { tenantId: row.tenantId, adminId: lingjie.id, botId: row.botId },
        update: {},
      });
    }
    const adminGroups = await prisma.adminGroup.findMany({ where: { adminId: { in: reassignFrom } } });
    for (const row of adminGroups) {
      await prisma.adminGroup.upsert({
        where: { adminId_groupId: { adminId: lingjie.id, groupId: row.groupId } },
        create: { tenantId: row.tenantId, adminId: lingjie.id, groupId: row.groupId },
        update: {},
      });
    }
    const adminListeners = await prisma.adminListener.findMany({ where: { adminId: { in: reassignFrom } } });
    for (const row of adminListeners) {
      await prisma.adminListener.upsert({
        where: { adminId_accountId: { adminId: lingjie.id, accountId: row.accountId } },
        create: { tenantId: row.tenantId, adminId: lingjie.id, accountId: row.accountId },
        update: {},
      });
    }
  }

  // Also claim any null-owner bots/ads in the same tenant
  await prisma.bot.updateMany({
    where: { tenantId: lingjie.tenantId, ownerAdminId: null },
    data: { ownerAdminId: lingjie.id },
  });
  await prisma.ad.updateMany({
    where: { tenantId: lingjie.tenantId, ownerAdminId: null },
    data: { ownerAdminId: lingjie.id },
  });

  // Hard-delete other supers + known demo accounts
  const wipe = await prisma.admin.findMany({
    where: {
      OR: [
        { isSuperAdmin: true, id: { not: lingjie.id } },
        { email: { in: ['admin@demo.local', 'system@platform.local', 'pikesi'] } },
      ],
    },
    select: { id: true, email: true },
  });
  for (const a of wipe) {
    await prisma.admin.delete({ where: { id: a.id } });
    console.log('[migrate] deleted', a.email);
  }

  // Ensure no other super remains in this tenant
  const remainingSupers = await prisma.admin.findMany({
    where: { isSuperAdmin: true },
    select: { email: true, id: true },
  });
  console.log('[migrate] remaining supers:', remainingSupers);
  if (remainingSupers.length !== 1 || remainingSupers[0].email !== TARGET) {
    throw new Error(`Expected sole super ${TARGET}, got ${JSON.stringify(remainingSupers)}`);
  }

  const ownedBots = await prisma.bot.count({ where: { ownerAdminId: lingjie.id } });
  const ownedAds = await prisma.ad.count({ where: { ownerAdminId: lingjie.id } });
  console.log('[migrate] done. lingjie owns bots=', ownedBots, 'ads=', ownedAds);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
