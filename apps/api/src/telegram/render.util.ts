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
    if (b.type === 'CALLBACK' || b.type === 'SUPPORT') {
      kb.text(text, b.callbackData || `cb:${b.label}`);
    } else if (b.url) {
      kb.url(text, b.url);
    } else {
      kb.text(text, b.callbackData || `cb:${b.label}`);
    }
  }
  return kb;
}
