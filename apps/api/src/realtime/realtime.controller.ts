import {
  Controller,
  Sse,
  Query,
  Post,
  UnauthorizedException,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { RealtimeService } from './realtime.service';
import { resolveJwtSecret } from '../auth/jwt-secret.util';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';

@Controller('events')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Mint a short-lived SSE ticket (do NOT put the long-lived dashboard JWT in query strings).
   * EventSource cannot set Authorization headers, so the client exchanges Bearer → ticket first.
   */
  @UseGuards(JwtAuthGuard)
  @Post('ticket')
  async ticket(@CurrentUser() u: AuthUser) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: u.userId },
      select: { active: true },
    });
    if (!admin?.active) throw new UnauthorizedException('Account disabled');

    const token = this.jwt.sign(
      { sub: u.userId, purpose: 'sse' },
      { secret: resolveJwtSecret(), expiresIn: '2m' },
    );
    return { token, expiresIn: 120 };
  }

  // SSE stream — accepts only short-lived tickets with purpose=sse.
  @Sse()
  async stream(@Query('token') token: string): Promise<Observable<MessageEvent>> {
    if (!token) throw new UnauthorizedException('missing token');

    let userId: string;
    try {
      const payload: any = this.jwt.verify(token, {
        secret: resolveJwtSecret(),
      });
      if (payload?.purpose !== 'sse' || !payload?.sub) {
        throw new UnauthorizedException('invalid token purpose');
      }
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('invalid token');
    }

    const admin = await this.prisma.admin.findUnique({
      where: { id: userId },
      select: { active: true },
    });
    if (!admin?.active) throw new UnauthorizedException('Account disabled');

    // keep-alive comment every 25s so proxies don't drop the connection
    const heartbeat = interval(25000).pipe(map(() => ({ data: { type: 'ping' } }) as MessageEvent));
    const events = this.realtime.subscribe(userId).pipe(map((e) => e as MessageEvent));
    return merge(events, heartbeat);
  }
}
