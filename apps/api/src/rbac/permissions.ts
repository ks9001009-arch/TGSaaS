// Centralized RBAC permission keys. A single source of truth shared by guards,
// services and (mirrored) the frontend. Super admins implicitly have all of them.
//
// Permissions are recomputed from the DB on every request (see RbacService.context),
// so toggling a permission takes effect immediately without re-login.

export const PERMISSIONS = {
  // ---- bots ----
  BOT_VIEW: 'bot.view',         // 查看机器人
  BOTS_CREATE: 'bots.create',   // 创建机器人
  BOTS_DELETE: 'bots.delete',   // 删除机器人
  BOT_START: 'bot.start',       // 启动机器人
  BOT_STOP: 'bot.stop',         // 停止机器人
  BOT_EDIT: 'bot.edit',         // 修改机器人资料
  BOT_TOKEN: 'bot.token',       // 更换机器人 Token

  // ---- groups ----
  GROUPS_VIEW: 'groups.view',   // 查看群组
  GROUPS_EDIT: 'groups.edit',   // 编辑群组配置
  GROUPS_DELETE: 'groups.delete', // 删除群组

  // ---- content / moderation ----
  WELCOME_EDIT: 'welcome.edit',           // 欢迎消息
  VERIFY_EDIT: 'verify.edit',             // 进群验证
  CHANNEL_GATE_EDIT: 'channelGate.edit',  // 关注频道解禁
  FILTER_ADS: 'filter.ads',               // 广告过滤
  FILTER_LINKS: 'filter.links',           // 链接过滤
  FILTER_KEYWORDS: 'filter.keywords',     // 关键词过滤
  ANTIFLOOD_EDIT: 'antiflood.edit',       // 自动禁言 / 防刷屏
  BLACKLIST_EDIT: 'blacklist.edit',       // 黑名单
  WHITELIST_EDIT: 'whitelist.edit',       // 白名单
  SCHEDULE_MANAGE: 'schedule.manage',     // 定时发送

  // ---- data ----
  STATS_VIEW: 'stats.view',     // 查看统计
  LOGS_VIEW: 'logs.view',       // 查看日志

  // ---- ads (button ad-slots) ----
  AD_VIEW: 'ad.view',               // 查看广告
  AD_CREATE: 'ad.create',           // 创建广告
  AD_EDIT: 'ad.edit',               // 编辑广告
  AD_DELETE: 'ad.delete',           // 删除广告
  AD_TOGGLE: 'ad.toggle',           // 启用/关闭广告
  AD_ASSIGN_BOT: 'ad.assignBot',    // 给机器人分配广告
  AD_ASSIGN_GROUP: 'ad.assignGroup',// 给群组分配广告
  AD_STATS: 'ad.stats',             // 查看广告统计

  // ---- marketing center ----
  MARKETING_VIEW: 'marketing.view',     // 进入营销中心
  BUTTON_MANAGE: 'button.manage',       // 管理按钮库
  TEMPLATE_MANAGE: 'template.manage',   // 管理消息模板（创建/编辑）
  TEMPLATE_APPLY: 'template.apply',     // 批量应用广告模板到群组
  TEMPLATE_UNAPPLY: 'template.unapply', // 移除群组的广告模板

  // ---- system ----
  ADMINS_MANAGE: 'admins.manage',     // 管理管理员
  SETTINGS_MANAGE: 'settings.manage', // 系统设置
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Default permission set for a freshly-created sub-admin (basic, read-mostly).
export const DEFAULT_SUBADMIN_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.BOT_VIEW,
  PERMISSIONS.GROUPS_VIEW,
  PERMISSIONS.STATS_VIEW,
  PERMISSIONS.LOGS_VIEW,
  PERMISSIONS.WELCOME_EDIT,
];

// Powerful, platform-affecting permissions (super admin grants with care).
export const PLATFORM_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.BOTS_CREATE,
  PERMISSIONS.BOTS_DELETE,
  PERMISSIONS.ADMINS_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

