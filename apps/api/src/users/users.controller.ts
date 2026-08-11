import { Controller, Delete, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('profile')
  profile(@CurrentUser() u: AuthUser) {
    return this.users.profile(u.userId);
  }

  @Patch('locale')
  setLocale(@CurrentUser() u: AuthUser, @Body('locale') locale: string) {
    return this.users.updateLocale(u.userId, locale || 'zh');
  }

  /** Start proof-of-ownership bind: returns a short-lived code for /bind in the bot. */
  @Post('telegram/bind-request')
  requestBind(@CurrentUser() u: AuthUser) {
    return this.users.requestTelegramBind(u.userId);
  }

  /** Clear Telegram binding (no free-form ID assignment — use bind-request + bot). */
  @Delete('telegram')
  unbindTelegram(@CurrentUser() u: AuthUser) {
    return this.users.unbindTelegram(u.userId);
  }
}
