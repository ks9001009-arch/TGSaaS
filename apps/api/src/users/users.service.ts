import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const BIND_TTL_SEC = 10 * 60;
const BIND_CODE_PREFIX = 'tg_bind:code:';
const BIND_ADMIN_PREFIX = 'tg_bind:admin:';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

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

  /** Issue a one-time bind code; ownership proven when the same user runs /bind in the bot. */
  async requestTelegramBind(adminId: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId }, select: { id: true } });
    if (!admin) throw new NotFoundException('Account not found');

    const prev = await this.redis.client.get(`${BIND_ADMIN_PREFIX}${adminId}`);
    if (prev) {
      await this.redis.client.del(`${BIND_CODE_PREFIX}${prev}`);
    }

    const code = randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
    await this.redis.client.set(`${BIND_CODE_PREFIX}${code}`, adminId, 'EX', BIND_TTL_SEC);
    await this.redis.client.set(`${BIND_ADMIN_PREFIX}${adminId}`, code, 'EX', BIND_TTL_SEC);

    return {
      code,
      expiresIn: BIND_TTL_SEC,
      command: `/bind ${code}`,
      hint: '在任意已接入本平台的机器人私聊中发送上述命令，或打开 /start bind_<CODE> 深链完成绑定',
    };
  }

  /** Called by the Telegram bot after the user proves ownership in private chat. */
  async completeTelegramBind(
    code: string,
    telegramUserId: string,
    telegramUsername?: string | null,
  ) {
    const normalized = String(code || '')
      .trim()
      .toUpperCase()
      .replace(/^BIND_/, '');
    if (!/^[A-F0-9]{8}$/.test(normalized)) {
      throw new BadRequestException('绑定码无效或已过期');
    }
    const tgId = String(telegramUserId || '').trim();
    if (!/^\d{5,20}$/.test(tgId)) {
      throw new BadRequestException('无效的 Telegram 用户 ID');
    }

    const adminId = await this.redis.client.get(`${BIND_CODE_PREFIX}${normalized}`);
    if (!adminId) {
      throw new BadRequestException('绑定码无效或已过期，请在后台重新获取');
    }

    const existing = await this.prisma.admin.findUnique({ where: { telegramUserId: tgId } });
    if (existing && existing.id !== adminId) {
      throw new ConflictException('该 Telegram 账号已绑定到其他后台账号');
    }

    await this.prisma.admin.update({
      where: { id: adminId },
      data: {
        telegramUserId: tgId,
        telegramUsername: telegramUsername ? String(telegramUsername).slice(0, 64) : null,
      },
    });

    await this.redis.client.del(`${BIND_CODE_PREFIX}${normalized}`, `${BIND_ADMIN_PREFIX}${adminId}`);

    return { ok: true, adminId, telegramUserId: tgId };
  }

  async unbindTelegram(adminId: string) {
    const prev = await this.redis.client.get(`${BIND_ADMIN_PREFIX}${adminId}`);
    if (prev) {
      await this.redis.client.del(`${BIND_CODE_PREFIX}${prev}`, `${BIND_ADMIN_PREFIX}${adminId}`);
    }
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { telegramUserId: null, telegramUsername: null },
    });
    return { telegramUserId: null };
  }
}
