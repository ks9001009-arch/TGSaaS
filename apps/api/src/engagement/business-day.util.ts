/**
 * Business-day helpers for engagement (check-in, daily stats, rankings).
 *
 * PR-2: all calendar days are normalized in **UTC**.
 * Do not use the server's local timezone.
 *
 * Later (互动中心 PR): replace the UTC assumption with the group's configured
 * timezone (default still UTC). Call sites should keep going through these
 * helpers so only this module needs to change.
 */

/** Normalize an instant to the UTC midnight marker of its UTC calendar day. */
export function toBusinessDayUtc(instant: Date = new Date()): Date {
  return new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()),
  );
}

/** Add (or subtract) whole business days to a normalized day marker. */
export function addBusinessDaysUtc(day: Date, delta: number): Date {
  const base = toBusinessDayUtc(day);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + delta));
}

/** UTC calendar-day key `YYYY-MM-DD` for referenceId / display. */
export function businessDayKeyUtc(day: Date): string {
  return toBusinessDayUtc(day).toISOString().slice(0, 10);
}

/** True when both instants fall on the same UTC calendar day. */
export function isSameBusinessDayUtc(a: Date, b: Date): boolean {
  return toBusinessDayUtc(a).getTime() === toBusinessDayUtc(b).getTime();
}

/** First instant of the UTC month that contains `instant`. */
export function startOfMonthUtc(instant: Date = new Date()): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1));
}

/** Exclusive end of the UTC day that contains `instant` (next midnight). */
export function endOfBusinessDayUtc(instant: Date = new Date()): Date {
  return addBusinessDaysUtc(toBusinessDayUtc(instant), 1);
}
