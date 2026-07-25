import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { EngagementOverviewService } from './engagement-overview.service';
import { LotteryService, UpsertLotteryConfigInput } from './lottery.service';

@UseGuards(JwtAuthGuard)
@Controller('groups/:groupId/engagement')
export class EngagementController {
  constructor(
    private readonly overview: EngagementOverviewService,
    private readonly lottery: LotteryService,
  ) {}

  @Get('overview')
  getOverview(@CurrentUser() u: AuthUser, @Param('groupId') groupId: string) {
    return this.overview.overview(u.userId, groupId);
  }

  @Get('lottery')
  getLottery(@CurrentUser() u: AuthUser, @Param('groupId') groupId: string) {
    return this.lottery.getConfig(u.userId, groupId);
  }

  @Put('lottery')
  putLottery(
    @CurrentUser() u: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: UpsertLotteryConfigInput,
  ) {
    return this.lottery.upsertConfig(u.userId, groupId, body);
  }
}
