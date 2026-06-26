'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { api } from '@/lib/api';

export default function StatsPage() {
  const [series, setSeries] = useState<any[]>([]);
  const [ov, setOv] = useState<any>(null);

  useEffect(() => {
    api.get('/stats/timeseries?days=30').then(setSeries).catch(() => {});
    api.get('/stats/overview').then(setOv).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">数据统计中心</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Mini label="总新增成员" v={ov?.total?.newMembers} />
        <Mini label="总验证通过" v={ov?.total?.verified} />
        <Mini label="总广告拦截" v={ov?.total?.adsBlocked} />
        <Mini label="总封禁" v={ov?.total?.bans} />
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold">近 30 天明细</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7d8e9c' }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#7d8e9c' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#17212b', border: '1px solid #101921', borderRadius: 10 }} />
              <Legend />
              <Bar dataKey="newMembers" name="新增" fill="#2ea6ff" radius={[3, 3, 0, 0]} />
              <Bar dataKey="verified" name="验证" fill="#4dcb5d" radius={[3, 3, 0, 0]} />
              <Bar dataKey="adsBlocked" name="拦截" fill="#f0b232" radius={[3, 3, 0, 0]} />
              <Bar dataKey="bans" name="封禁" fill="#e5556a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: any }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-semibold">{v ?? '—'}</div>
      <div className="text-xs text-tg-muted">{label}</div>
    </div>
  );
}
