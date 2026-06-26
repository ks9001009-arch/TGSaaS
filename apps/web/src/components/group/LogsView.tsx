'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const LABELS: Record<string, string> = {
  WELCOME_SENT: '发送欢迎',
  VERIFY_PASS: '验证通过',
  AD_BLOCKED: '广告拦截',
  KEYWORD: '关键词命中',
  LINK: '链接拦截',
  BLACKLIST: '黑名单处理',
};

export default function LogsView({ groupId }: { groupId: string }) {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    api.get(`/groups/${groupId}/logs?take=200`).then(setLogs).catch(() => {});
  }, [groupId]);

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">管理员日志</h2>
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-tg-muted">
            <tr>
              <th className="py-2">时间</th>
              <th>动作</th>
              <th>目标用户</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="py-2 text-tg-muted">{new Date(l.createdAt).toLocaleString()}</td>
                <td>
                  <span className="badge bg-tg-blue/15 text-tg-blue">{LABELS[l.action] || l.action}</span>
                </td>
                <td className="font-mono text-xs">{l.targetUserId || '-'}</td>
                <td className="text-xs text-tg-muted">{l.detail || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="py-6 text-center text-sm text-tg-muted">暂无日志</p>}
      </div>
    </div>
  );
}
