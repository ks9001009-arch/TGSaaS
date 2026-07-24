import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { CheckinService } from './checkin.service';
import { ProfileService } from './profile.service';
import { LeaderboardService } from './leaderboard.service';
import { EngagementOverviewService } from './engagement-overview.service';
import { EngagementController } from './engagement.controller';

@Module({
  providers: [
    EngagementService,
    CheckinService,
    ProfileService,
    LeaderboardService,
    EngagementOverviewService,
  ],
  controllers: [EngagementController],
  exports: [EngagementService, CheckinService, ProfileService, LeaderboardService],
})
export class EngagementModule {}
