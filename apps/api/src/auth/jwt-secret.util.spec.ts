import { resolveJwtSecret } from './jwt-secret.util';

describe('resolveJwtSecret', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('throws in production when secret is missing or weak', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev_secret';
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('accepts a strong production secret', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-very-long-production-secret-key';
    expect(resolveJwtSecret()).toBe('a-very-long-production-secret-key');
  });
});
