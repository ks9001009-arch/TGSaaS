/**
 * Shared Telegram text matchers for engagement commands.
 * Used by bot.hears and by onMessage moderation skip — keep one source of truth.
 *
 * Slash is optional for Chinese keywords: both `/签到` and `签到` match.
 * Latin menu commands (/checkin etc.) are matched separately for skip/count
 * (Bot API setMyCommands cannot use Chinese command names).
 *
 * Exactness matters: `积分` (balance) must not match `积分榜`.
 */
export const ENGAGEMENT_CHECKIN_COMMAND_RE = /^\/?签到(?:@\w+)?\s*$/;
export const ENGAGEMENT_PROFILE_COMMAND_RE = /^\/?我的(?:@\w+)?\s*$/;
export const ENGAGEMENT_POINTS_BALANCE_COMMAND_RE = /^\/?积分(?:@\w+)?\s*$/;
export const ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE = /^\/?积分榜(?:@\w+)?\s*$/;
export const ENGAGEMENT_DAILY_RANK_COMMAND_RE = /^\/?排行榜(?:@\w+)?\s*$/;
export const ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE = /^\/?消息榜(?:@\w+)?\s*$/;
export const ENGAGEMENT_LOTTERY_COMMAND_RE = /^\/?抽奖(?:@\w+)?\s*$/;

/** Latin commands shown in the group `/` menu (setMyCommands). Slash required. */
export const ENGAGEMENT_LATIN_COMMAND_RE =
  /^\/(?:checkin|me|balance|rank|lottery|points|messages)(?:@\w+)?\s*$/i;

export function isEngagementCommandText(text: string): boolean {
  const trimmed = text.trim();
  return (
    ENGAGEMENT_CHECKIN_COMMAND_RE.test(trimmed) ||
    ENGAGEMENT_PROFILE_COMMAND_RE.test(trimmed) ||
    ENGAGEMENT_POINTS_BALANCE_COMMAND_RE.test(trimmed) ||
    ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE.test(trimmed) ||
    ENGAGEMENT_DAILY_RANK_COMMAND_RE.test(trimmed) ||
    ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE.test(trimmed) ||
    ENGAGEMENT_LOTTERY_COMMAND_RE.test(trimmed) ||
    ENGAGEMENT_LATIN_COMMAND_RE.test(trimmed)
  );
}

/** Display name for /我的: @username → first+last → telegramUserId. */
export function memberDisplayName(member: {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  telegramUserId: string;
}): string {
  if (member.username) return `@${member.username}`;
  const full = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return member.telegramUserId;
}
