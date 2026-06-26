import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// AES-256-GCM symmetric encryption for secrets at rest (e.g. the Telegram API
// Hash). The Python listener service decrypts these with the same algorithm and
// the same ENCRYPTION_KEY, so the wire format MUST stay stable:
//
//   v1:<base64(iv, 12 bytes)>:<base64(ciphertext || authTag, 16 bytes)>
//
// Key = sha256(ENCRYPTION_KEY || JWT_SECRET || fallback) => 32 bytes.

function key(): Buffer {
  const secret =
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'tg_saas_default_encryption_key_change_me';
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${Buffer.concat([ct, tag]).toString('base64')}`;
}

export function decryptSecret(enc: string): string {
  if (!enc) return '';
  const parts = enc.split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    // not encrypted (legacy/plain) — return as-is
    return enc;
  }
  const iv = Buffer.from(parts[1], 'base64');
  const blob = Buffer.from(parts[2], 'base64');
  const tag = blob.subarray(blob.length - 16);
  const ct = blob.subarray(0, blob.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// Show only the last `keep` chars; mask the rest. For displaying secrets safely.
export function maskSecret(plain: string, keep = 4): string {
  if (!plain) return '';
  if (plain.length <= keep) return '*'.repeat(plain.length);
  return '*'.repeat(Math.max(4, plain.length - keep)) + plain.slice(-keep);
}
