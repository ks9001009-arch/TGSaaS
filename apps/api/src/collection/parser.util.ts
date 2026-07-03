// Parse Instagram / TikTok usernames out of free text.
//
// Supported formats:
//   Instagram: "IG: name", "Instagram: name", "INS name", "@name",
//              "instagram.com/name", "https://www.instagram.com/name"
//   TikTok:    "TK: name", "TikTok: name", "tiktok.com/@name",
//              "https://www.tiktok.com/@name"

export type Platform = 'INSTAGRAM' | 'TIKTOK';

export interface ParsedAccount {
  platform: Platform;
  username: string;
  normalizedUsername: string;
}

const USERNAME = '[A-Za-z0-9._]+';

const KEYWORD_RE = /\b(ig|instagram|ins|tk|tiktok)\b/i;

const INSTAGRAM_URL_RE = new RegExp(
  `(?:https?://)?(?:www\\.)?instagram\\.com/(${USERNAME})`,
  'gi',
);
const TIKTOK_URL_RE = new RegExp(
  `(?:https?://)?(?:www\\.)?tiktok\\.com/@?(${USERNAME})`,
  'gi',
);
const IG_PREFIX_RE = new RegExp(
  `\\b(?:instagram|ins|ig)\\b[\\s:：\\-> ]*@?(${USERNAME})`,
  'gi',
);
const TK_PREFIX_RE = new RegExp(
  `\\b(?:tiktok|tk)\\b[\\s:：\\-> ]*@?(${USERNAME})`,
  'gi',
);
const AT_USERNAME_RE = new RegExp(`@(${USERNAME})`, 'g');

// URL path words that are never usernames.
const RESERVED = new Set([
  'com', 'www', 'http', 'https', 'p', 'reel', 'reels', 'tv',
  'explore', 'stories', 'video', 't', 'share',
]);

export function hasPlatformKeyword(text?: string | null): boolean {
  if (!text) return false;
  const lowered = text.toLowerCase();
  if (lowered.includes('instagram.com') || lowered.includes('tiktok.com')) return true;
  return KEYWORD_RE.test(text);
}

export function normalizeUsername(username: string): string {
  if (!username) return '';
  let u = username.trim();
  if (u.startsWith('@')) u = u.slice(1);
  // strip surrounding punctuation
  u = u.replace(/^[.,;:!?)('"]+/, '').replace(/[.,;:!?)('"]+$/, '');
  return u.toLowerCase();
}

function isValid(username: string): boolean {
  const n = normalizeUsername(username);
  if (n.length < 2) return false;
  if (RESERVED.has(n)) return false;
  return true;
}

function cleanUsername(raw: string): string {
  let u = raw.trim();
  if (u.startsWith('@')) u = u.slice(1);
  return u.replace(/^[.,;:!?)('"]+/, '').replace(/[.,;:!?)('"]+$/, '');
}

function add(
  out: ParsedAccount[],
  seen: Set<string>,
  platform: Platform,
  raw: string,
): void {
  if (!isValid(raw)) return;
  const normalizedUsername = normalizeUsername(raw);
  const key = `${platform}:${normalizedUsername}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ platform, username: cleanUsername(raw), normalizedUsername });
}

// Extract every IG/TK account mentioned in the text.
export function extractAccounts(text?: string | null): ParsedAccount[] {
  const out: ParsedAccount[] = [];
  if (!text) return out;
  const seen = new Set<string>();
  let working = text;

  for (const m of working.matchAll(INSTAGRAM_URL_RE)) add(out, seen, 'INSTAGRAM', m[1]);
  working = working.replace(INSTAGRAM_URL_RE, ' ');

  for (const m of working.matchAll(TIKTOK_URL_RE)) add(out, seen, 'TIKTOK', m[1]);
  working = working.replace(TIKTOK_URL_RE, ' ');

  for (const m of working.matchAll(IG_PREFIX_RE)) add(out, seen, 'INSTAGRAM', m[1]);
  working = working.replace(IG_PREFIX_RE, ' ');

  for (const m of working.matchAll(TK_PREFIX_RE)) add(out, seen, 'TIKTOK', m[1]);
  working = working.replace(TK_PREFIX_RE, ' ');

  const lowered = text.toLowerCase();
  const defaultPlatform: Platform =
    lowered.includes('tiktok') || /\btk\b/.test(lowered) ? 'TIKTOK' : 'INSTAGRAM';
  for (const m of working.matchAll(AT_USERNAME_RE)) add(out, seen, defaultPlatform, m[1]);

  return out;
}

// For private queries: like extractAccounts, but falls back to treating the
// whole trimmed text as a bare username (platform-agnostic) when nothing
// structured is found.
export function extractQuery(
  text?: string | null,
): Array<{ platform: Platform | null; username: string; normalizedUsername: string }> {
  const accounts = extractAccounts(text);
  if (accounts.length) return accounts;
  if (!text) return [];
  const candidate = text.trim();
  if (new RegExp(`^${USERNAME}$`).test(candidate) && isValid(candidate)) {
    return [
      {
        platform: null,
        username: cleanUsername(candidate),
        normalizedUsername: normalizeUsername(candidate),
      },
    ];
  }
  return [];
}

export function platformLabel(platform: Platform | null | undefined): string {
  if (platform === 'INSTAGRAM') return 'Instagram';
  if (platform === 'TIKTOK') return 'TikTok';
  return '未知';
}
