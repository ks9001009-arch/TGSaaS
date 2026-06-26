import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { BotsService } from './bots.service';
import { CreateBotDto, UpdateBotHomeDto, ChangeTokenDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('bots')
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.bots.list(u.userId);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bots.get(u.userId, id);
  }

  @Get(':id/logs')
  logs(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bots.logs(u.userId, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateBotDto) {
    return this.bots.create(u.userId, dto);
  }

  @Patch(':id/home')
  updateHome(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateBotHomeDto) {
    return this.bots.updateHome(u.userId, id, dto);
  }

  @Patch(':id/token')
  changeToken(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ChangeTokenDto) {
    return this.bots.changeToken(u.userId, id, dto);
  }

  @Post(':id/webhook')
  setWebhook(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bots.setWebhook(u.userId, id);
  }

  @Post(':id/start')
  start(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bots.start(u.userId, id);
  }

  @Post(':id/stop')
  stop(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bots.stop(u.userId, id);
  }

  @Post(':id/restart')
  restart(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bots.restart(u.userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bots.remove(u.userId, id);
  }
}
