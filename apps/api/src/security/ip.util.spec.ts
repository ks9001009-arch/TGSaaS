import { ipMatchesAllowlist, normalizeIp } from './ip.util';

describe('ip util', () => {
  it('normalizes mapped ipv4', () => {
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });

  it('matches exact and cidr', () => {
    expect(ipMatchesAllowlist('1.2.3.4', ['1.2.3.4'])).toBe(true);
    expect(ipMatchesAllowlist('1.2.3.9', ['1.2.3.0/24'])).toBe(true);
    expect(ipMatchesAllowlist('1.2.4.9', ['1.2.3.0/24'])).toBe(false);
  });
});
