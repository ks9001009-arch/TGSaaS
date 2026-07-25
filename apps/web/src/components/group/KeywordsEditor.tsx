'use client';

import { useState } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import { api } from '@/lib/api';

const ACTIONS: { v: string; l: string }[] = [
  { v: 'DELETE', l: '删除消息' },
  { v: 'WARN', l: '警告' },
  { v: 'MUTE', l: '禁言' },
  { v: 'KICK', l: '踢出群' },
  { v: 'BAN', l: '封禁' },
];

const MATCHES: { v: string; l: string }[] = [
  { v: 'CONTAINS', l: '包含' },
  { v: 'EXACT', l: '精确匹配' },
  { v: 'REGEX', l: '正则表达式' },
];

function labelOf(list: { v: string; l: string }[], value: string) {
  return list.find((x) => x.v === value)?.l || value;
}

export default function KeywordsEditor({ group, reload }: { group: any; reload: () => Promise<void> }) {
  const [pattern, setPattern] = useState('');
  const [match, setMatch] = useState('CONTAINS');
  const [action, setAction] = useState('DELETE');
  const [importing, setImporting] = useState(false);
  const [tip, setTip] = useState('');
  const keywords = group.keywords || [];

  async function add() {
    if (!pattern.trim()) return;
    await api.post(`/groups/${group.id}/keywords`, { pattern, match, action });
    setPattern('');
    await reload();
  }
  async function del(id: string) {
    await api.del(`/groups/${group.id}/keywords/${id}`);
    await reload();
  }
  async function importAds() {
    setImporting(true);
    setTip('');
    try {
      const res = await api.post(`/groups/${group.id}/keywords/import-ads`);
      setTip(`已导入 ${res.added} 个广告关键词（当前共 ${res.total} 个）`);
      await reload();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">关键词过滤</h2>
        <button onClick={importAds} className="btn-ghost text-xs" disabled={importing}>
          <Download className="h-4 w-4" /> {importing ? '导入中…' : '导入默认广告关键词'}
        </button>
      </div>
      {tip && <div className="rounded-lg bg-tg-green/15 px-3 py-1.5 text-xs text-tg-green">{tip}</div>}
      <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
        <div>
          <label className="label">关键词 / 正则</label>
          <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="如：免费领取" />
        </div>
        <div>
          <label className="label">匹配方式</label>
          <select className="input" value={match} onChange={(e) => setMatch(e.target.value)}>
            {MATCHES.map((m) => (
              <option key={m.v} value={m.v}>
                {m.l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">处理动作</label>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTIONS.map((a) => (
              <option key={a.v} value={a.v}>
                {a.l}
              </option>
            ))}
          </select>
        </div>
        <button onClick={add} className="btn-primary h-10">
          <Plus className="h-4 w-4" /> 添加
        </button>
      </div>

      <div className="divide-y divide-white/5">
        {keywords.map((k: any) => (
          <div key={k.id} className="flex items-center justify-between py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono">{k.pattern}</span>
              <span className="badge bg-white/5 text-tg-muted">{labelOf(MATCHES, k.match)}</span>
              <span className="badge bg-tg-amber/15 text-tg-amber">{labelOf(ACTIONS, k.action)}</span>
            </div>
            <button onClick={() => del(k.id)} className="btn-danger p-1.5">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {keywords.length === 0 && <p className="py-4 text-sm text-tg-muted">暂无关键词规则</p>}
      </div>
    </div>
  );
}
