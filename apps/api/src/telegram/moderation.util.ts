// Pure helpers for content moderation decisions.

export type KeywordMatch = 'CONTAINS' | 'EXACT' | 'REGEX';

export interface KeywordRule {
  pattern: string;
  match: KeywordMatch;
  action: string;
  enabled: boolean;
}

export function matchKeyword(text: string, rule: KeywordRule): boolean {
  if (!rule.enabled) return false;
  const t = text.toLowerCase();
  const p = rule.pattern.toLowerCase();
  switch (rule.match) {
    case 'EXACT':
      return t.trim() === p.trim();
    case 'REGEX':
      try {
        return new RegExp(rule.pattern, 'i').test(text);
      } catch {
        return false;
      }
    case 'CONTAINS':
    default:
      return t.includes(p);
  }
}

const URL_RE = /(https?:\/\/|t\.me\/|www\.)[^\s]+/i;
const MENTION_SPAM_RE = /(@\w+){4,}/;

export function looksLikeLink(text: string): boolean {
  return URL_RE.test(text);
}

// "Strong" signals: a single match here is enough to treat the message as an ad.
// These are intentionally specific (phrases / patterns) to keep precision high
// and avoid flagging normal chat.
const STRONG_AD_PATTERNS: RegExp[] = [
  // contact-method bait: "加/联系/私聊 + 微信/QQ/电报/飞机..."
  /(加|联系|私聊|咨询|添加|徵|征|对接).{0,6}(微信|薇信|威信|v\s*信|vx|v❤|wechat|qq|扣扣|电报|飞机|telegram|whatsapp)/i,
  // explicit account handle bait: "微信：xxxx" / "vx xxxx" / "QQ:12345"
  /(微信|薇信|威信|vx|v信|wechat)\s*[:：]?\s*[a-z0-9_]{4,}/i,
  /\bq{1,2}\s*[:：]?\s*\d{5,}/i,
  // mainland mobile number (often left as contact in ads)
  /(?<!\d)1[3-9]\d{9}(?!\d)/,
  // earning / get-rich scams
  /(日赚|日入|月入(过万|上万|轻松)|躺赚|稳赚不赔|包赚|包回本|无门槛|轻松赚|在家赚|动动手指)/,
  /(刷单|刷信誉|做任务|接单返利|垫付|抢单|做单)/,
  // gambling / lottery
  /(博彩|赌场|六合彩|时时彩|彩票网|娱乐城|百家乐|龙虎斗|开盘|下注|包赔)/,
  // bonus bait
  /(注册|首充|首存|充值|开户|签到).{0,8}(送|返|领).{0,8}(彩金|现金|大礼|福利|优惠券|红包)/,
  // crypto money laundering / OTC
  /(跑分|代开|秒到账|出\s*u|收\s*u|承兑|搬砖套利|刷流水|车队|带飞)/i,
  // agent recruiting
  /(招(代理|会员|玩家|车手|主播)|代理加盟|一手货源|总代|招商加盟)/,
  // adult
  /(裸聊|约炮|楼凤|上门服务|一夜情|同城约|妹子资源)/,
];

// "Weak" / general keywords. These are common enough that we require at least
// two of them (or one + a link) before treating the message as an ad, to keep
// precision high. This list is also what gets bulk-imported into group rules.
export const DEFAULT_AD_KEYWORDS: string[] = [
  // money / earning
  '日赚', '日入', '月入过万', '躺赚', '搬砖', '刷单', '刷信誉', '兼职', '招聘', '日结',
  '高薪', '稳赚', '包回收', '上岸', '回血', '带回血', '回本', '垫付', '返利', '佣金',
  '日入过千', '在家兼职', '手机兼职', '轻松赚钱',
  // crypto / finance
  'usdt', '泰达币', '提现', '充值', '汇率', '搬砖套利', '合约', '杠杆', '理财', '投资',
  '交易所', '钱包地址', '空投', '撸毛', '一币', '跑分', '承兑', '出u', '收u', '秒到账',
  '代收', '代付', '四方', '三方支付', '卡商',
  // gambling / adult
  '博彩', '彩票', '赌场', '棋牌', '娱乐城', '六合彩', '时时彩', '百家乐', '澳门', '约炮',
  '裸聊', '一对一', '上门', '楼凤', '彩金', '下注', '开户送', '首充', '首存',
  // promotion / contact bait
  '免费领取', '点击领取', '加我微信', '加微信', '加我', '加我vx', '私聊', '私我',
  '扫码', '二维码', '点击链接', '点我', '飞机群', '拉群', '推广', '广告位', '清粉',
  '代理', '招代理', '一手', '出售', '收购', '办理', '代办', '发票', '一手货源',
  '加盟', '总代', '招商', '接单', '低价出', '需要的联系', '有意者', '诚招', '长期收',
];

// Lightweight ad/spam heuristic used when antiAd/antiSpam is on.
export function looksLikeAd(text: string): boolean {
  if (!text) return false;

  // 1) strong patterns => immediate ad (high precision)
  for (const re of STRONG_AD_PATTERNS) {
    if (re.test(text)) return true;
  }

  // 2) weak keyword accumulation
  const lowered = text.toLowerCase();
  const hits = DEFAULT_AD_KEYWORDS.filter((w) => lowered.includes(w.toLowerCase())).length;
  if (hits >= 2) return true;
  if (URL_RE.test(text) && hits >= 1) return true;

  // 3) excessive @mentions => spam broadcast
  if (MENTION_SPAM_RE.test(text)) return true;

  return false;
}
