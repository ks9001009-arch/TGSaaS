import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AdminsService } from './admins.service';
import {
  CreateAdminDto,
  UpdatePermissionsDto,
  ToggleActiveDto,
  UpdateAdminDto,
  AssignBotDto,
} from './dto';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  // available to every authenticated admin (used by the frontend access provider)
  @Get('meta/permissions')
  meta() {
    return this.admins.meta();
  }

  @Get('me/access')
  myAccess(@CurrentUser() u: AuthUser) {
    return this.admins.myAccess(u.userId);
  }

  // everything below requires ADMINS_MANAGE (tenant super admin bypasses via guard)
  @Get()
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  list(@CurrentUser() u: AuthUser, @Query('botId') botId: string) {
    return this.admins.list(u.userId, botId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAdminDto) {
    return this.admins.create(u.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.admins.update(u.userId, id, dto);
  }

  @Patch(':id/permissions')
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  updatePermissions(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdatePermissionsDto) {
    return this.admins.updatePermissions(u.userId, id, dto);
  }

  @Patch(':id/active')
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  toggleActive(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ToggleActiveDto) {
    return this.admins.toggleActive(u.userId, id, dto);
  }

  @Get(':id/bots')
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  listBots(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.admins.listBots(u.userId, id);
  }

  @Post(':id/bots')
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  assignBot(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AssignBotDto) {
    return this.admins.assignBot(u.userId, id, dto);
  }

  @Delete(':id/bots/:botId')
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  unassignBot(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('botId') botId: string) {
    return this.admins.unassignBot(u.userId, id, botId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ADMINS_MANAGE)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.admins.remove(u.userId, id);
  }
}
