import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { BotsService } from './bots.service';
import { BotsController } from './bots.controller';

@Module({
  imports: [TelegramModule],
  providers: [BotsService],
  controllers: [BotsController],
})
export class BotsModule {}
