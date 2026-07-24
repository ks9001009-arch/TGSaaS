import {
  ENGAGEMENT_CHECKIN_COMMAND_RE,
  ENGAGEMENT_PROFILE_COMMAND_RE,
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

  it('isEngagementCommandText covers both and trims', () => {
    expect(isEngagementCommandText(' /签到@bot ')).toBe(true);
    expect(isEngagementCommandText('/我的')).toBe(true);
    expect(isEngagementCommandText('/签到abc')).toBe(false);
  });
});
