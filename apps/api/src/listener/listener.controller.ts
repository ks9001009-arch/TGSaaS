import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { ListenerService } from './listener.service';
import {
  CreateAccountDto,
  UpdateAccountDto,
  ConfirmCodeDto,
  PasswordDto,
  SetListenDto,
  BatchListenDto,
  CreateRuleDto,
  UpdateRuleDto,
  CreateTargetDto,
  UpdateTargetDto,
} from './dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('listener')
export class ListenerController {
  constructor(private readonly listener: ListenerService) {}

  // ---- accounts ----
  @Get('accounts')
  @RequirePermissions(PERMISSIONS.LISTENER_VIEW)
  listAccounts(@CurrentUser() u: AuthUser) {
    return this.listener.listAccounts(u.userId);
  }

  @Post('accounts')
  @RequirePermissions(PERMISSIONS.LISTENER_ACCOUNT)
  createAccount(@CurrentUser() u: AuthUser, @Body() dto: CreateAccountDto) {
    return this.listener.createAccount(u.userId, dto);
  }

  @Patch('accounts/:id')
  @RequirePermissions(PERMISSIONS.LISTENER_ACCOUNT)
  updateAccount(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.listener.updateAccount(u.userId, id, dto);
  }

  @Delete('accounts/:id')
  @RequirePermissions(PERMISSIONS.LISTENER_ACCOUNT)
  removeAccount(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.listener.removeAccount(u.userId, id);
  }

  // ---- login flow ----
  @Post('accounts/:id/login/send-code')
  @RequirePermissions(PERMISSIONS.LISTENER_ACCOUNT)
  sendCode(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.listener.sendCode(u.userId, id);
  }

  @Post('accounts/:id/login/confirm')
  @RequirePermissions(PERMISSIONS.LISTENER_ACCOUNT)
  confirm(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ConfirmCodeDto) {
    return this.listener.confirmCode(u.userId, id, dto.code);
  }

  @Post('accounts/:id/login/password')
  @RequirePermissions(PERMISSIONS.LISTENER_ACCOUNT)
  password(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PasswordDto) {
    return this.listener.submitPassword(u.userId, id, dto.password);
  }

  @Post('accounts/:id/relogin')
  @RequirePermissions(PERMISSIONS.LISTENER_ACCOUNT)
  relogin(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.listener.relogin(u.userId, id);
  }

  @Post('accounts/:id/logout')
  @RequirePermissions(PERMISSIONS.LISTENER_ACCOUNT)
  logout(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.listener.logout(u.userId, id);
  }

  @Get('accounts/:id/status')
  @RequirePermissions(PERMISSIONS.LISTENER_VIEW)
  status(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.listener.status(u.userId, id);
  }

  // ---- groups ----
  @Post('accounts/:id/sync-dialogs')
  @RequirePermissions(PERMISSIONS.LISTENER_GROUP)
  syncDialogs(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.listener.syncDialogs(u.userId, id);
  }

  @Get('groups')
  @RequirePermissions(PERMISSIONS.LISTENER_VIEW)
  listGroups(@CurrentUser() u: AuthUser, @Query('accountId') accountId?: string) {
    return this.listener.listGroups(u.userId, accountId);
  }

  @Patch('groups/:id/listen')
  @RequirePermissions(PERMISSIONS.LISTENER_GROUP)
  setListen(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SetListenDto) {
    return this.listener.setListen(u.userId, id, dto.listening);
  }

  @Post('groups/listen/batch')
  @RequirePermissions(PERMISSIONS.LISTENER_GROUP)
  batchListen(@CurrentUser() u: AuthUser, @Body() dto: BatchListenDto) {
    return this.listener.batchListen(u.userId, dto.ids, dto.listening);
  }

  // ---- rules ----
  @Get('rules')
  @RequirePermissions(PERMISSIONS.LISTENER_VIEW)
  listRules(@CurrentUser() u: AuthUser) {
    return this.listener.listRules(u.userId);
  }

  @Post('rules')
  @RequirePermissions(PERMISSIONS.LISTENER_RULE)
  createRule(@CurrentUser() u: AuthUser, @Body() dto: CreateRuleDto) {
    return this.listener.createRule(u.userId, dto);
  }

  @Patch('rules/:id')
  @RequirePermissions(PERMISSIONS.LISTENER_RULE)
  updateRule(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.listener.updateRule(u.userId, id, dto);
  }

  @Delete('rules/:id')
  @RequirePermissions(PERMISSIONS.LISTENER_RULE)
  removeRule(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.listener.removeRule(u.userId, id);
  }

  // ---- push targets ----
  @Get('targets')
  @RequirePermissions(PERMISSIONS.LISTENER_VIEW)
  listTargets(@CurrentUser() u: AuthUser) {
    return this.listener.listTargets(u.userId);
  }

  @Post('targets')
  @RequirePermissions(PERMISSIONS.LISTENER_PUSH)
  createTarget(@CurrentUser() u: AuthUser, @Body() dto: CreateTargetDto) {
    return this.listener.createTarget(u.userId, dto);
  }

  @Patch('targets/:id')
  @RequirePermissions(PERMISSIONS.LISTENER_PUSH)
  updateTarget(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTargetDto) {
    return this.listener.updateTarget(u.userId, id, dto);
  }

  @Delete('targets/:id')
  @RequirePermissions(PERMISSIONS.LISTENER_PUSH)
  removeTarget(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.listener.removeTarget(u.userId, id);
  }

  // ---- hits & stats ----
  @Get('hits')
  @RequirePermissions(PERMISSIONS.LISTENER_STATS)
  listHits(@CurrentUser() u: AuthUser, @Query('limit') limit?: string, @Query('accountId') accountId?: string) {
    return this.listener.listHits(u.userId, limit ? parseInt(limit, 10) : 100, accountId);
  }

  @Get('push-logs')
  @RequirePermissions(PERMISSIONS.LISTENER_STATS)
  listPushLogs(@CurrentUser() u: AuthUser, @Query('limit') limit?: string) {
    return this.listener.listPushLogs(u.userId, limit ? parseInt(limit, 10) : 100);
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.LISTENER_VIEW)
  stats(@CurrentUser() u: AuthUser) {
    return this.listener.stats(u.userId);
  }
}
