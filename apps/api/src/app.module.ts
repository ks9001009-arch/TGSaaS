import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BotsModule } from './bots/bots.module';
import { AdminsModule } from './admins/admins.module';
import { GroupsModule } from './groups/groups.module';
import { TelegramModule } from './telegram/telegram.module';
import { StatsModule } from './stats/stats.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AdsModule } from './ads/ads.module';
import { MarketingModule } from './marketing/marketing.module';
import { ListenerModule } from './listener/listener.module';
import { SystemModule } from './system/system.module';
import { CollectionModule } from './collection/collection.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RbacModule,
    RealtimeModule,
    RedisModule,
    AuthModule,
    UsersModule,
    BotsModule,
    AdminsModule,
    GroupsModule,
    TelegramModule,
    StatsModule,
    SchedulerModule,
    AdsModule,
    MarketingModule,
    ListenerModule,
    SystemModule,
    CollectionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