// Flat catalog used to seed the Permission table (key + human label + category).
export const PERMISSION_CATALOG: { key: PermissionKey; label: string; category: string }[] = [
  { key: PERMISSIONS.BOT_VIEW, label: '查看机器人', category: 'bot' },
  { key: PERMISSIONS.BOTS_CREATE, label: '创建机器人', category: 'bot' },
  { key: PERMISSIONS.BOTS_DELETE, label: '删除机器人', category: 'bot' },
  { key: PERMISSIONS.BOT_START, label: '启动机器人', category: 'bot' },
  { key: PERMISSIONS.BOT_STOP, label: '停止机器人', category: 'bot' },
  { key: PERMISSIONS.BOT_EDIT, label: '修改机器人资料', category: 'bot' },
  { key: PERMISSIONS.BOT_TOKEN, label: '更换机器人 Token', category: 'bot' },

  { key: PERMISSIONS.GROUPS_VIEW, label: '查看群组', category: 'group' },
  { key: PERMISSIONS.GROUPS_EDIT, label: '编辑群组配置', category: 'group' },
  { key: PERMISSIONS.GROUPS_DELETE, label: '删除群组', category: 'group' },

  { key: PERMISSIONS.WELCOME_EDIT, label: '欢迎消息', category: 'content' },
  { key: PERMISSIONS.VERIFY_EDIT, label: '进群验证', category: 'content' },
  { key: PERMISSIONS.CHANNEL_GATE_EDIT, label: '关注频道解禁', category: 'content' },
  { key: PERMISSIONS.FILTER_ADS, label: '广告过滤', category: 'content' },
  { key: PERMISSIONS.FILTER_LINKS, label: '链接过滤', category: 'content' },
  { key: PERMISSIONS.FILTER_KEYWORDS, label: '关键词过滤', category: 'content' },
  { key: PERMISSIONS.ANTIFLOOD_EDIT, label: '自动禁言 / 防刷屏', category: 'content' },
  { key: PERMISSIONS.BLACKLIST_EDIT, label: '黑名单', category: 'content' },
  { key: PERMISSIONS.WHITELIST_EDIT, label: '白名单', category: 'content' },
  { key: PERMISSIONS.SCHEDULE_MANAGE, label: '定时发送', category: 'content' },

  { key: PERMISSIONS.STATS_VIEW, label: '查看统计', category: 'data' },
  { key: PERMISSIONS.LOGS_VIEW, label: '查看日志', category: 'data' },

  { key: PERMISSIONS.AD_VIEW, label: '查看广告', category: 'ad' },
  { key: PERMISSIONS.AD_CREATE, label: '创建广告', category: 'ad' },
  { key: PERMISSIONS.AD_EDIT, label: '编辑广告', category: 'ad' },
  { key: PERMISSIONS.AD_DELETE, label: '删除广告', category: 'ad' },
  { key: PERMISSIONS.AD_TOGGLE, label: '启用/关闭广告', category: 'ad' },
  { key: PERMISSIONS.AD_ASSIGN_BOT, label: '给机器人分配广告', category: 'ad' },
  { key: PERMISSIONS.AD_ASSIGN_GROUP, label: '给群组分配广告', category: 'ad' },
  { key: PERMISSIONS.AD_STATS, label: '查看广告统计', category: 'ad' },

  { key: PERMISSIONS.MARKETING_VIEW, label: '进入营销中心', category: 'marketing' },
  { key: PERMISSIONS.BUTTON_MANAGE, label: '管理按钮库', category: 'marketing' },
  { key: PERMISSIONS.TEMPLATE_MANAGE, label: '管理消息模板', category: 'marketing' },
  { key: PERMISSIONS.TEMPLATE_APPLY, label: '批量应用广告模板', category: 'marketing' },
  { key: PERMISSIONS.TEMPLATE_UNAPPLY, label: '移除广告模板应用', category: 'marketing' },

  { key: PERMISSIONS.ADMINS_MANAGE, label: '管理管理员', category: 'system' },
  { key: PERMISSIONS.SETTINGS_MANAGE, label: '系统设置', category: 'system' },
];

