import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { CheckinService } from './checkin.service';
import { ProfileService } from './profile.service';
import { LeaderboardService } from './leaderboard.service';
import { EngagementOverviewService } from './engagement-overview.service';
import { LotteryService } from './lottery.service';
import { EngagementController } from './engagement.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  providers: [
    EngagementService,
    CheckinService,
    ProfileService,
    LeaderboardService,
    EngagementOverviewService,
    LotteryService,
  ],
  controllers: [EngagementController],
  exports: [
    EngagementService,
    CheckinService,
    ProfileService,
    LeaderboardService,
    LotteryService,
  ],
})
export class EngagementModule {}
