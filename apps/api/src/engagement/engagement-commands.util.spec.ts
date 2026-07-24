import {
  ENGAGEMENT_CHECKIN_COMMAND_RE,
  ENGAGEMENT_PROFILE_COMMAND_RE,
  ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE,
  ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE,
  isEngagementCommandText,
} from './engagement-commands.util';

describe('engagement command matchers', () => {
  it('matches /签到 and /签到@botname', () => {
    expect(ENGAGEMENT_CHECKIN_COMMAND_RE.test('/签到')).toBe(true);
    expect(ENGAGEMENT_CHECKIN_COMMAND_RE.test('/签到@MyBot')).toBe(true);
    expect(ENGAGEMENT_CHECKIN_COMMAND_RE.test('/签到  ')).toBe(true);
  });

  it('rejects non-exact /签到 variants', () => {
    expect(ENGAGEMENT_CHECKIN_COMMAND_RE.test('今天记得/签到')).toBe(false);
    expect(ENGAGEMENT_CHECKIN_COMMAND_RE.test('/签到abc')).toBe(false);
    expect(ENGAGEMENT_CHECKIN_COMMAND_RE.test('签到')).toBe(false);
  });

  it('matches /我的 and /我的@botname', () => {
    expect(ENGAGEMENT_PROFILE_COMMAND_RE.test('/我的')).toBe(true);
    expect(ENGAGEMENT_PROFILE_COMMAND_RE.test('/我的@MyBot')).toBe(true);
  });

  it('rejects non-exact /我的 variants', () => {
    expect(ENGAGEMENT_PROFILE_COMMAND_RE.test('测试/我的')).toBe(false);
    expect(ENGAGEMENT_PROFILE_COMMAND_RE.test('/我的abc')).toBe(false);
  });

  it('matches /积分榜 and /积分榜@botname after trim', () => {
    expect(ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE.test('/积分榜')).toBe(true);
    expect(ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE.test('/积分榜@MyBot')).toBe(true);
    expect(ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE.test('/积分榜  '.trim())).toBe(true);
  });

  it('rejects non-exact /积分榜 variants', () => {
    expect(ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE.test('/积分榜abc')).toBe(false);
    expect(ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE.test('今天看/积分榜')).toBe(false);
    expect(ENGAGEMENT_POINTS_LEADERBOARD_COMMAND_RE.test('/积分榜 extra')).toBe(false);
  });

  it('matches /消息榜 and rejects bad variants', () => {
    expect(ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE.test('/消息榜')).toBe(true);
    expect(ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE.test('/消息榜@bot')).toBe(true);
    expect(ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE.test('/消息榜abc')).toBe(false);
    expect(ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE.test('测试/消息榜')).toBe(false);
    expect(ENGAGEMENT_MESSAGE_LEADERBOARD_COMMAND_RE.test('/消息榜 123')).toBe(false);
  });

  it('isEngagementCommandText covers all four and trims', () => {
    expect(isEngagementCommandText(' /签到@bot ')).toBe(true);
    expect(isEngagementCommandText('/我的')).toBe(true);
    expect(isEngagementCommandText(' /积分榜 ')).toBe(true);
    expect(isEngagementCommandText('/消息榜@x')).toBe(true);
    expect(isEngagementCommandText('/签到abc')).toBe(false);
    expect(isEngagementCommandText('/积分榜abc')).toBe(false);
  });
});
