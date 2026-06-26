import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AdsService } from './ads.service';
import {
  CreateAdDto,
  UpdateAdDto,
  AssignAdDto,
  SetAdButtonsDto,
  ToggleAdDto,
  SendAdDto,
} from './dto';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  @Get('meta')
  @RequirePermissions(PERMISSIONS.AD_VIEW)
  meta(@CurrentUser() u: AuthUser) {
    return this.ads.meta(u.userId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AD_VIEW)
  list(@CurrentUser() u: AuthUser) {
    return this.ads.list(u.userId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AD_VIEW)
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.ads.get(u.userId, id);
  }

  @Get(':id/stats')
  @RequirePermissions(PERMISSIONS.AD_STATS)
  stats(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.ads.stats(u.userId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AD_CREATE)
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAdDto) {
    return this.ads.create(u.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AD_EDIT)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAdDto) {
    return this.ads.update(u.userId, id, dto);
  }

  @Put(':id/buttons')
  @RequirePermissions(PERMISSIONS.AD_EDIT)
  buttons(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SetAdButtonsDto) {
    return this.ads.setButtons(u.userId, id, dto);
  }

  @Patch(':id/toggle')
  @RequirePermissions(PERMISSIONS.AD_TOGGLE)
  toggle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ToggleAdDto) {
    return this.ads.toggle(u.userId, id, dto.enabled);
  }

  // assign enforces AD_ASSIGN_BOT / AD_ASSIGN_GROUP per-field inside the service
  @Patch(':id/assign')
  assign(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AssignAdDto) {
    return this.ads.assign(u.userId, id, dto);
  }

  @Post(':id/send')
  @RequirePermissions(PERMISSIONS.AD_EDIT)
  send(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SendAdDto) {
    return this.ads.sendNow(u.userId, id, dto.groupId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.AD_DELETE)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.ads.remove(u.userId, id);
  }
}
