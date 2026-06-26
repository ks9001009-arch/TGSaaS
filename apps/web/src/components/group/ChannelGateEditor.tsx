'use client';

import { useState } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

export default function ChannelGateEditor({ group, reload }: { group: any; reload: () => Promise<void> }) {
  const cg = group.channelGate || {};
  const [s, setS] = useState({
    enabled: cg.enabled ?? false,
    channel: cg.channel ?? '',
    promptText: cg.promptText ?? '👋 欢迎！请先关注我们的频道后，点击下方按钮解除禁言。',
    buttonText: cg.buttonText ?? '✅ 我已关注',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set(patch: any) {
    setS((prev) => ({ ...prev, ...patch }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    await api.put(`/groups/${group.id}/channel-gate`, {
      ...s,
      channel: s.channel || null,
    });
    await reload();
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <h2 className="font-semibold">关注频道后解除禁言</h2>
        <p className="text-sm text-tg-muted">
          该功能与「新人验证」相互独立。开启后，新成员进群会被自动禁言，必须关注指定频道并点击按钮，
          机器人核实已关注后才会解除禁言。
        </p>

        <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
          启用「关注频道解除禁言」
          <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </label>

        <div>
          <label className="label">指定频道（@用户名 或 t.me 链接 或 -100 频道ID）</label>
          <input
            className="input"
            value={s.channel}
            onChange={(e) => set({ channel: e.target.value })}
            placeholder="@your_channel"
          />
        </div>

        <div>
          <label className="label">解禁提示文案</label>
          <textarea
            className="input min-h-[80px]"
            value={s.promptText}
            onChange={(e) => set({ promptText: e.target.value })}
          />
        </div>

        <div>
          <label className="label">按钮文字</label>
          <input className="input" value={s.buttonText} onChange={(e) => set({ buttonText: e.target.value })} />
        </div>

        <button onClick={save} className="btn-primary" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存'}
        </button>
        {saved && <span className="ml-2 text-sm text-tg-green">已保存</span>}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-2 text-tg-amber">
          <AlertTriangle className="h-4 w-4" />
          <h2 className="font-semibold">重要提示</h2>
        </div>
        <p className="text-sm text-tg-muted">
          机器人必须是目标频道的<strong className="text-white"> 管理员</strong>，否则无法检测用户是否已关注频道，
          解禁将一直失败。
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-tg-muted">
          <li>公开频道请填写 <code>@用户名</code> 或 <code>https://t.me/用户名</code>。</li>
          <li>私有频道请填写数字频道 ID（形如 <code>-100xxxxxxxxxx</code>），并把机器人加为频道管理员。</li>
          <li>机器人同时也必须是<strong className="text-white">本群管理员</strong>，才能执行禁言/解禁。</li>
          <li>若同时开启「新人验证」，将先完成验证，再要求关注频道，两者不冲突。</li>
        </ul>
      </div>
    </div>
  );
}
