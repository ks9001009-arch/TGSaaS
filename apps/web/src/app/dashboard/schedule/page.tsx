'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Power, Megaphone, Radio } from 'lucide-react';
import { api } from '@/lib/api';

export default function SchedulePage() {
  const [bots, setBots] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // scheduled post form
  const [form, setForm] = useState<any>({
    botId: '',
    targetType: 'GROUP',
    targetChatId: '',
    text: '',
    scheduleType: 'DAILY',
    dailyTime: '09:00',
    intervalMinutes: 60,
  });

  // channel form
  const [ch, setCh] = useState<any>({ botId: '', chatId: '', title: '' });

  async function loadAll() {
    const [b, p, c] = await Promise.all([
      api.get('/bots'),
      api.get('/schedule/posts'),
      api.get('/schedule/channels'),
    ]);
    setBots(b);
    setPosts(p);
    setChannels(c);
    if (b[0]) {
      setForm((f: any) => ({ ...f, botId: f.botId || b[0].id }));
      setCh((x: any) => ({ ...x, botId: x.botId || b[0].id }));
    }
  }
  useEffect(() => {
    loadAll().catch(() => {});
  }, []);

  async function createPost(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api.post('/schedule/posts', form);
      setMsg('定时任务已创建');
      setForm({ ...form, text: '', targetChatId: '' });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function togglePost(id: string, enabled: boolean) {
    await api.patch(`/schedule/posts/${id}`, { enabled: !enabled });
    await loadAll();
  }
  async function delPost(id: string) {
    if (!confirm('删除该定时任务？')) return;
    await api.del(`/schedule/posts/${id}`);
    await loadAll();
  }

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/schedule/channels', ch);
      setCh({ ...ch, chatId: '', title: '' });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }
  async function delChannel(id: string) {
    await api.del(`/schedule/channels/${id}`);
    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">定时发送 / 频道</h1>
        <p className="text-sm text-tg-muted">
          按「每日定时」或「固定间隔」向群组或频道自动发送自定义文案。机器人需是目标群/频道的管理员。
        </p>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Channels */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-tg-blue" />
            <h2 className="font-semibold">频道管理</h2>
          </div>
          <form onSubmit={addChannel} className="space-y-2">
            <select className="input" value={ch.botId} onChange={(e) => setCh({ ...ch, botId: e.target.value })}>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (@{b.username})
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="频道 ID 或 @username（如 -1001234567890 / @mychannel）"
              value={ch.chatId}
              onChange={(e) => setCh({ ...ch, chatId: e.target.value })}
              required
            />
            <input className="input" placeholder="频道名称（备注）" value={ch.title} onChange={(e) => setCh({ ...ch, title: e.target.value })} />
            <button className="btn-primary w-full">
              <Plus className="h-4 w-4" /> 添加频道
            </button>
          </form>
          <div className="divide-y divide-white/5">
            {channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {c.title} <span className="font-mono text-xs text-tg-muted">{c.chatId}</span>
                </span>
                <button onClick={() => delChannel(c.id)} className="btn-danger p-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {channels.length === 0 && <p className="py-3 text-sm text-tg-muted">暂无频道</p>}
          </div>
        </div>

        {/* New scheduled post */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-tg-amber" />
            <h2 className="font-semibold">新建定时任务</h2>
          </div>
          <form onSubmit={createPost} className="space-y-2">
            <select className="input" value={form.botId} onChange={(e) => setForm({ ...form, botId: e.target.value })}>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (@{b.username})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
                <option value="GROUP">群组</option>
                <option value="CHANNEL">频道</option>
              </select>
              <input
                className="input"
                placeholder="目标 chat id / @username"
                value={form.targetChatId}
                onChange={(e) => setForm({ ...form, targetChatId: e.target.value })}
                required
              />
            </div>
            <textarea
              className="input h-24 resize-none"
              placeholder="要发送的文案（支持 Markdown）"
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}>
                <option value="DAILY">每日定时</option>
                <option value="INTERVAL">固定间隔</option>
              </select>
              {form.scheduleType === 'DAILY' ? (
                <input className="input" type="time" value={form.dailyTime} onChange={(e) => setForm({ ...form, dailyTime: e.target.value })} />
              ) : (
                <input
                  className="input"
                  type="number"
                  min={1}
                  placeholder="间隔分钟"
                  value={form.intervalMinutes}
                  onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })}
                />
              )}
            </div>
            <p className="text-xs text-tg-muted">每日定时按 UTC 时间触发。</p>
            <button className="btn-primary w-full">
              <Plus className="h-4 w-4" /> 创建任务
            </button>
          </form>
        </div>
      </div>

      {/* Scheduled posts list */}
      <div className="card">
        <h2 className="mb-3 font-semibold">定时任务列表</h2>
        <div className="divide-y divide-white/5">
          {posts.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate">{p.text}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-tg-muted">
                  <span className="badge bg-white/5">{p.targetType}</span>
                  <span className="font-mono">{p.targetChatId}</span>
                  <span className="badge bg-tg-blue/15 text-tg-blue">
                    {p.scheduleType === 'DAILY' ? `每日 ${p.dailyTime} UTC` : `每 ${p.intervalMinutes} 分钟`}
                  </span>
                  {p.nextRunAt && <span>下次：{new Date(p.nextRunAt).toLocaleString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${p.enabled ? 'bg-tg-green/15 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>
                  {p.enabled ? '启用' : '停用'}
                </span>
                <button onClick={() => togglePost(p.id, p.enabled)} className="btn-ghost p-1.5">
                  <Power className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => delPost(p.id)} className="btn-danger p-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {posts.length === 0 && <p className="py-4 text-sm text-tg-muted">暂无定时任务</p>}
        </div>
      </div>
    </div>
  );
}
