import { Controller, Sse, Query, UnauthorizedException, MessageEvent } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { RealtimeService } from './realtime.service';
import { resolveJwtSecret } from '../auth/jwt-secret.util';

@Controller('events')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
  ) {}

  // SSE stream. EventSource can't send headers, so the JWT comes via ?token=.
  @Sse()
  stream(@Query('token') token: string): Observable<MessageEvent> {
    let userId: string;
    try {
      const payload: any = this.jwt.verify(token, {
        secret: resolveJwtSecret(),
      });
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('invalid token');
    }

    // keep-alive comment every 25s so proxies don't drop the connection
    const heartbeat = interval(25000).pipe(map(() => ({ data: { type: 'ping' } }) as MessageEvent));
    const events = this.realtime.subscribe(userId).pipe(map((e) => e as MessageEvent));
    return merge(events, heartbeat);
  }
}
