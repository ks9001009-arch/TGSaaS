import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { GroupsService } from './groups.service';

@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.groups.list(u.userId);
  }

  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.groups.detail(u.userId, id);
  }

  @Put(':id/welcome')
  welcome(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.groups.updateWelcome(u.userId, id, body);
  }

  @Put(':id/buttons')
  buttons(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('buttons') buttons: any[]) {
    return this.groups.setButtons(u.userId, id, buttons || []);
  }

  @Put(':id/verification')
  verification(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.groups.updateVerification(u.userId, id, body);
  }

  @Put(':id/channel-gate')
  channelGate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.groups.updateChannelGate(u.userId, id, body);
  }

  @Put(':id/filter')
  filter(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.groups.updateFilter(u.userId, id, body);
  }

  @Put(':id/rules')
  rules(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('text') text: string) {
    return this.groups.updateRules(u.userId, id, text || '');
  }

  @Post(':id/keywords')
  addKeyword(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.groups.addKeyword(u.userId, id, body);
  }

  @Delete(':id/keywords/:keywordId')
  delKeyword(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('keywordId') keywordId: string) {
    return this.groups.deleteKeyword(u.userId, id, keywordId);
  }

  @Post(':id/keywords/import-ads')
  importAds(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.groups.importAdKeywords(u.userId, id);
  }

  @Post(':id/list')
  addList(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.groups.addListEntry(u.userId, id, body);
  }

  @Delete(':id/list/:entryId')
  delList(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('entryId') entryId: string) {
    return this.groups.deleteListEntry(u.userId, id, entryId);
  }

  @Post(':id/announcements')
  addAnn(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.groups.addAnnouncement(u.userId, id, body);
  }

  @Delete(':id/announcements/:annId')
  delAnn(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('annId') annId: string) {
    return this.groups.deleteAnnouncement(u.userId, id, annId);
  }

  @Post(':id/auto-replies')
  addAr(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.groups.addAutoReply(u.userId, id, body);
  }

  @Delete(':id/auto-replies/:arId')
  delAr(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('arId') arId: string) {
    return this.groups.deleteAutoReply(u.userId, id, arId);
  }

  @Get(':id/logs')
  logs(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('take') take?: string) {
    return this.groups.logs(u.userId, id, take ? parseInt(take, 10) : 100);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.groups.remove(u.userId, id);
  }
}
