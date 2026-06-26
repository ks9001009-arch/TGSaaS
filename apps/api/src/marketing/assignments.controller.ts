import { Body, Controller, Get, Post, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { AssignmentsService } from './assignments.service';
import { ApplyTemplateDto, ToggleAssignmentDto, OverrideAssignmentDto } from './dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('marketing/assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('groups')
  @RequirePermissions(PERMISSIONS.MARKETING_VIEW)
  groups(
    @CurrentUser() u: AuthUser,
    @Query('templateId') templateId?: string,
    @Query('botId') botId?: string,
  ) {
    return this.assignments.batchGroups(u.userId, templateId, botId);
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.AD_STATS)
  stats(@CurrentUser() u: AuthUser, @Query('templateId') templateId: string) {
    return this.assignments.stats(u.userId, templateId);
  }

  @Post('apply')
  @RequirePermissions(PERMISSIONS.TEMPLATE_APPLY)
  apply(@CurrentUser() u: AuthUser, @Body() dto: ApplyTemplateDto) {
    return this.assignments.apply(u.userId, dto.templateId, dto.groupIds);
  }

  @Post('remove')
  @RequirePermissions(PERMISSIONS.TEMPLATE_UNAPPLY)
  remove(@CurrentUser() u: AuthUser, @Body() dto: ApplyTemplateDto) {
    return this.assignments.remove(u.userId, dto.templateId, dto.groupIds);
  }

  @Patch('toggle')
  @RequirePermissions(PERMISSIONS.TEMPLATE_APPLY)
  toggle(@CurrentUser() u: AuthUser, @Body() dto: ToggleAssignmentDto) {
    return this.assignments.toggle(u.userId, dto.templateId, dto.groupId, dto.enabled);
  }

  @Put('override')
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  override(@CurrentUser() u: AuthUser, @Body() dto: OverrideAssignmentDto) {
    return this.assignments.setOverride(u.userId, dto.templateId, dto.groupId, dto.overrides);
  }
}
