import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RbacBootstrapService } from '../rbac/rbac-bootstrap.service';
import { RegisterDto, LoginDto } from './dto';
import { SlidingWindowLimiter } from './rate-limit.util';
import { SecurityAlertService } from '../security/security-alert.service';
import { ipMatchesAllowlist, normalizeIp } from '../security/ip.util';

@Injectable()
export class AuthService {
  // Blunt credential stuffing: 8 attempts / email / 10min + 30 / IP / 10min
  private readonly loginByEmail = new SlidingWindowLimiter(8, 10 * 60 * 1000);
  private readonly loginByIp = new SlidingWindowLimiter(30, 10 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly rbacBootstrap: RbacBootstrapService,
    private readonly alerts: SecurityAlertService,
  ) {}

  private sign(admin: { id: string; email: string; tenantId: string; isSuperAdmin: boolean }) {
    return this.jwt.sign({
      sub: admin.id,
      email: admin.email,
      tenantId: admin.tenantId,
      isSuper: admin.isSuperAdmin,
    });
  }

  private async audit(data: {
    adminEmail: string;
    adminId?: string | null;
    ip: string;
    userAgent?: string;
    success: boolean;
    reason: string;
  }) {
    try {
      await this.prisma.loginAudit.create({
        data: {
          adminEmail: data.adminEmail,
          adminId: data.adminId || null,
          ip: data.ip,
          userAgent: data.userAgent || null,
          success: data.success,
          reason: data.reason,
        },
      });
    } catch {
      // never block login on audit failure
    }
  }

  // Self-service signup => creates a brand new tenant with this account as its
  // super admin. Tenants are fully isolated from one another.
  async register(dto: RegisterDto) {
    // Public self-service registration is disabled by default. Accounts are
    // created by a super admin and handed out. Set ALLOW_REGISTRATION=true to
    // re-enable open signup.
    if (process.env.ALLOW_REGISTRATION !== 'true') {
      throw new ForbiddenException('公开注册已关闭，请联系管理员开通账号');
    }
    const exists = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const tenant = await this.prisma.tenant.create({
      data: { name: dto.displayName ? `${dto.displayName} 的团队` : '我的团队' },
    });
    const { superRole } = await this.rbacBootstrap.ensureTenantRoles(tenant.id);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const admin = await this.prisma.admin.create({
      data: {
        tenantId: tenant.id,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        isSuperAdmin: true,
        roleId: superRole.id,
      },
    });

    return { token: this.sign(admin), user: this.publicUser(admin) };
  }

  async login(dto: LoginDto, clientIp?: string, userAgent?: string) {
    const emailKey = (dto.email || '').trim().toLowerCase();
    const ip = normalizeIp(clientIp);
    const ua = (userAgent || '').slice(0, 500);

    if (!this.loginByEmail.allow(emailKey) || !this.loginByIp.allow(ip)) {
      await this.audit({
        adminEmail: dto.email || emailKey,
        ip,
        userAgent: ua,
        success: false,
        reason: 'RATE_LIMITED',
      });
      this.alerts.notify({
        reason: 'RATE_LIMITED',
        title: '登录爆破限流',
        detail: `账号 ${dto.email} 触发登录频率限制`,
        ip,
      });
      throw new HttpException(
        '登录尝试过于频繁，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const admin = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (!admin || !admin.active) {
      await this.audit({
        adminEmail: dto.email || emailKey,
        adminId: admin?.id,
        ip,
        userAgent: ua,
        success: false,
        reason: admin ? 'INACTIVE' : 'BAD_PASSWORD',
      });
      this.alerts.notify({
        tenantId: admin?.tenantId,
        reason: 'LOGIN_FAIL',
        title: '登录失败',
        detail: `账号 ${dto.email} 登录失败（无效或已停用）`,
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) {
      await this.audit({
        adminEmail: admin.email,
        adminId: admin.id,
        ip,
        userAgent: ua,
        success: false,
        reason: 'BAD_PASSWORD',
      });
      this.alerts.notify({
        tenantId: admin.tenantId,
        reason: 'LOGIN_FAIL',
        title: '登录失败（密码错误）',
        detail: `超管/管理员 ${admin.email} 密码校验失败`,
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Strict IP allowlist for super-admins only
    if (admin.isSuperAdmin) {
      const entries = await this.prisma.adminIpAllowlist.findMany({
        where: { adminId: admin.id },
        select: { ip: true },
      });
      const ips = entries.map((e) => e.ip);

      if (ips.length === 0) {
        // No silent AUTO_PIN: empty allowlist rejects login unless the current IP
        // appears in SUPERADMIN_BOOTSTRAP_IPS (one-time bootstrap for new servers).
        const bootstrap = (process.env.SUPERADMIN_BOOTSTRAP_IPS || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (ip !== 'unknown' && bootstrap.length > 0 && ipMatchesAllowlist(ip, bootstrap)) {
          await this.prisma.adminIpAllowlist.create({
            data: { adminId: admin.id, ip, label: '环境变量引导写入' },
          });
          await this.audit({
            adminEmail: admin.email,
            adminId: admin.id,
            ip,
            userAgent: ua,
            success: true,
            reason: 'BOOTSTRAP_PIN',
          });
          this.alerts.notify({
            tenantId: admin.tenantId,
            reason: 'BOOTSTRAP_PIN',
            title: '超管 IP 已通过引导变量锁定',
            detail: `${admin.email} 白名单为空，已按 SUPERADMIN_BOOTSTRAP_IPS 写入当前 IP`,
            ip,
          });
          return { token: this.sign(admin), user: this.publicUser(admin) };
        }

        await this.audit({
          adminEmail: admin.email,
          adminId: admin.id,
          ip,
          userAgent: ua,
          success: false,
          reason: 'IP_ALLOWLIST_EMPTY',
        });
        this.alerts.notify({
          tenantId: admin.tenantId,
          reason: 'IP_BLOCKED',
          title: '超管登录被拒（IP 白名单为空）',
          detail: `${admin.email} 尚未配置 IP 白名单。请设置 SUPERADMIN_BOOTSTRAP_IPS 或写入 admin_ip_allowlist 后重试`,
          ip,
        });
        throw new ForbiddenException(
          '超管尚未配置 IP 白名单，已拒绝登录。请在服务器设置 SUPERADMIN_BOOTSTRAP_IPS=你的公网IP 后重试一次，或手动写入白名单',
        );
      }

      if (!ipMatchesAllowlist(ip, ips)) {
        await this.audit({
          adminEmail: admin.email,
          adminId: admin.id,
          ip,
          userAgent: ua,
          success: false,
          reason: 'IP_BLOCKED',
        });
        this.alerts.notify({
          tenantId: admin.tenantId,
          reason: 'IP_BLOCKED',
          title: '超管登录被拒（IP 不在白名单）',
          detail: `${admin.email} 尝试从非授权 IP 登录`,
          ip,
        });
        throw new ForbiddenException('当前 IP 未授权，无法登录超管账号');
      }
    }

    await this.audit({
      adminEmail: admin.email,
      adminId: admin.id,
      ip,
      userAgent: ua,
      success: true,
      reason: 'OK',
    });
    return { token: this.sign(admin), user: this.publicUser(admin) };
  }

  publicUser(admin: any) {
    if (!admin) return null;
    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      tenantId: admin.tenantId,
      isSuper: admin.isSuperAdmin,
      role: admin.isSuperAdmin ? 'SUPER_ADMIN' : 'BOT_ADMIN',
      locale: admin.locale,
      telegramUserId: admin.telegramUserId,
    };
  }
}