// Metadata for rendering permission toggles in the dashboard (grouped by category).
export const PERMISSION_GROUPS: {
  label: string;
  items: { key: PermissionKey; label: string }[];
}[] = [
  {
    label: '机器人权限',
    items: [
      { key: PERMISSIONS.BOT_VIEW, label: '查看机器人' },
      { key: PERMISSIONS.BOTS_CREATE, label: '创建机器人' },
      { key: PERMISSIONS.BOTS_DELETE, label: '删除机器人' },
      { key: PERMISSIONS.BOT_START, label: '启动机器人' },
      { key: PERMISSIONS.BOT_STOP, label: '停止机器人' },
      { key: PERMISSIONS.BOT_EDIT, label: '修改机器人资料' },
      { key: PERMISSIONS.BOT_TOKEN, label: '更换机器人 Token' },
    ],
  },
  {
    label: '群组权限',
    items: [
      { key: PERMISSIONS.GROUPS_VIEW, label: '查看群组' },
      { key: PERMISSIONS.GROUPS_EDIT, label: '编辑群组配置' },
      { key: PERMISSIONS.GROUPS_DELETE, label: '删除群组' },
    ],
  },
  {
    label: '内容与审核',
    items: [
      { key: PERMISSIONS.WELCOME_EDIT, label: '欢迎消息' },
      { key: PERMISSIONS.VERIFY_EDIT, label: '进群验证' },
      { key: PERMISSIONS.CHANNEL_GATE_EDIT, label: '关注频道解禁' },
      { key: PERMISSIONS.FILTER_ADS, label: '广告过滤' },
      { key: PERMISSIONS.FILTER_LINKS, label: '链接过滤' },
      { key: PERMISSIONS.FILTER_KEYWORDS, label: '关键词过滤' },
      { key: PERMISSIONS.ANTIFLOOD_EDIT, label: '自动禁言' },
      { key: PERMISSIONS.BLACKLIST_EDIT, label: '黑名单' },
      { key: PERMISSIONS.WHITELIST_EDIT, label: '白名单' },
      { key: PERMISSIONS.SCHEDULE_MANAGE, label: '定时发送' },
    ],
  },
  {
    label: '营销中心',
    items: [
      { key: PERMISSIONS.MARKETING_VIEW, label: '进入营销中心' },
      { key: PERMISSIONS.BUTTON_MANAGE, label: '管理按钮库' },
      { key: PERMISSIONS.TEMPLATE_MANAGE, label: '管理消息模板' },
      { key: PERMISSIONS.TEMPLATE_APPLY, label: '批量应用广告模板' },
      { key: PERMISSIONS.TEMPLATE_UNAPPLY, label: '移除广告模板应用' },
    ],
  },
  {
    label: '广告管理',
    items: [
      { key: PERMISSIONS.AD_VIEW, label: '查看广告' },
      { key: PERMISSIONS.AD_CREATE, label: '创建广告' },
      { key: PERMISSIONS.AD_EDIT, label: '编辑广告' },
      { key: PERMISSIONS.AD_DELETE, label: '删除广告' },
      { key: PERMISSIONS.AD_TOGGLE, label: '启用/关闭广告' },
      { key: PERMISSIONS.AD_ASSIGN_BOT, label: '给机器人分配广告' },
      { key: PERMISSIONS.AD_ASSIGN_GROUP, label: '给群组分配广告' },
      { key: PERMISSIONS.AD_STATS, label: '查看广告统计' },
    ],
  },
  {
    label: '数据与系统',
    items: [
      { key: PERMISSIONS.STATS_VIEW, label: '查看统计' },
      { key: PERMISSIONS.LOGS_VIEW, label: '查看日志' },
      { key: PERMISSIONS.ADMINS_MANAGE, label: '管理管理员' },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: '系统设置' },
    ],
  },
];
