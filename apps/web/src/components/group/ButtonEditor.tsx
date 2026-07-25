'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, ArrowUp, ArrowDown, MousePointerClick } from 'lucide-react';
import { api } from '@/lib/api';

interface Btn {
  id?: string;
  label: string;
  type: string;
  url?: string;
  emoji?: string;
  row: number;
  position: number;
  clickCount?: number;
}

const TYPES = [
  { v: 'URL', l: '任意网页' },
  { v: 'TELEGRAM_GROUP', l: 'TG 群' },
  { v: 'TELEGRAM_CHANNEL', l: 'TG 频道' },
  { v: 'BOT', l: '机器人' },
  { v: 'SUPPORT', l: '客服' },
  { v: 'CALLBACK', l: '回调' },
];

export default function ButtonEditor({ group, reload }: { group: any; reload: () => Promise<void> }) {
  const [buttons, setButtons] = useState<Btn[]>(
    (group.welcome?.buttons || []).map((b: any) => ({
      id: b.id,
      label: b.label,
      type: b.type,
      url: b.url || '',
      emoji: b.emoji || '',
      row: b.row,
      position: b.position,
      clickCount: b.clickCount,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<Btn>) {
    setButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function add() {
    setButtons((prev) => [...prev, { label: '新按钮', type: 'URL', url: '', emoji: '', row: prev.length, position: 0 }]);
  }
  function remove(i: number) {
    setButtons((prev) => prev.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    setButtons((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    await api.put(`/groups/${group.id}/buttons`, {
      buttons: buttons.map((b, i) => ({ ...b, position: i })),
    });
    await reload();
    setSaving(false);
    setSaved(true);
  }

  // group preview by row
  const rows = buttons.reduce<Record<number, Btn[]>>((acc, b) => {
    (acc[b.row] = acc[b.row] || []).push(b);
    return acc;
  }, {});

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">按钮列表</h2>
          <button onClick={add} className="btn-ghost text-xs">
            <Plus className="h-4 w-4" /> 添加按钮
          </button>
        </div>

        {buttons.map((b, i) => (
          <div key={i} className="rounded-lg border border-white/10 p-3">
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <input
                className="input w-16 text-center"
                value={b.emoji}
                onChange={(e) => update(i, { emoji: e.target.value })}
                placeholder="😀"
              />
              <input
                className="input"
                value={b.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="按钮文字"
              />
            </div>
            <div className="mt-2 grid grid-cols-[1fr_2fr] gap-2">
              <select className="input" value={b.type} onChange={(e) => update(i, { type: e.target.value })}>
                {TYPES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.l}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={b.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://t.me/客服用户名 或 @username"
              />
            </div>
            {(b.type === 'SUPPORT' || b.type === 'BOT' || b.type === 'TELEGRAM_GROUP' || b.type === 'TELEGRAM_CHANNEL' || b.type === 'URL') && (
              <p className="mt-1 text-[11px] text-tg-muted">
                {b.type === 'CALLBACK'
                  ? '回调按钮不会打开链接'
                  : '填写链接后点击会直接跳转；客服类型也请填写 https://t.me/... 或 @用户名'}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-tg-muted">
                行号
                <input
                  className="input w-16 py-1"
                  type="number"
                  value={b.row}
                  onChange={(e) => update(i, { row: Number(e.target.value) })}
                />
              </label>
              <div className="flex items-center gap-1">
                {typeof b.clickCount === 'number' && (
                  <span className="badge bg-white/5 text-tg-muted">
                    <MousePointerClick className="mr-1 h-3 w-3" /> {b.clickCount}
                  </span>
                )}
                <button onClick={() => move(i, -1)} className="btn-ghost p-1">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => move(i, 1)} className="btn-ghost p-1">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(i)} className="btn-danger p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        <button onClick={save} className="btn-primary" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存按钮'}
        </button>
        {saved && <span className="ml-2 text-sm text-tg-green">已保存</span>}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">预览（同一行号的按钮显示在一行）</h2>
        <div className="space-y-2 rounded-xl bg-tg-bg p-4">
          {Object.keys(rows)
            .map(Number)
            .sort((a, b) => a - b)
            .map((row) => (
              <div key={row} className="flex flex-wrap gap-2">
                {rows[row].map((b, i) => (
                  <span key={i} className="rounded-lg bg-tg-blue px-3 py-1.5 text-sm text-white">
                    {b.emoji} {b.label}
                  </span>
                ))}
              </div>
            ))}
          {buttons.length === 0 && <p className="text-sm text-tg-muted">暂无按钮</p>}
        </div>
        <p className="mt-3 text-xs text-tg-muted">
          支持：群 / 频道 / Bot / 客服 / 网页。只要填了链接就会跳转；类型选「回调」才不会打开链接。
          一行多个按钮、排序、Emoji 与点击统计。
        </p>
      </div>
    </div>
  );
}
