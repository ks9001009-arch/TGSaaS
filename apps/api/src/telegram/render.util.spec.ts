import { normalizeButtonUrl, buildKeyboard } from './render.util';

describe('normalizeButtonUrl', () => {
  it('keeps absolute https urls', () => {
    expect(normalizeButtonUrl('https://t.me/support')).toBe('https://t.me/support');
  });

  it('prefixes t.me and @username', () => {
    expect(normalizeButtonUrl('t.me/support')).toBe('https://t.me/support');
    expect(normalizeButtonUrl('@support_bot')).toBe('https://t.me/support_bot');
    expect(normalizeButtonUrl('support_bot')).toBe('https://t.me/support_bot');
  });

  it('returns null for empty', () => {
    expect(normalizeButtonUrl('')).toBeNull();
    expect(normalizeButtonUrl(null)).toBeNull();
  });
});

describe('buildKeyboard SUPPORT with url', () => {
  it('renders SUPPORT as a url button when url is set', () => {
    const kb = buildKeyboard([
      {
        label: '商务合作及广告位联系',
        type: 'SUPPORT',
        url: 'https://t.me/mycs',
        row: 0,
        position: 0,
      },
    ]);
    expect(kb).toBeTruthy();
    const json = JSON.parse(JSON.stringify(kb));
    const btn = json.inline_keyboard[0][0];
    expect(btn.url).toBe('https://t.me/mycs');
    expect(btn.text).toBe('商务合作及广告位联系');
    expect(btn.callback_data).toBeUndefined();
  });

  it('falls back to callback for SUPPORT without url', () => {
    const kb = buildKeyboard([
      {
        label: '客服',
        type: 'SUPPORT',
        url: '',
        row: 0,
        position: 0,
      },
    ]);
    const json = JSON.parse(JSON.stringify(kb));
    const btn = json.inline_keyboard[0][0];
    expect(btn.callback_data).toBe('cb:客服');
    expect(btn.url).toBeUndefined();
  });
});
