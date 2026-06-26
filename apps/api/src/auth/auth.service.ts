import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RbacBootstrapService } from '../rbac/rbac-bootstrap.service';
import { RegisterDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly rbacBootstrap: RbacBootstrapService,
  ) {}

  private sign(admin: { id: string; email: string; tenantId: string; isSuperAdmin: boolean }) {
    return this.jwt.sign({
      sub: admin.id,
      email: admin.email,
      tenantId: admin.tenantId,
      isSuper: admin.isSuperAdmin,
    });
  }

  // Self-service signup => creates a brand new tenant with this account as its
  // super admin. Tenants are fully isolated from one another.
  async register(dto: RegisterDto) {
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

  async login(dto: LoginDto) {
    const admin = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (!admin || !admin.active) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
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
