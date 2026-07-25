import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { normalizeIp } from './ip.util';

@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  private async assertSuper(userId: string) {
    const ctx = await this.rbac.context(userId);
    if (!ctx.isSuper) throw new ForbiddenException('仅超级管理员可操作');
    return ctx;
  }

  async listAllowlist(userId: string) {
    const ctx = await this.assertSuper(userId);
    return this.prisma.adminIpAllowlist.findMany({
      where: { adminId: ctx.adminId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addAllowlist(userId: string, ip: string, label?: string) {
    const ctx = await this.assertSuper(userId);
    const normalized = normalizeIp(ip);
    if (!normalized || normalized === 'unknown') {
      throw new BadRequestException('无效 IP');
    }
    // basic shape check: ipv4 / ipv6 / cidr
    if (!/^[\d.:a-fA-F/]+$/.test(normalized) && !normalized.includes(':')) {
      throw new BadRequestException('IP 格式不正确');
    }
    return this.prisma.adminIpAllowlist.upsert({
      where: { adminId_ip: { adminId: ctx.adminId, ip: normalized } },
      create: { adminId: ctx.adminId, ip: normalized, label: label?.trim() || null },
      update: { label: label?.trim() || null },
    });
  }

  async removeAllowlist(userId: string, id: string) {
    const ctx = await this.assertSuper(userId);
    const row = await this.prisma.adminIpAllowlist.findFirst({
      where: { id, adminId: ctx.adminId },
    });
    if (!row) throw new NotFoundException('记录不存在');
    await this.prisma.adminIpAllowlist.delete({ where: { id } });
    return { ok: true };
  }

  async listLoginAudits(userId: string, limit = 50) {
    const ctx = await this.assertSuper(userId);
    const admin = await this.prisma.admin.findUnique({ where: { id: ctx.adminId } });
    const take = Math.min(Math.max(limit || 50, 1), 200);
    return this.prisma.loginAudit.findMany({
      where: {
        OR: [
          { adminId: ctx.adminId },
          ...(admin ? [{ adminEmail: admin.email }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
