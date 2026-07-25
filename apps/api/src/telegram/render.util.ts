import { InlineKeyboard } from 'grammy';

export interface RenderableButton {
  label: string;
  type: string;
  url?: string | null;
  callbackData?: string | null;
  emoji?: string | null;
  row: number;
  position: number;
}

// Replace welcome placeholders like {first_name}, {group_name}, {username}
export function renderText(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => vars[key] ?? '');
}

/**
 * Normalize button targets so Telegram accepts them as url buttons.
 * - `@username` / `username` → `https://t.me/username`
 * - `t.me/...` → `https://t.me/...`
 * - already `http(s)://` kept as-is
 */
export function normalizeButtonUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(t\.me\/|telegram\.me\/)/i.test(t)) return `https://${t}`;
  if (t.startsWith('@')) return `https://t.me/${t.slice(1)}`;
  // Bare telegram username / invite / joinchat token (no spaces, no scheme)
  if (/^[A-Za-z0-9_]{3,}$/.test(t) || /^[A-Za-z0-9_+/=-]+$/.test(t)) {
    return `https://t.me/${t}`;
  }
  return t;
}

// Build a grammY InlineKeyboard from stored buttons, honoring rows + order.
export function buildKeyboard(buttons: RenderableButton[]): InlineKeyboard | undefined {
  if (!buttons || buttons.length === 0) return undefined;

  const sorted = [...buttons].sort((a, b) =>
    a.row === b.row ? a.position - b.position : a.row - b.row,
  );

  const kb = new InlineKeyboard();
  let currentRow = sorted[0].row;
  for (const b of sorted) {
    if (b.row !== currentRow) {
      kb.row();
      currentRow = b.row;
    }
    const text = b.emoji ? `${b.emoji} ${b.label}` : b.label;
    const url = normalizeButtonUrl(b.url);

    // Prefer real URL jump whenever a link is configured — including SUPPORT
    // ("客服"). Previously SUPPORT always used callback and ignored url, so
    // buttons with a filled Telegram link appeared to do nothing.
    if (url && b.type !== 'CALLBACK') {
      kb.url(text, url);
    } else if (b.type === 'CALLBACK' || b.type === 'SUPPORT') {
      kb.text(text, b.callbackData || `cb:${b.label}`);
    } else {
      kb.text(text, b.callbackData || `cb:${b.label}`);
    }
  }
  return kb;
}
