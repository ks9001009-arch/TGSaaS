import { recordGroupMessageActivity } from './message-activity';
import { businessDayFromTelegramMessageDate } from './message-activity.util';

describe('recordGroupMessageActivity', () => {
  function mockEngagement() {
    return {
      upsertGroupMember: jest.fn().mockResolvedValue({ id: 'm1' }),
      incrementDailyMessageCount: jest.fn().mockResolvedValue({ id: 's1', count: 1 }),
    };
  }

  const baseInput = {
    groupId: 'g1',
    telegramUserId: '42',
    username: 'alice',
    firstName: 'Alice',
    lastName: 'L',
    // 2026-07-22 12:00:00 UTC
    messageDateUnix: Date.UTC(2026, 6, 22, 12, 0, 0) / 1000,
  };

  it('upserts GroupMember with profile + lastActiveAt from message time', async () => {
    const engagement = mockEngagement();
    await recordGroupMessageActivity(engagement, baseInput);

    expect(engagement.upsertGroupMember).toHaveBeenCalledWith({
      groupId: 'g1',
      telegramUserId: '42',
      username: 'alice',
      firstName: 'Alice',
      lastName: 'L',
      lastActiveAt: new Date(baseInput.messageDateUnix * 1000),
    });
    // Does not pass points/level/streak/joinedAt — upsert must not overwrite them.
    const arg = engagement.upsertGroupMember.mock.calls[0][0];
    expect(arg).not.toHaveProperty('points');
    expect(arg).not.toHaveProperty('level');
    expect(arg).not.toHaveProperty('checkinStreak');
    expect(arg).not.toHaveProperty('lastCheckinDate');
    expect(arg).not.toHaveProperty('joinedAt');
  });

  it('increments DailyMessageStat for message UTC business day', async () => {
    const engagement = mockEngagement();
    await recordGroupMessageActivity(engagement, baseInput);

    expect(engagement.incrementDailyMessageCount).toHaveBeenCalledWith({
      groupId: 'g1',
      telegramUserId: '42',
      date: businessDayFromTelegramMessageDate(baseInput.messageDateUnix),
      increment: 1,
    });
    expect(engagement.incrementDailyMessageCount.mock.calls[0][0].date.toISOString()).toBe(
      '2026-07-22T00:00:00.000Z',
    );
  });

  it('upserts before increment (member must exist for DailyMessageStat)', async () => {
    const engagement = mockEngagement();
    const order: string[] = [];
    engagement.upsertGroupMember.mockImplementation(async () => {
      order.push('upsert');
      return { id: 'm1' };
    });
    engagement.incrementDailyMessageCount.mockImplementation(async () => {
      order.push('increment');
      return { id: 's1' };
    });

    await recordGroupMessageActivity(engagement, baseInput);
    expect(order).toEqual(['upsert', 'increment']);
  });

  it('same-day second message still calls increment by 1 (aggregation in DB)', async () => {
    const engagement = mockEngagement();
    await recordGroupMessageActivity(engagement, baseInput);
    await recordGroupMessageActivity(engagement, {
      ...baseInput,
      messageDateUnix: Date.UTC(2026, 6, 22, 18, 0, 0) / 1000,
    });

    expect(engagement.incrementDailyMessageCount).toHaveBeenCalledTimes(2);
    expect(engagement.incrementDailyMessageCount.mock.calls[0][0].date.toISOString()).toBe(
      '2026-07-22T00:00:00.000Z',
    );
    expect(engagement.incrementDailyMessageCount.mock.calls[1][0].date.toISOString()).toBe(
      '2026-07-22T00:00:00.000Z',
    );
  });

  it('cross-UTC-day messages use distinct business-day markers', async () => {
    const engagement = mockEngagement();
    await recordGroupMessageActivity(engagement, {
      ...baseInput,
      messageDateUnix: Date.UTC(2026, 6, 22, 23, 0, 0) / 1000,
    });
    await recordGroupMessageActivity(engagement, {
      ...baseInput,
      messageDateUnix: Date.UTC(2026, 6, 23, 1, 0, 0) / 1000,
    });

    expect(engagement.incrementDailyMessageCount.mock.calls[0][0].date.toISOString()).toBe(
      '2026-07-22T00:00:00.000Z',
    );
    expect(engagement.incrementDailyMessageCount.mock.calls[1][0].date.toISOString()).toBe(
      '2026-07-23T00:00:00.000Z',
    );
  });

  it('propagates engagement errors to caller (TelegramService must catch)', async () => {
    const engagement = mockEngagement();
    engagement.incrementDailyMessageCount.mockRejectedValue(new Error('db down'));
    await expect(recordGroupMessageActivity(engagement, baseInput)).rejects.toThrow('db down');
  });
});

describe('recordGroupMessageActivitySafe error isolation contract', () => {
  it('logs and swallows errors without rethrowing', async () => {
    const errors: string[] = [];
    const logger = {
      error: (msg: string) => {
        errors.push(msg);
      },
    };

    async function recordGroupMessageActivitySafe(
      run: () => Promise<void>,
      meta: { botId: string; chat: string; user: string },
    ) {
      try {
        await run();
      } catch (e: any) {
        logger.error(
          `[msg-stat] failed bot=${meta.botId} chat=${meta.chat} user=${meta.user}: ${e?.message ?? e}`,
        );
      }
    }

    let continued = false;
    await recordGroupMessageActivitySafe(
      async () => {
        throw new Error('boom');
      },
      { botId: 'b1', chat: '-1001', user: '42' },
    );
    continued = true;

    expect(continued).toBe(true);
    expect(errors[0]).toContain('bot=b1');
    expect(errors[0]).toContain('chat=-1001');
    expect(errors[0]).toContain('user=42');
    expect(errors[0]).toContain('boom');
  });
});
