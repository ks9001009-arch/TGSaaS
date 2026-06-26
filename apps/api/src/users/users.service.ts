import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      include: {
        tenant: { select: { id: true, name: true, plan: true } },
        _count: { select: { adminBots: true, adminGroups: true } },
      },
    });
    if (!admin) return null;
    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      isSuper: admin.isSuperAdmin,
      role: admin.isSuperAdmin ? 'SUPER_ADMIN' : 'BOT_ADMIN',
      tenant: admin.tenant,
      locale: admin.locale,
      telegramUserId: admin.telegramUserId,
      telegramUsername: admin.telegramUsername,
      botCount: admin._count.adminBots,
      groupCount: admin._count.adminGroups,
    };
  }

  async updateLocale(adminId: string, locale: string) {
    return this.prisma.admin.update({ where: { id: adminId }, data: { locale } });
  }

  // Bind (or clear) the Telegram user id so the bot can recognize this account
  // when the admin taps "我的群组" in the bot's private chat.
  async bindTelegram(adminId: string, telegramUserId: string | null) {
    const value = telegramUserId ? String(telegramUserId).trim().replace(/^@/, '') : null;
    if (value) {
      const existing = await this.prisma.admin.findUnique({ where: { telegramUserId: value } });
      if (existing && existing.id !== adminId) {
        throw new ConflictException('该 Telegram 账号已绑定到其他后台账号');
      }
    }
    await this.prisma.admin.update({ where: { id: adminId }, data: { telegramUserId: value } });
    return { telegramUserId: value };
  }
}
