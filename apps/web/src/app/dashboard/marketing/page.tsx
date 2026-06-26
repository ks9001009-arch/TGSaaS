'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, MousePointerClick, Megaphone, BarChart2, Layers, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

export default function MarketingHome() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();
  const [counts, setCounts] = useState<{ templates?: number; buttons?: number; ads?: number }>({});

  const canView = isSuper || can(PERM.MARKETING_VIEW) || can(PERM.AD_VIEW);

  useEffect(() => {
    if (!loading && !canView) router.replace('/dashboard');
  }, [loading, canView, router]);

  useEffect(() => {
    if (!canView) return;
    Promise.allSettled([
      api.get('/marketing/templates'),
      api.get('/marketing/buttons'),
      api.get('/ads'),
    ]).then(([t, b, a]) => {
      setCounts({
        templates: t.status === 'fulfilled' ? (t.value as any[]).length : undefined,
        buttons: b.status === 'fulfilled' ? (b.value as any[]).length : undefined,
        ads: a.status === 'fulfilled' ? (a.value as any[]).length : undefined,
      });
    });
  }, [canView]);

  if (!canView) return null;

  const cards = [
    {
      href: '/dashboard/marketing/templates',
      icon: FileText,
      title: '消息模板',
      desc: '组件化的统一消息模板：文本 / 图片 / 视频 / 按钮 / 广告 / 频道卡片，所有机器人消息复用。',
      count: counts.templates,
      show: isSuper || can(PERM.TEMPLATE_MANAGE) || can(PERM.MARKETING_VIEW),
    },
    {
      href: '/dashboard/marketing/buttons',
      icon: MousePointerClick,
      title: '按钮库',
      desc: '全局可复用按钮，支持 URL / 用户 / 群组 / 频道 / Mini App，排序、启用、复制。',
      count: counts.buttons,
      show: isSuper || can(PERM.BUTTON_MANAGE) || can(PERM.MARKETING_VIEW),
    },
    {
      href: '/dashboard/marketing/batch',
      icon: Layers,
      title: '批量应用',
      desc: '把一套广告按钮模板一键应用到多个群组：按机器人筛选、全选/反选/排除、单独开关、群组级覆盖与按群统计。',
      count: undefined,
      show: isSuper || can(PERM.TEMPLATE_APPLY) || can(PERM.TEMPLATE_UNAPPLY) || can(PERM.MARKETING_VIEW),
    },
    {
      href: '/dashboard/ads',
      icon: Megaphone,
      title: '广告管理',
      desc: '按钮广告位，投放到欢迎 / 验证完成 / 私聊 / 定时消息，含展示与点击统计。',
      count: counts.ads,
      show: isSuper || can(PERM.AD_VIEW),
    },
    {
      href: '/dashboard/schedule',
      icon: Clock,
      title: '定时发送',
      desc: '定时消息 / 定时广告 / 定时频道推送，按机器人与群组排期投放。',
      count: undefined,
      show: isSuper || can(PERM.SCHEDULE_MANAGE),
    },
  ].filter((c) => c.show);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">营销中心 Marketing Center</h1>
        <p className="text-sm text-tg-muted">
          统一管理所有机器人、群组、频道的推广内容、消息模板、按钮组件与广告投放。组件化设计，无需写死任何按钮或广告。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href} className="card transition-colors hover:bg-white/5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-blue/15 text-tg-blue">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">{c.title}</div>
                  {typeof c.count === 'number' && <div className="text-xs text-tg-muted">{c.count} 项</div>}
                </div>
              </div>
              <p className="mt-3 text-sm text-tg-muted">{c.desc}</p>
            </Link>
          );
        })}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 text-sm font-medium"><BarChart2 className="h-4 w-4" /> 即将推出</div>
        <p className="mt-2 text-sm text-tg-muted">A/B 测试 · 广告套餐 · 广告审核 · 商家管理 · 广告收益统计 —— 均可基于现有组件化架构平滑扩展。</p>
      </div>
    </div>
  );
}
