'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '@/lib/api';

export default function WelcomeEditor({ group, reload }: { group: any; reload: () => Promise<void> }) {
  const w = group.welcome || {};
  const [enabled, setEnabled] = useState(w.enabled ?? true);
  const [text, setText] = useState(w.text ?? '');
  const [mediaType, setMediaType] = useState(w.mediaType ?? 'NONE');
  const [mediaUrl, setMediaUrl] = useState(w.mediaUrl ?? '');
  const [autoDelete, setAutoDelete] = useState(w.autoDeleteSeconds ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await api.put(`/groups/${group.id}/welcome`, {
      enabled,
      text,
      mediaType,
      mediaUrl: mediaUrl || null,
      autoDeleteSeconds: Number(autoDelete),
    });
    await reload();
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">欢迎消息</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            启用
          </label>
        </div>

        <div>
          <label className="label">欢迎文本（支持 Markdown，可用占位符）</label>
          <textarea
            className="input h-40 resize-none font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1 text-xs text-tg-muted">
            可用占位符：{'{first_name}'} {'{username}'} {'{group_name}'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">媒体类型</label>
            <select className="input" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
              <option value="NONE">无</option>
              <option value="PHOTO">图片</option>
              <option value="GIF">GIF</option>
              <option value="VIDEO">视频</option>
            </select>
          </div>
          <div>
            <label className="label">自动删除（秒，0=不删）</label>
            <input
              className="input"
              type="number"
              value={autoDelete}
              onChange={(e) => setAutoDelete(Number(e.target.value))}
            />
          </div>
        </div>

        {mediaType !== 'NONE' && (
          <div>
            <label className="label">媒体 URL / file_id</label>
            <input className="input" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
          </div>
        )}

        <button onClick={save} className="btn-primary" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存'}
        </button>
        {saved && <span className="ml-2 text-sm text-tg-green">已保存</span>}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">预览</h2>
        <div className="rounded-xl bg-tg-bg p-4">
          {mediaType !== 'NONE' && mediaUrl && (
            <div className="mb-3 flex h-40 items-center justify-center rounded-lg bg-white/5 text-xs text-tg-muted">
              [{mediaType} 媒体预览]
            </div>
          )}
          <div className="whitespace-pre-wrap text-sm">
            {text
              .replace(/\{first_name\}/g, '小明')
              .replace(/\{username\}/g, '@xiaoming')
              .replace(/\{group_name\}/g, group.title)}
          </div>
          {group.welcome?.buttons?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {group.welcome.buttons.map((b: any) => (
                <span key={b.id} className="badge bg-tg-blue/15 text-tg-blue">
                  {b.emoji} {b.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
