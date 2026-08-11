import { resolveEncryptionKey } from './encryption-key.util';

describe('resolveEncryptionKey', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('throws in production when key is missing or weak', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = 'tg_saas_default_encryption_key_change_me';
    expect(() => resolveEncryptionKey()).toThrow(/ENCRYPTION_KEY/);
  });

  it('accepts a strong production key', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = 'a-very-long-production-encryption-key';
    expect(resolveEncryptionKey()).toBe('a-very-long-production-encryption-key');
  });
});
