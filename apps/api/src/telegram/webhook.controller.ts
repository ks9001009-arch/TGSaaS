import { Body, Controller, Headers, Param, Post, HttpCode } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

@Controller('webhook')
export class WebhookController {
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
    this.telegram.handleUpdate(record, update).catch(() => undefined);
    return { ok: true };
  }
}
