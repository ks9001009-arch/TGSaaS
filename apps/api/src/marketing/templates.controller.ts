import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, UpdateTemplateDto, ToggleDto } from './dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('marketing/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get('meta')
  @RequirePermissions(PERMISSIONS.MARKETING_VIEW)
  meta(@CurrentUser() u: AuthUser) {
    return this.templates.meta(u.userId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.MARKETING_VIEW)
  list(@CurrentUser() u: AuthUser) {
    return this.templates.list(u.userId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MARKETING_VIEW)
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.templates.get(u.userId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.templates.create(u.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(u.userId, id, dto);
  }

  @Patch(':id/toggle')
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  toggle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ToggleDto) {
    return this.templates.toggle(u.userId, id, dto.enabled);
  }

  @Post(':id/copy')
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  copy(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.templates.copy(u.userId, id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.templates.remove(u.userId, id);
  }
}
