import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { ButtonsService } from './buttons.service';
import { CreateButtonDto, UpdateButtonDto, ToggleDto, ReorderDto } from './dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('marketing/buttons')
export class ButtonsController {
  constructor(private readonly buttons: ButtonsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MARKETING_VIEW)
  list(@CurrentUser() u: AuthUser) {
    return this.buttons.list(u.userId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BUTTON_MANAGE)
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateButtonDto) {
    return this.buttons.create(u.userId, dto);
  }

  @Patch('reorder')
  @RequirePermissions(PERMISSIONS.BUTTON_MANAGE)
  reorder(@CurrentUser() u: AuthUser, @Body() dto: ReorderDto) {
    return this.buttons.reorder(u.userId, dto.ids);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.BUTTON_MANAGE)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateButtonDto) {
    return this.buttons.update(u.userId, id, dto);
  }

  @Patch(':id/toggle')
  @RequirePermissions(PERMISSIONS.BUTTON_MANAGE)
  toggle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ToggleDto) {
    return this.buttons.toggle(u.userId, id, dto.enabled);
  }

  @Post(':id/copy')
  @RequirePermissions(PERMISSIONS.BUTTON_MANAGE)
  copy(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.buttons.copy(u.userId, id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.BUTTON_MANAGE)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.buttons.remove(u.userId, id);
  }
}
