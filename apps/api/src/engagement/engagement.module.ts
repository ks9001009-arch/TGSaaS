import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { CheckinService } from './checkin.service';
import { ProfileService } from './profile.service';

@Module({
  providers: [EngagementService, CheckinService, ProfileService],
  exports: [EngagementService, CheckinService, ProfileService],
})
export class EngagementModule {}
