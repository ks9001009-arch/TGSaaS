import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from './jwt-secret.util';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // Admin.id
  email: string;
  tenantId: string;
  isSuper: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, tenantId: true, isSuperAdmin: true, active: true },
    });
    if (!admin || !admin.active) {
      throw new UnauthorizedException('Account disabled');
    }
    return {
      userId: admin.id,
      email: admin.email,
      tenantId: admin.tenantId,
      // Always trust DB over JWT claims (prevents stale isSuper after demotion)
      isSuper: admin.isSuperAdmin,
    };
  }
}
