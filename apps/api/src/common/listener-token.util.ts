/** Shared LISTENER_TOKEN resolution — refuse weak/missing values in production. */
const WEAK = new Set([
  '',
  'change_me',
  'change_me_listener_token',
  'listener',
  'secret',
]);

export function resolveListenerToken(): string {
  const raw = (process.env.LISTENER_TOKEN || '').trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (!raw || WEAK.has(raw) || raw.toLowerCase().includes('change_me')) {
    if (isProd) {
      throw new Error(
        'LISTENER_TOKEN is missing or weak. Set a strong LISTENER_TOKEN (min 24 chars) before starting in production.',
      );
    }
    return 'local_dev_only_listener_token_insecure';
  }
  if (raw.length < 24 && isProd) {
    throw new Error('LISTENER_TOKEN must be at least 24 characters in production.');
  }
  return raw;
}
