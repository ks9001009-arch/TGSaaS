'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, X, Copy, ArrowUp, ArrowDown, Power } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

const KIND_LABELS: Record<string, string> = {
  WELCOME: '欢迎消息',
  VERIFY: '进群验证',
  AUTO_REPLY: '自动回复',
  SCHEDULED: '定时消息',
  ANNOUNCEMENT: '公告',
  AD: '广告',
  GENERIC: '通用',
};

const COMPONENT_LABELS: Record<string, string> = {
  TEXT: '文本',
  IMAGE: '图片',
  VIDEO: '视频',
  GIF: 'GIF',
  FILE: '文件',
  BUTTONS: '按钮',
  AD: '广告',
  CHANNEL_CARD: '频道推荐',
  CONTACT_CARD: '联系客服',
  CUSTOM: '自定义',
};

type Tpl = {
  name: string;
  kind: string;
  enabled: boolean;
  botId: string;
  groupId: string;
  ownerAdminId: string;
  components: any[];
};
const empty = (): Tpl => ({ name: '', kind: 'WELCOME', enabled: true, botId: '', groupId: '', ownerAdminId: '', components: [] });

export default function TemplatesPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();
  const [meta, setMeta] = useState<any>({ kinds: [], componentTypes: [], bots: [], groups: [], admins: [], isSuper: false });
  const [list, setList] = useState<any[]>([]);
  const [buttons, setButtons] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Tpl>(empty());
  const [editId, setEditId] = useState('');

  const canView = isSuper || can(PERM.TEMPLATE_MANAGE) || can(PERM.MARKETING_VIEW);
  const canManage = isSuper || can(PERM.TEMPLATE_MANAGE);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  async function load() {
    try {
      const [m, l, b, a] = await Promise.all([
        api.get('/marketing/templates/meta'),
        api.get('/marketing/templates'),
        api.get('/marketing/buttons').catch(() => []),
        api.get('/ads').catch(() => []),
      ]);
      setMeta(m); setList(l); setButtons(b as any[]); setAds(a as any[]);
    } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) load(); }, [canView]);

  // ---------- component editing ----------
  function addComponent(type: string) {
    const base: any = { type };
    if (type === 'BUTTONS') base.buttons = [];
    setForm((f) => ({ ...f, components: [...f.components, base] }));
  }
  function updateComponent(i: number, patch: any) {
    setForm((f) => { const c = [...f.components]; c[i] = { ...c[i], ...patch }; return { ...f, components: c }; });
  }
  function removeComponent(i: number) {
    setForm((f) => ({ ...f, components: f.components.filter((_, idx) => idx !== i) }));
  }
  function moveComponent(i: number, dir: -1 | 1) {
    setForm((f) => {
      const c = [...f.components]; const j = i + dir;
      if (j < 0 || j >= c.length) return f;
      [c[i], c[j]] = [c[j], c[i]];
      return { ...f, components: c };
    });
  }
  function addButtonRef(i: number, buttonId: string) {
    if (!buttonId) return;
    setForm((f) => { const c = [...f.components]; const arr = [...(c[i].buttons || []), { buttonId }]; c[i] = { ...c[i], buttons: arr }; return { ...f, components: c }; });
  }
  function addInlineButton(i: number) {
    setForm((f) => { const c = [...f.components]; const arr = [...(c[i].buttons || []), { label: '', url: '' }]; c[i] = { ...c[i], buttons: arr }; return { ...f, components: c }; });
  }
  function updateButtonItem(i: number, k: number, patch: any) {
    setForm((f) => { const c = [...f.components]; const arr = [...(c[i].buttons || [])]; arr[k] = { ...arr[k], ...patch }; c[i] = { ...c[i], buttons: arr }; return { ...f, components: c }; });
  }
  function removeButtonItem(i: number, k: number) {
    setForm((f) => { const c = [...f.components]; const arr = (c[i].buttons || []).filter((_: any, idx: number) => idx !== k); c[i] = { ...c[i], buttons: arr }; return { ...f, components: c }; });
  }

  function payload() {
    return {
      name: form.name,
      kind: form.kind,
      enabled: form.enabled,
      botId: form.botId || undefined,
      groupId: form.groupId || undefined,
      ownerAdminId: form.ownerAdminId || undefined,
      components: form.components,
    };
  }

  async function create() {
    if (!form.name.trim()) { flash('请填写模板名称。', true); return; }
    try { await api.post('/marketing/templates', payload()); setForm(empty()); setShowCreate(false); flash('模板已创建。'); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  function startEdit(t: any) {
    setEditId(t.id);
    setShowCreate(false);
    setForm({
      name: t.name, kind: t.kind, enabled: t.enabled,
      botId: t.botId || '', groupId: t.groupId || '', ownerAdminId: t.ownerAdminId || '',
      components: Array.isArray(t.components) ? t.components : [],
    });
  }
  async function saveEdit(id: string) {
    try { await api.patch(`/marketing/templates/${id}`, payload()); setEditId(''); flash('已保存。'); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function toggle(t: any) {
    try { await api.patch(`/marketing/templates/${t.id}/toggle`, { enabled: !t.enabled }); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function copy(t: any) {
    try { await api.post(`/marketing/templates/${t.id}/copy`); flash('已复制。'); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function remove(t: any) {
    if (!confirm('确认删除该模板？')) return;
    try { await api.del(`/marketing/templates/${t.id}`); await load(); }
    catch (e: any) { flash(e.message, true); }
  }

  if (!canView) return null;

  const buttonLabel = (id: string) => {
    const b = buttons.find((x) => x.id === id);
    return b ? `${b.emoji ? b.emoji + ' ' : ''}${b.displayName}` : '(已删除按钮)';
  };

  const componentEditor = (c: any, i: number) => (
    <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="badge bg-tg-blue/15 text-tg-blue">{COMPONENT_LABELS[c.type] || c.type}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => moveComponent(i, -1)} className="text-tg-muted"><ArrowUp className="h-4 w-4" /></button>
          <button onClick={() => moveComponent(i, 1)} className="text-tg-muted"><ArrowDown className="h-4 w-4" /></button>
          <button onClick={() => removeComponent(i)} className="text-tg-red"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {c.type === 'TEXT' && (
        <textarea className="input min-h-[64px]" placeholder="支持 {first_name} {group_name} 等变量" value={c.text || ''} onChange={(e) => updateComponent(i, { text: e.target.value })} />
      )}
      {(c.type === 'IMAGE' || c.type === 'VIDEO') && (
        <div className="space-y-2">
          <input className="input" placeholder="媒体 URL" value={c.url || ''} onChange={(e) => updateComponent(i, { url: e.target.value })} />
          <input className="input" placeholder="说明文字（可选）" value={c.caption || ''} onChange={(e) => updateComponent(i, { caption: e.target.value })} />
        </div>
      )}
      {(c.type === 'GIF' || c.type === 'FILE') && (
        <input className="input" placeholder="URL" value={c.url || ''} onChange={(e) => updateComponent(i, { url: e.target.value })} />
      )}
      {c.type === 'AD' && (
        <select className="input" value={c.adId || ''} onChange={(e) => updateComponent(i, { adId: e.target.value })}>
          <option value="">选择广告</option>
          {ads.map((a) => <option key={a.id} value={a.id}>{a.title || '(无标题)'}</option>)}
        </select>
      )}
      {c.type === 'CHANNEL_CARD' && (
        <div className="space-y-2">
          <input className="input" placeholder="频道 @username 或链接" value={c.channel || ''} onChange={(e) => updateComponent(i, { channel: e.target.value })} />
          <input className="input" placeholder="卡片文字（可选）" value={c.title || ''} onChange={(e) => updateComponent(i, { title: e.target.value })} />
          <input className="input" placeholder="按钮文字，默认 📢 关注频道" value={c.buttonText || ''} onChange={(e) => updateComponent(i, { buttonText: e.target.value })} />
        </div>
      )}
      {c.type === 'CONTACT_CARD' && (
        <div className="space-y-2">
          <input className="input" placeholder="客服 @username" value={c.username || ''} onChange={(e) => updateComponent(i, { username: e.target.value })} />
          <input className="input" placeholder="按钮文字，默认 📞 联系客服" value={c.label || ''} onChange={(e) => updateComponent(i, { label: e.target.value })} />
        </div>
      )}
      {c.type === 'CUSTOM' && (
        <textarea className="input min-h-[48px]" placeholder="自定义文本" value={c.text || ''} onChange={(e) => updateComponent(i, { text: e.target.value })} />
      )}
      {c.type === 'BUTTONS' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(c.buttons || []).map((bi: any, k: number) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs">
                {bi.buttonId ? buttonLabel(bi.buttonId) : (
                  <span className="flex items-center gap-1">
                    <input className="input h-6 w-24 py-0 text-xs" placeholder="文字" value={bi.label || ''} onChange={(e) => updateButtonItem(i, k, { label: e.target.value })} />
                    <input className="input h-6 w-32 py-0 text-xs" placeholder="URL" value={bi.url || ''} onChange={(e) => updateButtonItem(i, k, { url: e.target.value })} />
                  </span>
                )}
                <button onClick={() => removeButtonItem(i, k)} className="text-tg-muted hover:text-tg-red"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input h-8 w-auto py-0 text-xs" value="" onChange={(e) => { addButtonRef(i, e.target.value); e.target.value = ''; }}>
              <option value="">+ 从按钮库选择</option>
              {buttons.map((b) => <option key={b.id} value={b.id}>{b.emoji ? b.emoji + ' ' : ''}{b.displayName}</option>)}
            </select>
            <button onClick={() => addInlineButton(i)} className="badge bg-white/10 text-tg-muted"><Plus className="h-3 w-3" /> 自定义按钮</button>
          </div>
        </div>
      )}
    </div>
  );

  const builder = (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">模板名称</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">模板类型</label>
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {(meta.kinds || []).map((k: string) => <option key={k} value={k}>{KIND_LABELS[k] || k}</option>)}
          </select>
        </div>
        <div>
          <label className="label">所属机器人（可选）</label>
          <select className="input" value={form.botId} onChange={(e) => setForm({ ...form, botId: e.target.value })}>
            <option value="">（不限）</option>
            {meta.bots.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">所属群组（可选，优先级最高）</label>
          <select className="input" value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
            <option value="">（不限 / 跟随机器人）</option>
            {meta.groups.map((g: any) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>
        {meta.isSuper && (
          <div>
            <label className="label">分配给下级管理员</label>
            <select className="input" value={form.ownerAdminId} onChange={(e) => setForm({ ...form, ownerAdminId: e.target.value })}>
              <option value="">（租户共享）</option>
              {meta.admins.map((a: any) => <option key={a.id} value={a.id}>{a.displayName || a.email}</option>)}
            </select>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">组件（按顺序渲染）</label>
        </div>
        <div className="space-y-2">
          {form.components.map((c, i) => componentEditor(c, i))}
          {form.components.length === 0 && <div className="text-xs text-tg-muted">还没有组件，点击下方添加。</div>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(meta.componentTypes || []).map((t: string) => (
            <button key={t} onClick={() => addComponent(t)} className="badge bg-white/10 text-tg-muted"><Plus className="h-3 w-3" /> {COMPONENT_LABELS[t] || t}</button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">消息模板 Message Templates</h1>
          <p className="text-sm text-tg-muted">组件化模板，所有机器人消息统一调用。群组模板优先于机器人模板，机器人模板优先于租户级模板。</p>
        </div>
        {canManage && !showCreate && (
          <button onClick={() => { setForm(empty()); setShowCreate(true); setEditId(''); }} className="btn-primary"><Plus className="h-4 w-4" /> 新建模板</button>
        )}
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      {showCreate && canManage && (
        <div className="card">
          <div className="mb-3 font-medium">新建模板</div>
          {builder}
          <div className="mt-3 flex gap-2">
            <button onClick={create} className="btn-primary"><Save className="h-4 w-4" /> 创建</button>
            <button onClick={() => { setShowCreate(false); setForm(empty()); }} className="badge bg-white/10 text-tg-muted"><X className="h-4 w-4" /> 取消</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {list.map((t) => (
          <div key={t.id} className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="badge bg-tg-blue/10 text-tg-blue">{KIND_LABELS[t.kind] || t.kind}</span>
                  <span className={`badge ${t.enabled ? 'bg-tg-green/15 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>{t.enabled ? '启用' : '停用'}</span>
                </div>
                <div className="mt-1 text-xs text-tg-muted">{(t.components?.length || 0)} 个组件 · 机器人 {meta.bots.find((b: any) => b.id === t.botId)?.name || '不限'} · 群组 {meta.groups.find((g: any) => g.id === t.groupId)?.title || '不限'}</div>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(t)} className="badge bg-white/10 text-tg-muted" title="启用/停用"><Power className="h-3.5 w-3.5" /></button>
                  <button onClick={() => copy(t)} className="badge bg-white/10 text-tg-muted" title="复制"><Copy className="h-3.5 w-3.5" /></button>
                  <button onClick={() => (editId === t.id ? setEditId('') : startEdit(t))} className="badge bg-white/10 text-tg-muted">{editId === t.id ? '取消' : '编辑'}</button>
                  <button onClick={() => remove(t)} className="btn-danger text-xs"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
            {editId === t.id && (
              <div className="mt-4 rounded-lg bg-white/5 p-3">
                {builder}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => saveEdit(t.id)} className="btn-primary text-xs"><Save className="h-4 w-4" /> 保存</button>
                  <button onClick={() => setEditId('')} className="badge bg-white/10 text-tg-muted"><X className="h-4 w-4" /> 关闭</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-tg-muted">还没有模板，点击右上角"新建模板"。</div>
        )}
      </div>
    </div>
  );
}
