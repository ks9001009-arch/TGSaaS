'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '@/lib/api';

export default function FilterEditor({ group, reload }: { group: any; reload: () => Promise<void> }) {
  const f = group.filter || {};
  const [s, setS] = useState({
    antiAd: f.antiAd ?? true,
    antiSpam: f.antiSpam ?? true,
    linkFilter: f.linkFilter ?? false,
    mediaFilter: f.mediaFilter ?? false,
    antiFlood: f.antiFlood ?? false,
    floodMaxMessages: f.floodMaxMessages ?? 5,
    floodWindowSeconds: f.floodWindowSeconds ?? 5,
    floodMuteSeconds: f.floodMuteSeconds ?? 60,
    floodBanThreshold: f.floodBanThreshold ?? 3,
    floodOffenseWindowHours: f.floodOffenseWindowHours ?? 24,
    warnLimit: f.warnLimit ?? 3,
    warnAction: f.warnAction ?? 'MUTE',
    muteSeconds: f.muteSeconds ?? 3600,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set(patch: any) {
    setS((prev) => ({ ...prev, ...patch }));
  }
  async function save() {
    setSaving(true);
    setSaved(false);
    await api.put(`/groups/${group.id}/filter`, {
      ...s,
      floodMaxMessages: Number(s.floodMaxMessages),
      floodWindowSeconds: Number(s.floodWindowSeconds),
      floodMuteSeconds: Number(s.floodMuteSeconds),
      floodBanThreshold: Number(s.floodBanThreshold),
      floodOffenseWindowHours: Number(s.floodOffenseWindowHours),
      warnLimit: Number(s.warnLimit),
      muteSeconds: Number(s.muteSeconds),
    });
    await reload();
    setSaving(false);
    setSaved(true);
  }

  const toggle = (key: keyof typeof s, label: string, desc: string) => (
    <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-3">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-tg-muted">{desc}</span>
      </span>
      <input type="checkbox" checked={s[key] as boolean} onChange={(e) => set({ [key]: e.target.checked })} />
    </label>
  );

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">广告 / 垃圾信息过滤</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {toggle('antiAd', '自动删除广告', '基于关键词与链接的广告启发式识别')}
        {toggle('antiSpam', '垃圾信息过滤', '高频提及、刷屏检测')}
        {toggle('linkFilter', '链接过滤', '删除含链接的消息')}
        {toggle('mediaFilter', '媒体过滤', '限制图片/视频/文件')}
      </div>
      <div className="space-y-3 rounded-lg border border-white/10 p-3">
        {toggle('antiFlood', '防刷屏（默认关闭）', '同一用户在时间窗口内发送过多消息时自动处理')}
        {s.antiFlood && (
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="label">窗口内最多消息数</label>
              <input
                className="input"
                type="number"
                value={s.floodMaxMessages}
                onChange={(e) => set({ floodMaxMessages: e.target.value })}
              />
            </div>
            <div>
              <label className="label">时间窗口 (秒)</label>
              <input
                className="input"
                type="number"
                value={s.floodWindowSeconds}
                onChange={(e) => set({ floodWindowSeconds: e.target.value })}
              />
            </div>
            <div>
              <label className="label">禁言时长 (秒)</label>
              <input
                className="input"
                type="number"
                value={s.floodMuteSeconds}
                onChange={(e) => set({ floodMuteSeconds: e.target.value })}
              />
            </div>
            <div>
              <label className="label">第几次踢群拉黑</label>
              <input
                className="input"
                type="number"
                value={s.floodBanThreshold}
                onChange={(e) => set({ floodBanThreshold: e.target.value })}
              />
            </div>
            <div>
              <label className="label">违规计数重置 (小时)</label>
              <input
                className="input"
                type="number"
                value={s.floodOffenseWindowHours}
                onChange={(e) => set({ floodOffenseWindowHours: e.target.value })}
              />
            </div>
          </div>
        )}
        <p className="text-xs text-tg-muted">
          累进处罚：同一用户刷屏前 {Number(s.floodBanThreshold) - 1} 次禁言，第 {s.floodBanThreshold} 次直接踢出并加入黑名单；
          违规计数在 {s.floodOffenseWindowHours} 小时后清零。整波刷屏消息会被一起删除（机器人需为本群管理员）。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label">警告上限</label>
          <input className="input" type="number" value={s.warnLimit} onChange={(e) => set({ warnLimit: e.target.value })} />
        </div>
        <div>
          <label className="label">达到上限动作</label>
          <select className="input" value={s.warnAction} onChange={(e) => set({ warnAction: e.target.value })}>
            {['MUTE', 'KICK', 'BAN'].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">禁言时长 (秒)</label>
          <input className="input" type="number" value={s.muteSeconds} onChange={(e) => set({ muteSeconds: e.target.value })} />
        </div>
      </div>
      <button onClick={save} className="btn-primary" disabled={saving}>
        <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存'}
      </button>
      {saved && <span className="ml-2 text-sm text-tg-green">已保存</span>}
    </div>
  );
}
