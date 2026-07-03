import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { WebhookController } from './webhook.controller';
import { BotBootstrapService } from './bot-bootstrap.service';
import { BotManagerService } from './bot-manager.service';
import { CollectionModule } from '../collection/collection.module';

@Module({
  imports: [CollectionModule],
  providers: [TelegramService, BotBootstrapService, BotManagerService],
  controllers: [WebhookController],
  exports: [TelegramService, BotManagerService],
})
export class TelegramModule {}
