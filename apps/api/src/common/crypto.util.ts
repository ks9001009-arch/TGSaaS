import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { resolveEncryptionKey } from './encryption-key.util';

// AES-256-GCM symmetric encryption for secrets at rest (Telegram API Hash, bot tokens).
// The Python listener decrypts these with the same algorithm and ENCRYPTION_KEY.
//
//   v1:<base64(iv, 12 bytes)>:<base64(ciphertext || authTag, 16 bytes)>
//
// Key = sha256(ENCRYPTION_KEY) => 32 bytes.

function key(): Buffer {
  return createHash('sha256').update(resolveEncryptionKey(), 'utf8').digest();
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
    // not encrypted (legacy/plain) — return as-is for migration compatibility
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

/** True when value already uses the v1 wire format. */
export function isEncryptedSecret(enc: string): boolean {
  if (!enc) return false;
  const parts = enc.split(':');
  return parts.length === 3 && parts[0] === 'v1';
}

/** Encrypt plaintext bot tokens; leave already-encrypted values unchanged. */
export function encryptBotToken(plainOrEnc: string): string {
  if (!plainOrEnc) return plainOrEnc;
  if (isEncryptedSecret(plainOrEnc)) return plainOrEnc;
  return encryptSecret(plainOrEnc);
}

/** Decrypt bot token for Telegram API use (supports legacy plaintext). */
export function decryptBotToken(enc: string): string {
  return decryptSecret(enc);
}

// Show only the last `keep` chars; mask the rest. For displaying secrets safely.
export function maskSecret(plain: string, keep = 4): string {
  if (!plain) return '';
  if (plain.length <= keep) return '*'.repeat(plain.length);
  return '*'.repeat(Math.max(4, plain.length - keep)) + plain.slice(-keep);
}
