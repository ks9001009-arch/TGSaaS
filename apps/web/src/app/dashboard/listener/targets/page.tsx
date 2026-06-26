'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Plus, Trash2, Power, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

const TYPE_LABEL: Record<string, string> = { BOT: '机器人', GROUP: '群组', CHANNEL: '频道', ADMIN_DM: '管理员私聊' };
const MODE_LABEL: Record<string, string> = {
  PREFER_FORWARD: '优先原消息转发', FORWARD_ONLY: '仅原消息转发', LINK_ONLY: '仅链接形式', FORWARD_THEN_LINK: '转发失败自动链接',
};

type Target = { id: string; label: string; type: string; chatId: string; mode: string; enabled: boolean };

const empty = () => ({ label: '', type: 'GROUP', chatId: '', mode: 'PREFER_FORWARD' });

export default function ListenerTargetsPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();

  const [targets, setTargets] = useState<Target[]>([]);
  const [form, setForm] = useState(empty());
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const canView = isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_PUSH);
  const canManage = isSuper || can(PERM.LISTENER_PUSH);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  async function load() {
    try { setTargets(await api.get('/listener/targets')); } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) load(); }, [canView]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.chatId.trim()) { flash('请填写目标 Chat ID / @用户名。', true); return; }
    try {
      await api.post('/listener/targets', { label: form.label || undefined, type: form.type, chatId: form.chatId.trim(), mode: form.mode });
      setForm(empty()); setShowCreate(false); flash('推送目标已创建。'); await load();
    } catch (e: any) { flash(e.message, true); }
  }

  async function toggle(t: Target) {
    try { await api.patch(`/listener/targets/${t.id}`, { enabled: !t.enabled }); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function remove(t: Target) {
    if (!confirm('删除该推送目标？')) return;
    try { await api.del(`/listener/targets/${t.id}`); await load(); } catch (e: any) { flash(e.message, true); }
  }

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!canView) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Send className="h-6 w-6 text-tg-blue" /> 推送目标</h1>
          <p className="mt-1 text-sm text-tg-muted">命中的消息会推送到这些目标。优先原消息转发；无法转发时按所选方式回退到链接形式。监听账号需为目标成员/可发消息。</p>
        </div>
        {canManage && <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="h-4 w-4" /> 新建目标</button>}
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-tg-muted">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2">备注</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">目标</th>
              <th className="px-3 py-2">推送方式</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-tg-muted">还没有推送目标。</td></tr>}
            {targets.map((t) => (
              <tr key={t.id} className="border-b border-white/5">
                <td className="px-3 py-2 font-medium">{t.label || '—'}</td>
                <td className="px-3 py-2 text-xs text-tg-muted">{TYPE_LABEL[t.type] || t.type}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.chatId}</td>
                <td className="px-3 py-2 text-xs text-tg-muted">{MODE_LABEL[t.mode] || t.mode}</td>
                <td className="px-3 py-2"><span className={`badge ${t.enabled ? 'bg-tg-green/20 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>{t.enabled ? '启用' : '停用'}</span></td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {canManage && <button onClick={() => toggle(t)} className="btn-ghost px-2 py-1 text-xs"><Power className="h-3.5 w-3.5" /></button>}
                    {canManage && <button onClick={() => remove(t)} className="btn-danger px-2 py-1 text-xs"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowCreate(false)}>
          <form onSubmit={create} className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">新建推送目标</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="text-tg-muted hover:text-tg-text"><X className="h-5 w-5" /></button>
            </div>
            <div>
              <label className="label">备注（可选）</label>
              <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="例如：线索汇总群" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">目标类型</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="GROUP">群组</option>
                  <option value="CHANNEL">频道</option>
                  <option value="BOT">机器人</option>
                  <option value="ADMIN_DM">管理员私聊</option>
                </select>
              </div>
              <div>
                <label className="label">推送方式</label>
                <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                  <option value="PREFER_FORWARD">优先原消息转发</option>
                  <option value="FORWARD_ONLY">仅原消息转发</option>
                  <option value="LINK_ONLY">仅链接形式</option>
                  <option value="FORWARD_THEN_LINK">转发失败自动链接</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">目标 Chat ID / @用户名</label>
              <input className="input" value={form.chatId} onChange={(e) => setForm({ ...form, chatId: e.target.value })} placeholder="@my_channel 或 -1001234567890" />
            </div>
            <button className="btn-primary w-full">创建目标</button>
          </form>
        </div>
      )}
    </div>
  );
}
