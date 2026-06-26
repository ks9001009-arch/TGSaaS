'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, X, Copy, ArrowUp, ArrowDown, Power } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

const LINK_TYPES = [
  { v: 'URL', label: 'Web 链接' },
  { v: 'USER', label: 'Telegram 用户' },
  { v: 'GROUP', label: 'Telegram 群组' },
  { v: 'CHANNEL', label: 'Telegram 频道' },
  { v: 'MINIAPP', label: 'Mini App' },
];

type Form = {
  name: string;
  displayName: string;
  emoji: string;
  linkType: string;
  target: string;
  enabled: boolean;
};
const empty = (): Form => ({ name: '', displayName: '', emoji: '', linkType: 'URL', target: '', enabled: true });

export default function ButtonsPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();
  const [list, setList] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Form>(empty());
  const [editId, setEditId] = useState('');

  const canView = isSuper || can(PERM.BUTTON_MANAGE) || can(PERM.MARKETING_VIEW);
  const canManage = isSuper || can(PERM.BUTTON_MANAGE);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  async function load() {
    try { setList(await api.get('/marketing/buttons')); } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) load(); }, [canView]);

  async function create() {
    if (!form.name.trim() || !form.displayName.trim() || !form.target.trim()) { flash('请填写按钮名称、显示名称与跳转目标。', true); return; }
    try {
      await api.post('/marketing/buttons', form);
      setForm(empty()); setShowCreate(false); flash('按钮已创建。'); await load();
    } catch (e: any) { flash(e.message, true); }
  }

  function startEdit(b: any) {
    setEditId(b.id);
    setForm({ name: b.name, displayName: b.displayName, emoji: b.emoji || '', linkType: b.linkType, target: b.target, enabled: b.enabled });
  }
  async function saveEdit(id: string) {
    try { await api.patch(`/marketing/buttons/${id}`, form); setEditId(''); flash('已保存。'); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function toggle(b: any) {
    try { await api.patch(`/marketing/buttons/${b.id}/toggle`, { enabled: !b.enabled }); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function copy(b: any) {
    try { await api.post(`/marketing/buttons/${b.id}/copy`); flash('已复制。'); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function remove(b: any) {
    if (!confirm('确认删除该按钮？')) return;
    try { await api.del(`/marketing/buttons/${b.id}`); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function move(idx: number, dir: -1 | 1) {
    const next = [...list];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setList(next);
    try { await api.patch('/marketing/buttons/reorder', { ids: next.map((b) => b.id) }); }
    catch (e: any) { flash(e.message, true); await load(); }
  }

  if (!canView) return null;

  const formFields = (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="label">按钮名称（后台识别）</label>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="西安会所推广001" />
      </div>
      <div>
        <label className="label">显示名称（用户看到）</label>
        <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="西安98/95会所" />
      </div>
      <div>
        <label className="label">Emoji 图标（可选）</label>
        <input className="input" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="🏛" />
      </div>
      <div>
        <label className="label">跳转方式</label>
        <select className="input" value={form.linkType} onChange={(e) => setForm({ ...form, linkType: e.target.value })}>
          {LINK_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="label">跳转目标（URL / @用户名 / 频道）</label>
        <input className="input" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="https://...  或  @username" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">按钮库 Button Library</h1>
          <p className="text-sm text-tg-muted">全局可复用按钮，可在任意消息模板中引用。支持排序、启用/停用、复制。</p>
        </div>
        {canManage && !showCreate && (
          <button onClick={() => { setForm(empty()); setShowCreate(true); }} className="btn-primary"><Plus className="h-4 w-4" /> 新建按钮</button>
        )}
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      {showCreate && canManage && (
        <div className="card">
          <div className="mb-3 font-medium">新建按钮</div>
          {formFields}
          <div className="mt-3 flex gap-2">
            <button onClick={create} className="btn-primary"><Save className="h-4 w-4" /> 创建</button>
            <button onClick={() => { setShowCreate(false); setForm(empty()); }} className="badge bg-white/10 text-tg-muted"><X className="h-4 w-4" /> 取消</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {list.map((b, idx) => (
          <div key={b.id} className="card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <button disabled={idx === 0} onClick={() => move(idx, -1)} className="text-tg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button disabled={idx === list.length - 1} onClick={() => move(idx, 1)} className="text-tg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm">{b.emoji ? `${b.emoji} ` : ''}{b.displayName}</span>
                    <span className={`badge ${b.enabled ? 'bg-tg-green/15 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>{b.enabled ? '启用' : '停用'}</span>
                  </div>
                  <div className="mt-1 text-xs text-tg-muted">{b.name} · {b.linkType} · {b.target}</div>
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(b)} className="badge bg-white/10 text-tg-muted" title="启用/停用"><Power className="h-3.5 w-3.5" /></button>
                  <button onClick={() => copy(b)} className="badge bg-white/10 text-tg-muted" title="复制"><Copy className="h-3.5 w-3.5" /></button>
                  <button onClick={() => (editId === b.id ? setEditId('') : startEdit(b))} className="badge bg-white/10 text-tg-muted">{editId === b.id ? '取消' : '编辑'}</button>
                  <button onClick={() => remove(b)} className="btn-danger text-xs"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
            {editId === b.id && (
              <div className="mt-3 rounded-lg bg-white/5 p-3">
                {formFields}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => saveEdit(b.id)} className="btn-primary text-xs"><Save className="h-4 w-4" /> 保存</button>
                  <button onClick={() => setEditId('')} className="badge bg-white/10 text-tg-muted"><X className="h-4 w-4" /> 关闭</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-tg-muted">还没有按钮，点击右上角"新建按钮"。</div>
        )}
      </div>
    </div>
  );
}
