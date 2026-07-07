import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret } from '../common/crypto.util';

// Settings keys (stored in SystemSetting; secret values encrypted at rest).
export const OCR_PROVIDER_KEY = 'ocr.provider';   // 'tesseract' | 'ocrspace'
export const OCR_LANG_KEY = 'ocr.lang';           // e.g. 'eng' or 'eng+chi_sim'
export const OCR_OCRSPACE_KEY = 'ocr.ocrspace_key';
export const OCR_OCRSPACE_USERID_KEY = 'ocr.ocrspace_userid';

/**
 * OCR abstraction. Default provider is the free, local `tesseract.js` (no system
 * binary, no per-request cost). A paid provider (OCR.space) can be switched on
 * from the System settings by storing an API key — accuracy improves with no
 * code change. New providers (Google Vision, Azure, ...) plug in the same way.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private tesseractWorker: any = null;
  private tesseractLang = '';

  constructor(private readonly prisma: PrismaService) {}

  private async setting(key: string): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return '';
    return row.encrypted ? decryptSecret(row.value) : row.value;
  }

  // Recognize text in an image buffer. Never throws — returns '' on failure so
  // it can't break message handling.
  async recognize(image: Buffer): Promise<string> {
    try {
      const provider = (await this.setting(OCR_PROVIDER_KEY)) || 'tesseract';
      if (provider === 'ocrspace') {
        const key =
          (await this.setting(OCR_OCRSPACE_KEY)) ||
          (process.env.OCRSPACE_API_KEY || '').trim();
        if (key) return await this.ocrSpace(image, key);
        this.logger.warn('OCR provider=ocrspace but no API key set; falling back to tesseract');
      }
      return await this.tesseract(image);
    } catch (e: any) {
      this.logger.warn(`OCR failed: ${e?.message || e}`);
      return '';
    }
  }

  // ---- free local provider ----
  private async tesseract(image: Buffer): Promise<string> {
    const lang =
      (await this.setting(OCR_LANG_KEY)) ||
      (process.env.OCR_LANG || '').trim() ||
      'eng';
    // lazy-load and cache a worker; recreate only if the language changed.
    if (!this.tesseractWorker || this.tesseractLang !== lang) {
      if (this.tesseractWorker) {
        try { await this.tesseractWorker.terminate(); } catch { /* ignore */ }
      }
      const { createWorker } = await import('tesseract.js');
      this.tesseractWorker = await createWorker(lang);
      this.tesseractLang = lang;
    }
    const { data } = await this.tesseractWorker.recognize(image);
    return (data?.text || '').trim();
  }

  // ---- paid provider (OCR.space) ----
  private async ocrSpace(image: Buffer, apiKey: string): Promise<string> {
    const base64 = `data:image/jpeg;base64,${image.toString('base64')}`;
    const lang =
      (await this.setting(OCR_LANG_KEY)) ||
      (process.env.OCR_LANG || '').trim() ||
      'eng';
    const form = new URLSearchParams();
    form.set('base64Image', base64);
    form.set('OCREngine', '2');
    form.set('scale', 'true');
    form.set('language', lang);
    const userId =
      (await this.setting(OCR_OCRSPACE_USERID_KEY)) ||
      (process.env.OCRSPACE_USER_ID || '').trim();
    if (userId) form.set('userid', userId);
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const json: any = await res.json();
    if (json?.IsErroredOnProcessing) {
      throw new Error(Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join('; ') : String(json.ErrorMessage));
    }
    const parsed: string = (json?.ParsedResults || [])
      .map((r: any) => r?.ParsedText || '')
      .join('\n')
      .trim();
    return parsed;
  }
}
