'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare,
  CalendarCheck,
  Coins,
  UserCheck,
  Users,
  UserPlus,
  Trophy,
  RefreshCw,
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

type LeaderboardRow = {
  rank: number;
  telegramUserId: string;
  displayName: string;
  value: number;
};

type Overview = {
  today: {
    messages: number;
    checkins: number;
    pointsIssued: number;
    activeMembers: number;
  };
  group: {
    telegramMembers: number;
    registeredMembers: number;
    totalPoints: number;
    averagePoints: number;
  };
  leaderboards: {
    points: LeaderboardRow[];
    messages: LeaderboardRow[];
  };
  trends: Array<{ date: string; messages: number; checkins: number }>;
};

function LeaderboardTable({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: LeaderboardRow[];
}) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-tg-muted">暂无上榜数据</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={`${r.rank}-${r.telegramUserId}`}
              className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-tg-muted">#{r.rank}</span>
                <span className="truncate font-medium">{r.displayName}</span>
              </div>
              <span className="shrink-0 text-tg-blue">
                {r.value}
                {unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EngagementOverview({ groupId }: { groupId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ov = await api.get<Overview>(`/groups/${groupId}/engagement/overview`);
      setData(ov);
    } catch (e: any) {
      setError(e?.message || '加载失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  if (loading && !data) {
    return <div className="text-sm text-tg-muted">加载互动数据…</div>;
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-tg-red/30 bg-tg-red/10 px-4 py-3 text-sm text-tg-red">
        {error}
        <button onClick={load} className="btn-ghost ml-3 h-8 text-xs">
          重试
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">互动运营总览</h2>
          <p className="text-sm text-tg-muted">
            群内发送「签到 / 我的 / 积分榜 / 消息榜」（可带或不带 /）· 今日数据 · 排行榜 · 近 7 天趋势（UTC）
          </p>
        </div>
        <button onClick={load} className="btn-ghost h-9 text-xs" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-tg-muted">今日概览</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="今日消息"
            value={data.today.messages}
            icon={<MessageSquare className="h-5 w-5" />}
          />
          <StatCard
            label="今日签到"
            value={data.today.checkins}
            icon={<CalendarCheck className="h-5 w-5" />}
            accent="text-tg-green"
          />
          <StatCard
            label="今日发放积分"
            value={data.today.pointsIssued}
            icon={<Coins className="h-5 w-5" />}
            accent="text-tg-amber"
          />
          <StatCard
            label="今日活跃成员"
            value={data.today.activeMembers}
            icon={<UserCheck className="h-5 w-5" />}
            accent="text-tg-blue"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-tg-muted">群组概况</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Telegram 成员"
            value={data.group.telegramMembers}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            label="已建档成员"
            value={data.group.registeredMembers}
            icon={<UserPlus className="h-5 w-5" />}
            accent="text-tg-green"
          />
          <StatCard
            label="群内总积分"
            value={data.group.totalPoints}
            icon={<Coins className="h-5 w-5" />}
            accent="text-tg-amber"
          />
          <StatCard
            label="平均积分"
            value={data.group.averagePoints}
            icon={<Trophy className="h-5 w-5" />}
            accent="text-tg-blue"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LeaderboardTable title="积分榜 TOP5" unit=" 分" rows={data.leaderboards.points} />
        <LeaderboardTable title="本月消息榜 TOP5" unit=" 条" rows={data.leaderboards.messages} />
      </div>

      <div className="card">
        <h3 className="mb-4 text-sm font-semibold">近 7 天趋势</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trends}>
              <defs>
                <linearGradient id="engMsg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2ea6ff" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#2ea6ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="engCheckin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4dcb5d" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#4dcb5d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#7d8e9c' }}
                tickFormatter={(d) => String(d).slice(5)}
              />
              <YAxis tick={{ fontSize: 11, fill: '#7d8e9c' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: '#17212b',
                  border: '1px solid #101921',
                  borderRadius: 10,
                  color: '#e8edf2',
                }}
              />
              <Area
                type="monotone"
                dataKey="messages"
                name="消息数"
                stroke="#2ea6ff"
                fill="url(#engMsg)"
              />
              <Area
                type="monotone"
                dataKey="checkins"
                name="签到人数"
                stroke="#4dcb5d"
                fill="url(#engCheckin)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
