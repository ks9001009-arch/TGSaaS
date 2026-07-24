import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { CheckinService } from './checkin.service';
import { ProfileService } from './profile.service';
import { LeaderboardService } from './leaderboard.service';

@Module({
  providers: [EngagementService, CheckinService, ProfileService, LeaderboardService],
  exports: [EngagementService, CheckinService, ProfileService, LeaderboardService],
})
export class EngagementModule {}
