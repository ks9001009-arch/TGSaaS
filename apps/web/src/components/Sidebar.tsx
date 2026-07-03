'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Users,
  Bot,
  BarChart3,
  UserCircle,
  Settings,
  LogOut,
  Sun,
  Moon,
  Megaphone,
  ShieldCheck,
  FileText,
  MousePointerClick,
  Layers,
  Clock,
  ChevronDown,
  ChevronRight,
  Radio,
  Phone,
  KeyRound,
  Send,
  ListChecks,
  ServerCog,
  KeySquare,
  AtSign,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAccess, PERM } from '@/lib/access';
import { useEffect, useMemo, useState } from 'react';

type NavLink = { href: string; label: string; icon: any; show: boolean };
type NavSection = {
  id: string;
  title: string;
  icon: any;
  href?: string; // direct-link section (no children)
  items?: NavLink[];
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { isSuper, can } = useAccess();
  const [light, setLight] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Enterprise-style module structure. Each module groups related features so
  // that new functionality drops into an existing module instead of adding a
  // new top-level menu. Every entry is RBAC-gated via `show`.
  const sections: NavSection[] = useMemo(
    () => [
      {
        id: 'dashboard',
        title: '仪表盘 Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
      },
      {
        id: 'bots',
        title: '机器人中心',
        icon: Bot,
        items: [
          { href: '/dashboard/bots', label: '我的机器人', icon: Bot, show: isSuper || can(PERM.BOT_VIEW) },
        ],
      },
      {
        id: 'groups',
        title: '群组中心',
        icon: Users,
        items: [
          { href: '/dashboard/groups', label: '我的群组', icon: Users, show: can(PERM.GROUPS_VIEW) },
        ],
      },
      {
        id: 'listener',
        title: '监听中心',
        icon: Radio,
        items: [
          { href: '/dashboard/listener', label: '监听账号', icon: Phone, show: isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_ACCOUNT) },
          { href: '/dashboard/listener/groups', label: '监听群组', icon: Users, show: isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_GROUP) },
          { href: '/dashboard/listener/rules', label: '关键词规则', icon: KeyRound, show: isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_RULE) },
          { href: '/dashboard/listener/targets', label: '推送目标', icon: Send, show: isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_PUSH) },
          { href: '/dashboard/listener/bots', label: '监控机器人名单', icon: Bot, show: isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_RULE) },
          { href: '/dashboard/listener/hits', label: '命中记录', icon: ListChecks, show: isSuper || can(PERM.LISTENER_STATS) },
        ],
      },
      {
        id: 'collection',
        title: '采集中心',
        icon: AtSign,
        items: [
          { href: '/dashboard/collection', label: '采集记录 / 查询', icon: ListChecks, show: isSuper || can(PERM.COLLECTION_VIEW) },
          { href: '/dashboard/collection/settings', label: '采集设置', icon: SlidersHorizontal, show: isSuper || can(PERM.COLLECTION_MANAGE) },
        ],
      },
      {
        id: 'marketing',
        title: '营销中心',
        icon: Megaphone,
        items: [
          { href: '/dashboard/marketing', label: '营销概览', icon: Megaphone, show: isSuper || can(PERM.MARKETING_VIEW) || can(PERM.AD_VIEW) },
          { href: '/dashboard/marketing/templates', label: '消息模板', icon: FileText, show: isSuper || can(PERM.TEMPLATE_MANAGE) || can(PERM.MARKETING_VIEW) },
          { href: '/dashboard/marketing/buttons', label: '按钮库', icon: MousePointerClick, show: isSuper || can(PERM.BUTTON_MANAGE) || can(PERM.MARKETING_VIEW) },
          { href: '/dashboard/ads', label: '广告管理', icon: Megaphone, show: isSuper || can(PERM.AD_VIEW) },
          { href: '/dashboard/schedule', label: '定时发送', icon: Clock, show: can(PERM.SCHEDULE_MANAGE) },
          { href: '/dashboard/marketing/batch', label: '批量应用', icon: Layers, show: isSuper || can(PERM.TEMPLATE_APPLY) || can(PERM.TEMPLATE_UNAPPLY) || can(PERM.MARKETING_VIEW) },
        ],
      },
      {
        id: 'admins',
        title: '管理员中心',
        icon: ShieldCheck,
        items: [
          { href: '/dashboard/admins', label: '管理员列表', icon: ShieldCheck, show: isSuper || can(PERM.ADMINS_MANAGE) },
        ],
      },
      {
        id: 'data',
        title: '数据中心',
        icon: BarChart3,
        items: [
          { href: '/dashboard/stats', label: '数据统计', icon: BarChart3, show: can(PERM.STATS_VIEW) },
        ],
      },
      {
        id: 'platform',
        title: '系统中心',
        icon: ServerCog,
        items: [
          { href: '/dashboard/system/telegram-api', label: 'Telegram API', icon: KeySquare, show: isSuper },
          { href: '/dashboard/settings', label: '系统设置', icon: Settings, show: isSuper || can(PERM.SETTINGS_MANAGE) },
          { href: '/dashboard/account', label: '我的账户', icon: UserCircle, show: true },
        ],
      },
    ],
    [isSuper, can],
  );

  // Keep only sections that have at least one visible child (or a visible direct link).
  const visibleSections = useMemo(
    () =>
      sections
        .map((s) => ({ ...s, items: s.items?.filter((i) => i.show) }))
        .filter((s) => (s.href ? true : (s.items?.length ?? 0) > 0)),
    [sections],
  );

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  // Auto-expand the module that contains the active route.
  useEffect(() => {
    const active = visibleSections.find((s) => s.items?.some((i) => isActive(i.href)));
    if (active) setCollapsed((prev) => ({ ...prev, [active.id]: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const saved = localStorage.getItem('tg_theme') === 'light';
    setLight(saved);
    document.documentElement.classList.toggle('light', saved);
    document.documentElement.classList.toggle('dark', !saved);
  }, []);

  function toggleTheme() {
    const next = !light;
    setLight(next);
    localStorage.setItem('tg_theme', next ? 'light' : 'dark');
    document.documentElement.classList.toggle('light', next);
    document.documentElement.classList.toggle('dark', !next);
  }

  function toggleSection(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-black/30 bg-tg-panel">
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tg-blue">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">群管理平台</div>
          <div className="text-[11px] text-tg-muted">SaaS Console</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {visibleSections.map((section) => {
          const SectionIcon = section.icon;

          // direct-link section (e.g. Dashboard)
          if (section.href) {
            const active = isActive(section.href);
            return (
              <Link
                key={section.id}
                href={section.href}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-tg-blue/15 text-tg-blue' : 'text-tg-text/80 hover:bg-white/5',
                )}
              >
                <SectionIcon className="h-[18px] w-[18px]" />
                {section.title}
              </Link>
            );
          }

          const open = !collapsed[section.id];
          const hasActiveChild = section.items?.some((i) => isActive(i.href));

          return (
            <div key={section.id} className="select-none">
              <button
                onClick={() => toggleSection(section.id)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  hasActiveChild ? 'text-tg-text' : 'text-tg-text/70 hover:bg-white/5',
                )}
              >
                <SectionIcon className="h-[18px] w-[18px]" />
                <span className="flex-1 text-left font-medium">{section.title}</span>
                {open ? <ChevronDown className="h-4 w-4 opacity-60" /> : <ChevronRight className="h-4 w-4 opacity-60" />}
              </button>

              {open && (
                <div className="mt-0.5 space-y-0.5 pb-1 pl-3">
                  {section.items!.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors',
                          active ? 'bg-tg-blue/15 text-tg-blue' : 'text-tg-text/70 hover:bg-white/5',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-black/30 p-3">
        <div className="mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm">
          <span className="truncate text-tg-muted">{user?.email}</span>
          <button onClick={toggleTheme} className="rounded-md p-1 hover:bg-white/10" title="切换主题">
            {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
        <button onClick={logout} className="btn-ghost w-full justify-start text-tg-muted">
          <LogOut className="h-4 w-4" /> 退出登录
        </button>
      </div>
    </aside>
  );
}
