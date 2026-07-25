import { Global, Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { SecurityAlertService } from './security-alert.service';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';

@Global()
@Module({
  imports: [TelegramModule],
  providers: [SecurityAlertService, SecurityService],
  controllers: [SecurityController],
  exports: [SecurityAlertService, SecurityService],
})
export class SecurityModule {}
