import { isEngagementCommandText } from '../engagement/engagement-commands.util';
import { toBusinessDayUtc } from '../engagement/business-day.util';

/** Minimal ctx shape for countable-message checks (avoids coupling tests to grammY). */
export type CountableMessageCtx = {
  chat?: { type?: string } | null;
  from?: { id: number; is_bot?: boolean } | null;
  message?: {
    date?: number;
    text?: string;
    new_chat_members?: unknown;
    left_chat_member?: unknown;
    new_chat_title?: unknown;
    new_chat_photo?: unknown;
    delete_chat_photo?: unknown;
    group_chat_created?: unknown;
    supergroup_chat_created?: unknown;
    channel_chat_created?: unknown;
    message_auto_delete_timer_changed?: unknown;
    migrate_to_chat_id?: unknown;
    migrate_from_chat_id?: unknown;
    pinned_message?: unknown;
    users_shared?: unknown;
    user_shared?: unknown;
    chat_shared?: unknown;
    connected_website?: unknown;
    write_access_allowed?: unknown;
    passport_data?: unknown;
    proximity_alert_triggered?: unknown;
    boost_added?: unknown;
    chat_background_set?: unknown;
    forum_topic_created?: unknown;
    forum_topic_edited?: unknown;
    forum_topic_closed?: unknown;
    forum_topic_reopened?: unknown;
    general_forum_topic_hidden?: unknown;
    general_forum_topic_unhidden?: unknown;
    video_chat_scheduled?: unknown;
    video_chat_started?: unknown;
    video_chat_ended?: unknown;
    video_chat_participants_invited?: unknown;
    web_app_data?: unknown;
  } | null;
};

/** Telegram service / system events — not user-authored content. */
export function isTelegramServiceMessage(
  message: NonNullable<CountableMessageCtx['message']>,
): boolean {
  return !!(
    message.new_chat_members ||
    message.left_chat_member ||
    message.new_chat_title ||
    message.new_chat_photo ||
    message.delete_chat_photo ||
    message.group_chat_created ||
    message.supergroup_chat_created ||
    message.channel_chat_created ||
    message.message_auto_delete_timer_changed ||
    message.migrate_to_chat_id ||
    message.migrate_from_chat_id ||
    message.pinned_message ||
    message.users_shared ||
    message.user_shared ||
    message.chat_shared ||
    message.connected_website ||
    message.write_access_allowed ||
    message.passport_data ||
    message.proximity_alert_triggered ||
    message.boost_added ||
    message.chat_background_set ||
    message.forum_topic_created ||
    message.forum_topic_edited ||
    message.forum_topic_closed ||
    message.forum_topic_reopened ||
    message.general_forum_topic_hidden ||
    message.general_forum_topic_unhidden ||
    message.video_chat_scheduled ||
    message.video_chat_started ||
    message.video_chat_ended ||
    message.video_chat_participants_invited ||
    message.web_app_data
  );
}

/**
 * Whether a Telegram update should be eligible for DailyMessageStat counting.
 * Does not check DB Group existence — caller must resolve the group separately.
 */
export function isCountableGroupUserMessage(ctx: CountableMessageCtx): boolean {
  const type = ctx.chat?.type;
  if (type !== 'group' && type !== 'supergroup') return false;
  if (!ctx.from?.id) return false;
  if (ctx.from.is_bot === true) return false;
  if (!ctx.message) return false;
  if (isTelegramServiceMessage(ctx.message)) return false;
  const text = ctx.message.text;
  if (typeof text === 'string' && isEngagementCommandText(text)) return false;
  return true;
}

/** Convert Telegram message.date (Unix seconds) to UTC business-day marker. */
export function businessDayFromTelegramMessageDate(unixSeconds: number): Date {
  return toBusinessDayUtc(new Date(unixSeconds * 1000));
}
