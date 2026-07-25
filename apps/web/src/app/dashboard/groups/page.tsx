'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    api.get('/groups').then(setGroups).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">我的群组</h1>
        <p className="text-sm text-tg-muted">
          把机器人添加到群组并设为管理员后，群组会自动出现在这里。进入群组可查看互动总览、欢迎/验证等配置。
        </p>
      </div>

      <div className="grid gap-3">
        {groups.map((g) => (
          <Link
            key={g.id}
            href={`/dashboard/groups/${g.id}`}
            className="card flex items-center justify-between hover:border-tg-blue/40"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-blue/15 text-tg-blue">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">{g.title}</div>
                <div className="text-xs text-tg-muted">
                  {g.bot?.name} · 成员 {g.memberCount} · 关键词 {g._count?.keywords ?? 0}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge ${g.status === 'LEFT' ? 'bg-tg-red/15 text-tg-red' : g.isActive ? 'bg-tg-green/15 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>
                {g.status === 'LEFT' ? '已退出' : g.isActive ? '运行中' : '未激活'}
              </span>
              <ChevronRight className="h-4 w-4 text-tg-muted" />
            </div>
          </Link>
        ))}
        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-tg-muted">
            暂无群组。请先在「创建机器人」添加 Bot，再把它拉进群并设为管理员。
          </div>
        )}
      </div>
    </div>
  );
}
