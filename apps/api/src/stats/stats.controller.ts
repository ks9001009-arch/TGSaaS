import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { StatsService } from './stats.service';

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview(@CurrentUser() u: AuthUser) {
    return this.stats.overview(u.userId);
  }

  @Get('timeseries')
  timeseries(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    return this.stats.timeseries(u.userId, days ? parseInt(days, 10) : 14);
  }
}
