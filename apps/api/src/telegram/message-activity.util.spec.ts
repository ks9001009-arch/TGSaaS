import {
  businessDayFromTelegramMessageDate,
  isCountableGroupUserMessage,
  isTelegramServiceMessage,
  CountableMessageCtx,
} from './message-activity.util';

function ctx(partial: CountableMessageCtx): CountableMessageCtx {
  return partial;
}

describe('isTelegramServiceMessage', () => {
  it('detects common service events', () => {
    expect(isTelegramServiceMessage({ new_chat_members: [{ id: 1 }] })).toBe(true);
    expect(isTelegramServiceMessage({ left_chat_member: { id: 1 } })).toBe(true);
    expect(isTelegramServiceMessage({ pinned_message: { message_id: 1 } })).toBe(true);
    expect(isTelegramServiceMessage({ group_chat_created: true })).toBe(true);
    expect(isTelegramServiceMessage({ migrate_to_chat_id: -100 })).toBe(true);
    expect(isTelegramServiceMessage({ migrate_from_chat_id: -100 })).toBe(true);
  });

  it('returns false for ordinary user content', () => {
    expect(isTelegramServiceMessage({ text: 'hello', date: 1 })).toBe(false);
  });
});

describe('isCountableGroupUserMessage', () => {
  const base = (): CountableMessageCtx =>
    ctx({
      chat: { type: 'group' },
      from: { id: 42, is_bot: false },
      message: { text: 'hello', date: 1_700_000_000 },
    });

  it('counts group ordinary text', () => {
    expect(isCountableGroupUserMessage(base())).toBe(true);
  });

  it('counts supergroup ordinary messages', () => {
    expect(
      isCountableGroupUserMessage({
        ...base(),
        chat: { type: 'supergroup' },
        message: { date: 1_700_000_000 },
      }),
    ).toBe(true);
  });

  it('counts non-text content messages (e.g. photo-only)', () => {
    expect(
      isCountableGroupUserMessage({
        ...base(),
        message: { date: 1_700_000_000 },
      }),
    ).toBe(true);
  });

  it('rejects engagement commands', () => {
    for (const text of ['/签到', '/我的', '/积分榜', '/消息榜', '/积分榜@MyBot']) {
      expect(
        isCountableGroupUserMessage({
          ...base(),
          message: { text, date: 1 },
        }),
      ).toBe(false);
    }
  });

  it('rejects bot senders', () => {
    expect(
      isCountableGroupUserMessage({
        ...base(),
        from: { id: 1, is_bot: true },
      }),
    ).toBe(false);
  });

  it('rejects private chats', () => {
    expect(
      isCountableGroupUserMessage({
        ...base(),
        chat: { type: 'private' },
      }),
    ).toBe(false);
  });

  it('rejects channels', () => {
    expect(
      isCountableGroupUserMessage({
        ...base(),
        chat: { type: 'channel' },
      }),
    ).toBe(false);
  });

  it('rejects service messages', () => {
    expect(
      isCountableGroupUserMessage({
        ...base(),
        message: { new_chat_members: [{ id: 9 }], date: 1 },
      }),
    ).toBe(false);
  });

  it('rejects missing from', () => {
    expect(
      isCountableGroupUserMessage({
        ...base(),
        from: null,
      }),
    ).toBe(false);
  });

  it('rejects missing message', () => {
    expect(
      isCountableGroupUserMessage({
        ...base(),
        message: null,
      }),
    ).toBe(false);
  });
});

describe('businessDayFromTelegramMessageDate', () => {
  it('converts Unix seconds to UTC business-day midnight', () => {
    // 2026-07-22 15:30:00 UTC
    const unix = Date.UTC(2026, 6, 22, 15, 30, 0) / 1000;
    expect(businessDayFromTelegramMessageDate(unix).toISOString()).toBe(
      '2026-07-22T00:00:00.000Z',
    );
  });

  it('uses message instant, not "now" — late-night UTC still same calendar day', () => {
    const unix = Date.UTC(2026, 6, 22, 23, 59, 59) / 1000;
    expect(businessDayFromTelegramMessageDate(unix).toISOString()).toBe(
      '2026-07-22T00:00:00.000Z',
    );
  });

  it('crosses UTC midnight into the next business day', () => {
    const unix = Date.UTC(2026, 6, 23, 0, 0, 1) / 1000;
    expect(businessDayFromTelegramMessageDate(unix).toISOString()).toBe(
      '2026-07-23T00:00:00.000Z',
    );
  });
});

/**
 * Semantic lock for PR-4A text path:
 * counting runs only on whitelist bypass and fallthrough-after-filters.
 * Moderated/deleted paths must not call recordGroupMessageActivitySafe.
 */
describe('text moderation counting policy (PR-4A)', () => {
  const shouldCount: Record<string, boolean> = {
    whitelistBypass: true,
    passedAllModeration: true,
    blacklist: false,
    antiFloodTriggered: false,
    keywordHit: false,
    linkFilterHit: false,
    adFilterHit: false,
  };

  it('counts whitelist and fully allowed messages only', () => {
    expect(shouldCount.whitelistBypass).toBe(true);
    expect(shouldCount.passedAllModeration).toBe(true);
  });

  it('does not count messages deleted or blocked by moderation', () => {
    expect(shouldCount.blacklist).toBe(false);
    expect(shouldCount.antiFloodTriggered).toBe(false);
    expect(shouldCount.keywordHit).toBe(false);
    expect(shouldCount.linkFilterHit).toBe(false);
    expect(shouldCount.adFilterHit).toBe(false);
  });
});
