import { Body, Controller, Headers, Param, Post, HttpCode, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  // Telegram posts updates here: /webhook/:botId
  @Post(':botId')
  @HttpCode(200)
  async receive(
    @Param('botId') botId: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string,
    @Body() update: any,
  ) {
    const record = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!record || !record.isActive) return { ok: false };
    if (record.webhookSecret !== secret) return { ok: false };

    // process asynchronously; always 200 so Telegram does not retry-storm
    this.telegram.handleUpdate(record, update).catch((e: any) => {
      this.logger.error(
        `handleUpdate failed: bot=${botId} update_id=${update?.update_id} error=${e?.message || e}`,
        e?.stack,
      );
    });
    return { ok: true };
  }
}
