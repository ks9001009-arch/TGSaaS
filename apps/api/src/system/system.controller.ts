import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireSuper } from '../rbac/require-permissions.decorator';
import { SystemService } from './system.service';
import { SetTelegramApiDto, SetOcrDto } from './dto';

// System Center — platform-global configuration. Telegram API ID/Hash is shared
// by the whole platform and is super-admin-only (sub-admins can't read it).
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('telegram-api')
  @RequireSuper()
  getTelegramApi() {
    return this.system.getTelegramApi();
  }

  @Put('telegram-api')
  @RequireSuper()
  setTelegramApi(@Body() dto: SetTelegramApiDto) {
    return this.system.setTelegramApi(dto.apiId, dto.apiHash);
  }

  @Get('ocr')
  @RequireSuper()
  getOcr() {
    return this.system.getOcr();
  }

  @Put('ocr')
  @RequireSuper()
  setOcr(@Body() dto: SetOcrDto) {
    return this.system.setOcr(dto);
  }
}
