// Minimal i18n for the bot private-chat UI (zh-CN + en).
// Keys map to either a plain string or a function(vars) => string.

export type Locale = 'zh' | 'en';

type Entry = string | ((v: Record<string, string>) => string);

const dict: Record<Locale, Record<string, Entry>> = {
  zh: {
    home_title:
      '👋 *欢迎使用群管理机器人*\n\n我可以帮你管理 Telegram 群组：新人欢迎、人机验证、广告过滤、关键词拦截、统计分析等。\n\n点击下方按钮开始 👇',
    btn_home: '🏠 首页',
    btn_add_group: '➕ 添加到群组',
    btn_my_groups: '📊 我的群组',
    btn_dashboard: '⚙️ 管理后台',
    btn_vip: '💎 VIP中心',
    btn_invite: '🎁 邀请奖励',
    btn_support: '💬 联系客服',
    btn_language: '🌍 Language',
    btn_getid: '🆔 查询用户ID',
    btn_close: '✖️ 关闭',
    btn_back: '⬅️ 返回',
    choose_language: '请选择语言 / Choose your language：',
    language_set: '✅ 已切换为简体中文。',
    help:
      '可用命令：\n/start - 打开主菜单\n/help - 帮助\n/id - 查看你的 ID / 当前会话 ID\n/getid - 查询某个用户的 ID\n/mygroups - 我的群组\n/dashboard - 管理后台',
    help_group:
      '群内互动命令：\n签到 或 /checkin - 每日签到\n我的 或 /me - 我的资料\n积分 或 /balance - 积分余额\n排行榜 或 /rank - 今日活跃排行\n抽奖 或 /lottery - 积分抽奖\n积分榜 或 /points - 积分排行\n消息榜 或 /messages - 本月消息排行\n\n也可点输入框旁的 / 菜单选择。',
    id_info: (v) => `你的用户 ID: \`${v.uid}\`\n当前会话 ID: \`${v.cid}\``,
    getid_prompt: '请点击下方按钮，选择一位好友分享给我，我会返回该用户的 ID 👇',
    getid_button: '👤 选择要查询的好友',
    getid_result: (v) => `✅ 你已把该用户分享给机器人。\n用户 ID: \`${v.uid}\``,
    home_add_group: '➕ 把我添加到你的群组并设为管理员即可开始工作。',
    home_my_groups: '📊 请使用 /mygroups 或打开管理后台查看你的群组。',
    home_dashboard: '⚙️ 管理后台：请在浏览器打开平台后台地址。',
    home_vip: '💎 VIP 中心：升级后可管理更多群组、解锁高级风控。',
    home_invite: '🎁 邀请奖励：每邀请一位好友注册可获得积分。',
    home_support: '💬 联系客服：请发送 /feedback 留言，我们会尽快回复。',
    no_dashboard: '⚠️ 您暂未开通管理后台权限，请联系主管理员为您分配后台管理权限。',
    no_groups: '（暂无可管理的群组）',
    open_dashboard: '⚙️ 打开我的管理后台',
    my_groups_header: (v) => `📊 *我的群组*\n\n${v.list}`,
  },
  en: {
    home_title:
      '👋 *Welcome to the Group Manager bot*\n\nI can help you manage your Telegram groups: welcome messages, human verification, ad filtering, keyword blocking, statistics and more.\n\nTap a button below to get started 👇',
    btn_home: '🏠 Home',
    btn_add_group: '➕ Add to group',
    btn_my_groups: '📊 My groups',
    btn_dashboard: '⚙️ Dashboard',
    btn_vip: '💎 VIP',
    btn_invite: '🎁 Referrals',
    btn_support: '💬 Support',
    btn_language: '🌍 Language',
    btn_getid: '🆔 Look up user ID',
    btn_close: '✖️ Close',
    btn_back: '⬅️ Back',
    choose_language: '请选择语言 / Choose your language:',
    language_set: '✅ Switched to English.',
    help:
      'Available commands:\n/start - open the main menu\n/help - help\n/id - show your ID / current chat ID\n/getid - look up another user\'s ID\n/mygroups - my groups\n/dashboard - dashboard',
    help_group:
      'Group engagement commands:\n签到 or /checkin - daily check-in\n我的 or /me - my profile\n积分 or /balance - points balance\n排行榜 or /rank - today activity rank\n抽奖 or /lottery - points lottery\n积分榜 or /points - points leaderboard\n消息榜 or /messages - monthly messages\n\nYou can also open the / menu next to the input box.',
    id_info: (v) => `Your user ID: \`${v.uid}\`\nCurrent chat ID: \`${v.cid}\``,
    getid_prompt: 'Tap the button below and pick a friend to share with me; I will return their user ID 👇',
    getid_button: '👤 Pick a user to look up',
    getid_result: (v) => `✅ You shared the user with the bot.\nUser ID: \`${v.uid}\``,
    home_add_group: '➕ Add me to your group and make me an admin to get started.',
    home_my_groups: '📊 Use /mygroups or open the dashboard to view your groups.',
    home_dashboard: '⚙️ Dashboard: open the platform dashboard URL in your browser.',
    home_vip: '💎 VIP: upgrade to manage more groups and unlock advanced controls.',
    home_invite: '🎁 Referrals: earn points for every friend who signs up.',
    home_support: '💬 Support: send /feedback to leave a message and we will get back to you.',
    no_dashboard: '⚠️ You do not have dashboard access yet. Please ask the main admin to grant you management permission.',
    no_groups: '(no manageable groups yet)',
    open_dashboard: '⚙️ Open my dashboard',
    my_groups_header: (v) => `📊 *My groups*\n\n${v.list}`,
  },
};

export function normalizeLocale(input?: string | null): Locale {
  if (!input) return 'zh';
  const l = input.toLowerCase();
  if (l.startsWith('en')) return 'en';
  return 'zh';
}

export function t(locale: Locale, key: string, vars: Record<string, string> = {}): string {
  const entry = dict[locale]?.[key] ?? dict.zh[key] ?? key;
  return typeof entry === 'function' ? entry(vars) : entry;
}
