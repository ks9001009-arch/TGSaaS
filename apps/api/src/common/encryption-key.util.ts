/** Shared ENCRYPTION_KEY resolution — never use a public default in production. */
const WEAK = new Set([
  '',
  'change_me',
  'change_me_encryption_key',
  'change_me_encryption_key_use_long_random_string',
  'tg_saas_default_encryption_key_change_me',
]);

export function resolveEncryptionKey(): string {
  const raw = (process.env.ENCRYPTION_KEY || '').trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (!raw || WEAK.has(raw) || raw.toLowerCase().includes('change_me')) {
    if (isProd) {
      throw new Error(
        'ENCRYPTION_KEY is missing or weak. Set a strong ENCRYPTION_KEY (min 24 chars) before starting in production.',
      );
    }
    // Local/dev only — never reuse the historically public fallback string.
    return 'local_dev_only_encryption_key_insecure';
  }
  if (raw.length < 24 && isProd) {
    throw new Error('ENCRYPTION_KEY must be at least 24 characters in production.');
  }
  return raw;
}
