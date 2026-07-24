import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { EngagementOverviewService } from './engagement-overview.service';

@UseGuards(JwtAuthGuard)
@Controller('groups/:groupId/engagement')
export class EngagementController {
  constructor(private readonly overview: EngagementOverviewService) {}

  @Get('overview')
  getOverview(@CurrentUser() u: AuthUser, @Param('groupId') groupId: string) {
    return this.overview.overview(u.userId, groupId);
  }
}
