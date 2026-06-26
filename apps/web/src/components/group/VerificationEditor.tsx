'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '@/lib/api';

const MODES = [
  { v: 'NONE', l: '关闭' },
  { v: 'BUTTON', l: '按钮验证' },
  { v: 'MATH', l: '数学题' },
  { v: 'CAPTCHA', l: '验证码' },
  { v: 'IMAGE', l: '图片验证' },
  { v: 'TURNSTILE', l: 'Cloudflare Turnstile (占位)' },
  { v: 'RECAPTCHA', l: 'Google reCAPTCHA (占位)' },
];

const FAIL = [
  { v: 'KICK', l: '踢出' },
  { v: 'BAN', l: '封禁' },
  { v: 'MUTE', l: '禁言' },
  { v: 'NONE', l: '不处理' },
];

export default function VerificationEditor({ group, reload }: { group: any; reload: () => Promise<void> }) {
  const v = group.verification || {};
  const [s, setS] = useState({
    enabled: v.enabled ?? true,
    mode: v.mode ?? 'BUTTON',
    timeoutSeconds: v.timeoutSeconds ?? 120,
    failAction: v.failAction ?? 'KICK',
    requireChannelJoin: v.requireChannelJoin ?? false,
    requiredChannel: v.requiredChannel ?? '',
    minAccountAgeDays: v.minAccountAgeDays ?? 0,
    checkUsername: v.checkUsername ?? false,
    checkAvatar: v.checkAvatar ?? false,
    premiumOnly: v.premiumOnly ?? false,
    aiRiskScoring: v.aiRiskScoring ?? false,
    aiRiskThreshold: v.aiRiskThreshold ?? 70,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set(patch: any) {
    setS((prev) => ({ ...prev, ...patch }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    await api.put(`/groups/${group.id}/verification`, {
      ...s,
      requiredChannel: s.requiredChannel || null,
      timeoutSeconds: Number(s.timeoutSeconds),
      minAccountAgeDays: Number(s.minAccountAgeDays),
      aiRiskThreshold: Number(s.aiRiskThreshold),
    });
    await reload();
    setSaving(false);
    setSaved(true);
  }

  const toggle = (key: keyof typeof s, label: string) => (
    <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
      {label}
      <input type="checkbox" checked={s[key] as boolean} onChange={(e) => set({ [key]: e.target.checked })} />
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <h2 className="font-semibold">验证方式</h2>
        <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
          启用进群验证
          <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">验证模式</label>
            <select className="input" value={s.mode} onChange={(e) => set({ mode: e.target.value })}>
              {MODES.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">超时时间 (秒)</label>
            <input className="input" type="number" value={s.timeoutSeconds} onChange={(e) => set({ timeoutSeconds: e.target.value })} />
          </div>
          <div>
            <label className="label">验证失败处理</label>
            <select className="input" value={s.failAction} onChange={(e) => set({ failAction: e.target.value })}>
              {FAIL.map((f) => (
                <option key={f.v} value={f.v}>
                  {f.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">最小账号年龄 (天)</label>
            <input className="input" type="number" value={s.minAccountAgeDays} onChange={(e) => set({ minAccountAgeDays: e.target.value })} />
          </div>
        </div>

        <button onClick={save} className="btn-primary" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存'}
        </button>
        {saved && <span className="ml-2 text-sm text-tg-green">已保存</span>}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">风控开关</h2>
        {toggle('requireChannelJoin', '要求加入指定频道')}
        {s.requireChannelJoin && (
          <input
            className="input"
            value={s.requiredChannel}
            onChange={(e) => set({ requiredChannel: e.target.value })}
            placeholder="@channel"
          />
        )}
        {toggle('checkUsername', '用户名检测')}
        {toggle('checkAvatar', '头像检测')}
        {toggle('premiumOnly', '仅允许 Premium 用户')}
        {toggle('aiRiskScoring', 'AI 风险评分 (占位)')}
        {s.aiRiskScoring && (
          <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            风险阈值 (0-100，超过则拒绝)
            <input
              className="input w-20 py-1"
              type="number"
              value={s.aiRiskThreshold}
              onChange={(e) => set({ aiRiskThreshold: e.target.value })}
            />
          </label>
        )}
        <p className="text-xs text-tg-muted">
          Turnstile / reCAPTCHA / AI 风控为预留接口，配置真实密钥后即可生效。
        </p>
      </div>
    </div>
  );
}
