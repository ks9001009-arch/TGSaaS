import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { CollectionService } from './collection.service';
import {
  BulkToggleDto,
  ListSubmissionsQuery,
  SetGroupConfigDto,
  TenantDefaultDto,
} from './dto';

@UseGuards(JwtAuthGuard)
@Controller('collection')
export class CollectionController {
  constructor(private readonly collection: CollectionService) {}

  @Get('submissions')
  list(@CurrentUser() u: AuthUser, @Query() query: ListSubmissionsQuery) {
    return this.collection.listSubmissions(u.userId, query);
  }

  @Get('submissions/:id/screenshot')
  async screenshot(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buf = await this.collection.fetchScreenshot(u.userId, id);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buf);
  }

  @Get('overview')
  overview(@CurrentUser() u: AuthUser) {
    return this.collection.overview(u.userId);
  }

  @Patch('groups/:groupId')
  setGroupConfig(
    @CurrentUser() u: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: SetGroupConfigDto,
  ) {
    return this.collection.setGroupConfig(u.userId, groupId, dto);
  }

  @Post('bulk-toggle')
  bulkToggle(@CurrentUser() u: AuthUser, @Body() dto: BulkToggleDto) {
    return this.collection.bulkToggle(u.userId, dto.enabled);
  }

  @Post('default')
  setDefault(@CurrentUser() u: AuthUser, @Body() dto: TenantDefaultDto) {
    return this.collection.setTenantDefault(u.userId, dto.enabled);
  }
}
