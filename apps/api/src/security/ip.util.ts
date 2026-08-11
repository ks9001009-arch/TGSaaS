/** Normalize client IP (strip IPv6-mapped IPv4 prefix, trim). */
export function normalizeIp(raw?: string | null): string {
  let ip = (raw || '').trim();
  if (!ip) return 'unknown';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  // X-Forwarded-For may already be split by caller; still strip brackets for IPv6
  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'));
  }
  // strip optional port on IPv4 host:port
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.split(':')[0];
  }
  return ip || 'unknown';
}

/**
 * Resolve the real client IP behind our nginx.
 *
 * Prefer X-Real-IP (nginx sets this to $remote_addr — not spoofable by clients
 * when traffic goes through our reverse proxy). Never trust the leftmost
 * X-Forwarded-For hop (clients can prepend arbitrary values).
 */
export function getClientIp(req: {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  const headers = req.headers || {};
  const real = headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) {
    return normalizeIp(real);
  }
  if (Array.isArray(real) && real[0]) {
    return normalizeIp(real[0]);
  }

  // Fallback: rightmost XFF hop is appended by the trusted proxy.
  const xff = headers['x-forwarded-for'];
  const xffRaw = Array.isArray(xff) ? xff.join(',') : xff;
  if (typeof xffRaw === 'string' && xffRaw.trim()) {
    const parts = xffRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return normalizeIp(parts[parts.length - 1]);
  }

  return normalizeIp(req.ip || req.socket?.remoteAddress);
}

/** Exact match or IPv4 CIDR (e.g. 10.0.0.0/24). */
export function ipMatchesAllowlist(clientIp: string, entries: string[]): boolean {
  const ip = normalizeIp(clientIp);
  for (const entry of entries) {
    const rule = (entry || '').trim();
    if (!rule) continue;
    if (rule.includes('/')) {
      if (ipv4InCidr(ip, rule)) return true;
    } else if (normalizeIp(rule) === ip) {
      return true;
    }
  }
  return false;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToInt(ip);
  const netN = ipv4ToInt(net);
  if (ipN === null || netN === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipN & mask) === (netN & mask);
}
