import { EngagementService } from '../engagement/engagement.service';
import { businessDayFromTelegramMessageDate } from './message-activity.util';

export type RecordGroupMessageActivityInput = {
  groupId: string;
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Telegram message.date (Unix seconds). */
  messageDateUnix: number;
};

/**
 * Upsert GroupMember profile/lastActiveAt, then increment DailyMessageStat
 * for the message's UTC business day. Reuses EngagementService writers.
 */
export async function recordGroupMessageActivity(
  engagement: Pick<EngagementService, 'upsertGroupMember' | 'incrementDailyMessageCount'>,
  input: RecordGroupMessageActivityInput,
): Promise<void> {
  const lastActiveAt = new Date(input.messageDateUnix * 1000);
  const date = businessDayFromTelegramMessageDate(input.messageDateUnix);

  await engagement.upsertGroupMember({
    groupId: input.groupId,
    telegramUserId: input.telegramUserId,
    username: input.username,
    firstName: input.firstName,
    lastName: input.lastName,
    lastActiveAt,
  });

  await engagement.incrementDailyMessageCount({
    groupId: input.groupId,
    telegramUserId: input.telegramUserId,
    date,
    increment: 1,
  });
}
