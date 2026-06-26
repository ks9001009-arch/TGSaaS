'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Ban,
  Bot,
  MousePointerClick,
  MessageSquare,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import StatCard from '@/components/StatCard';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const [ov, setOv] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);

  useEffect(() => {
    api.get('/stats/overview').then(setOv).catch(() => {});
    api.get('/stats/timeseries?days=14').then(setSeries).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">数据概览</h1>
        <p className="text-sm text-tg-muted">实时掌握你的群组与机器人运行情况</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="群组数量" value={ov?.groupCount ?? '—'} icon={<Users className="h-5 w-5" />} />
        <StatCard label="成员总数" value={ov?.memberCount ?? '—'} icon={<Users className="h-5 w-5" />} accent="text-tg-green" />
        <StatCard label="今日新增" value={ov?.today?.newMembers ?? '—'} icon={<UserPlus className="h-5 w-5" />} accent="text-tg-amber" />
        <StatCard label="今日验证" value={ov?.today?.verified ?? '—'} icon={<ShieldCheck className="h-5 w-5" />} accent="text-tg-blue" />
        <StatCard label="广告拦截" value={ov?.today?.adsBlocked ?? '—'} icon={<MessageSquare className="h-5 w-5" />} accent="text-tg-red" />
        <StatCard label="今日封禁" value={ov?.today?.bans ?? '—'} icon={<Ban className="h-5 w-5" />} accent="text-tg-red" />
        <StatCard label="按钮点击" value={ov?.total?.buttonClicks ?? '—'} icon={<MousePointerClick className="h-5 w-5" />} accent="text-tg-amber" />
        <StatCard label="在线机器人" value={`${ov?.onlineBotCount ?? 0}/${ov?.botCount ?? 0}`} icon={<Bot className="h-5 w-5" />} accent="text-tg-green" />
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold">近 14 天趋势</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2ea6ff" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#2ea6ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4dcb5d" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#4dcb5d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7d8e9c' }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#7d8e9c' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#17212b', border: '1px solid #101921', borderRadius: 10, color: '#e8edf2' }}
              />
              <Area type="monotone" dataKey="newMembers" name="新增成员" stroke="#2ea6ff" fill="url(#g1)" />
              <Area type="monotone" dataKey="verified" name="验证通过" stroke="#4dcb5d" fill="url(#g2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
