/** Shared JWT secret resolution — never fall back to a public default in prod. */
const WEAK = new Set([
  '',
  'dev_secret',
  'change_me',
  'change_me_jwt_secret',
  'change_me_jwt_secret_please',
]);

export function resolveJwtSecret(): string {
  const raw = (process.env.JWT_SECRET || '').trim();
  const isProd = process.env.NODE_ENV === 'production';
  if (!raw || WEAK.has(raw) || raw.toLowerCase().includes('change_me')) {
    if (isProd) {
      throw new Error(
        'JWT_SECRET is missing or weak. Set a strong JWT_SECRET in production before starting the API.',
      );
    }
    // Local/dev only — still avoid the historically public "dev_secret" string.
    return 'local_dev_only_' + (raw || 'insecure');
  }
  if (raw.length < 24 && isProd) {
    throw new Error('JWT_SECRET must be at least 24 characters in production.');
  }
  return raw;
}
