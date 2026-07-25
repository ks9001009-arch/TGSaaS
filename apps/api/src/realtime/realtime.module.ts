import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeService } from './realtime.service';
import { RealtimeController } from './realtime.controller';
import { resolveJwtSecret } from '../auth/jwt-secret.util';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    }),
  ],
  providers: [RealtimeService],
  controllers: [RealtimeController],
  exports: [RealtimeService],
})
export class RealtimeModule {}
