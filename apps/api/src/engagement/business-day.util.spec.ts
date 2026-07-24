import {
  addBusinessDaysUtc,
  businessDayKeyUtc,
  isSameBusinessDayUtc,
  startOfMonthUtc,
  toBusinessDayUtc,
} from './business-day.util';

describe('business-day.util (UTC)', () => {
  it('normalizes to UTC midnight', () => {
    const d = toBusinessDayUtc(new Date('2026-07-22T15:30:00.000Z'));
    expect(d.toISOString()).toBe('2026-07-22T00:00:00.000Z');
  });

  it('does not use local timezone for day boundaries', () => {
    // 2026-07-22 01:00 UTC is still the 22nd in UTC even if local is still the 21st.
    const d = toBusinessDayUtc(new Date('2026-07-22T01:00:00.000Z'));
    expect(businessDayKeyUtc(d)).toBe('2026-07-22');
  });

  it('compares same business day', () => {
    expect(
      isSameBusinessDayUtc(
        new Date('2026-07-22T01:00:00.000Z'),
        new Date('2026-07-22T23:59:59.000Z'),
      ),
    ).toBe(true);
    expect(
      isSameBusinessDayUtc(
        new Date('2026-07-22T23:00:00.000Z'),
        new Date('2026-07-23T00:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('adds business days in UTC', () => {
    const today = toBusinessDayUtc(new Date('2026-07-22T12:00:00.000Z'));
    expect(addBusinessDaysUtc(today, -1).toISOString()).toBe('2026-07-21T00:00:00.000Z');
  });

  it('startOfMonthUtc is first of month UTC', () => {
    expect(startOfMonthUtc(new Date('2026-07-22T12:00:00.000Z')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });
});
