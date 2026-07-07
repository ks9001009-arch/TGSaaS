import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret, maskSecret } from '../common/crypto.util';
import {
  OCR_LANG_KEY,
  OCR_OCRSPACE_KEY,
  OCR_OCRSPACE_USERID_KEY,
  OCR_PROVIDER_KEY,
} from '../ocr/ocr.service';

const KEY_API_ID = 'telegram.api_id';
const KEY_API_HASH = 'telegram.api_hash';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  private async getRaw(key: string): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return '';
    return row.encrypted ? decryptSecret(row.value) : row.value;
  }

  // Public view for the dashboard — never returns the raw API hash.
  async getTelegramApi() {
    const apiId = await this.getRaw(KEY_API_ID);
    const apiHash = await this.getRaw(KEY_API_HASH);
    return {
      apiId: apiId || '',
      apiHashMasked: apiHash ? maskSecret(apiHash) : '',
      configured: !!(apiId && apiHash),
    };
  }

  async setTelegramApi(apiId: string, apiHash?: string) {
    await this.prisma.systemSetting.upsert({
      where: { key: KEY_API_ID },
      create: { key: KEY_API_ID, value: apiId, encrypted: false },
      update: { value: apiId, encrypted: false },
    });

    // Only overwrite the hash when a new (non-empty) value is supplied, so the
    // super admin can edit the API ID without re-typing the secret each time.
    if (apiHash && apiHash.trim()) {
      await this.prisma.systemSetting.upsert({
        where: { key: KEY_API_HASH },
        create: { key: KEY_API_HASH, value: encryptSecret(apiHash.trim()), encrypted: true },
        update: { value: encryptSecret(apiHash.trim()), encrypted: true },
      });
    }
    return this.getTelegramApi();
  }

  async getOcr() {
    const provider = await this.getRaw(OCR_PROVIDER_KEY);
    const lang = await this.getRaw(OCR_LANG_KEY);
    const userId = await this.getRaw(OCR_OCRSPACE_USERID_KEY);
    const apiKey = await this.getRaw(OCR_OCRSPACE_KEY);
    return {
      provider: provider || 'tesseract',
      lang: lang || 'eng',
      ocrspaceUserId: userId || '',
      ocrspaceApiKeyMasked: apiKey ? maskSecret(apiKey) : '',
      configured: provider === 'ocrspace' && !!apiKey,
    };
  }

  async setOcr(dto: {
    provider?: string;
    lang?: string;
    ocrspaceUserId?: string;
    ocrspaceApiKey?: string;
  }) {
    if (dto.provider !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: { key: OCR_PROVIDER_KEY },
        create: { key: OCR_PROVIDER_KEY, value: dto.provider, encrypted: false },
        update: { value: dto.provider, encrypted: false },
      });
    }
    if (dto.lang !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: { key: OCR_LANG_KEY },
        create: { key: OCR_LANG_KEY, value: dto.lang, encrypted: false },
        update: { value: dto.lang, encrypted: false },
      });
    }
    if (dto.ocrspaceUserId !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: { key: OCR_OCRSPACE_USERID_KEY },
        create: { key: OCR_OCRSPACE_USERID_KEY, value: dto.ocrspaceUserId.trim(), encrypted: false },
        update: { value: dto.ocrspaceUserId.trim(), encrypted: false },
      });
    }
    if (dto.ocrspaceApiKey && dto.ocrspaceApiKey.trim()) {
      await this.prisma.systemSetting.upsert({
        where: { key: OCR_OCRSPACE_KEY },
        create: { key: OCR_OCRSPACE_KEY, value: encryptSecret(dto.ocrspaceApiKey.trim()), encrypted: true },
        update: { value: encryptSecret(dto.ocrspaceApiKey.trim()), encrypted: true },
      });
    }
    return this.getOcr();
  }
}
