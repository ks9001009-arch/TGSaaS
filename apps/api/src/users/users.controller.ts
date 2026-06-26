import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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

  @Patch('telegram')
  bindTelegram(@CurrentUser() u: AuthUser, @Body('telegramUserId') telegramUserId: string) {
    return this.users.bindTelegram(u.userId, telegramUserId || null);
  }
}
