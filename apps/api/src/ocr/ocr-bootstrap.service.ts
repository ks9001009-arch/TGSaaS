import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret } from '../common/crypto.util';
import {
  OCR_LANG_KEY,
  OCR_OCRSPACE_KEY,
  OCR_OCRSPACE_USERID_KEY,
  OCR_PROVIDER_KEY,
} from './ocr.service';

/**
 * On boot, sync OCR settings from environment variables into SystemSetting.
 * This lets you rotate credentials via Render/Docker env without touching code.
 */
@Injectable()
export class OcrBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(OcrBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.syncFromEnv().catch((e) =>
      this.logger.warn(`OCR env bootstrap skipped: ${e?.message || e}`),
    );
  }

  async syncFromEnv() {
    const provider = (process.env.OCR_PROVIDER || '').trim();
    const apiKey = (process.env.OCRSPACE_API_KEY || '').trim();
    const userId = (process.env.OCRSPACE_USER_ID || '').trim();
    const lang = (process.env.OCR_LANG || '').trim();

    if (!provider && !apiKey && !userId && !lang) return;

    if (provider) await this.upsert(OCR_PROVIDER_KEY, provider, false);
    if (lang) await this.upsert(OCR_LANG_KEY, lang, false);
    if (userId) await this.upsert(OCR_OCRSPACE_USERID_KEY, userId, false);
    if (apiKey) {
      await this.upsert(OCR_OCRSPACE_KEY, encryptSecret(apiKey), true);
      // If a paid key is supplied but provider omitted, default to ocrspace.
      if (!provider) await this.upsert(OCR_PROVIDER_KEY, 'ocrspace', false);
    }

    this.logger.log('OCR settings synced from environment variables');
  }

  private async upsert(key: string, value: string, encrypted: boolean) {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, encrypted },
      update: { value, encrypted },
    });
  }
}
