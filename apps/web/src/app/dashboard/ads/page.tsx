'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, X, BarChart2, Send, Power } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

const PLACEMENT_LABELS: Record<string, string> = {
  WELCOME: '新人欢迎下方',
  PRIVATE_MENU: '私聊菜单',
  POST_VERIFY: '验证完成后',
  SCHEDULED: '群组定时',
  TEMPLATE: '手动群发模板',
};

type Btn = { label: string; url: string };
type Form = {
  title: string;
  body: string;
  placements: string[];
  botId: string;
  groupId: string;
  ownerAdminId: string;
  intervalMinutes: number;
  startAt: string;
  endAt: string;
  buttons: Btn[];
};

const emptyForm = (): Form => ({
  title: '',
  body: '',
  placements: [],
  botId: '',
  groupId: '',
  ownerAdminId: '',
  intervalMinutes: 0,
  startAt: '',
  endAt: '',
  buttons: [{ label: '', url: '' }],
});

export default function AdsPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();
  const [meta, setMeta] = useState<any>({ placements: [], bots: [], groups: [], admins: [], isSuper: false });
  const [ads, setAds] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [editId, setEditId] = useState('');
  const [statsId, setStatsId] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [sendFor, setSendFor] = useState('');
  const [sendGroup, setSendGroup] = useState('');

  const canView = isSuper || can(PERM.AD_VIEW);
  const canCreate = can(PERM.AD_CREATE);
  const canEdit = can(PERM.AD_EDIT);
  const canDelete = can(PERM.AD_DELETE);
  const canToggle = can(PERM.AD_TOGGLE);
  const canStats = can(PERM.AD_STATS);
  const canAssignBot = can(PERM.AD_ASSIGN_BOT);
  const canAssignGroup = can(PERM.AD_ASSIGN_GROUP);

  useEffect(() => {
    if (!loading && !canView) router.replace('/dashboard');
  }, [loading, canView, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m);
    else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  async function loadAll() {
    try {
      const [m, list] = await Promise.all([api.get('/ads/meta'), api.get('/ads')]);
      setMeta(m);
      setAds(list);
    } catch (err: any) {
      flash(err.message, true);
    }
  }
  useEffect(() => { if (canView) loadAll(); }, [canView]);

  function togglePlacement(p: string) {
    setForm((f) => ({
      ...f,
      placements: f.placements.includes(p) ? f.placements.filter((x) => x !== p) : [...f.placements, p],
    }));
  }

  function setBtn(i: number, key: keyof Btn, val: string) {
    setForm((f) => {
      const buttons = [...f.buttons];
      buttons[i] = { ...buttons[i], [key]: val };
      return { ...f, buttons };
    });
  }
  function addBtn() { setForm((f) => ({ ...f, buttons: [...f.buttons, { label: '', url: '' }] })); }
  function removeBtn(i: number) { setForm((f) => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) })); }

  function payloadFromForm() {
    const buttons = form.buttons.filter((b) => b.label.trim() && b.url.trim());
    return {
      title: form.title,
      body: form.body || undefined,
      placements: form.placements,
      botId: form.botId || undefined,
      groupId: form.groupId || undefined,
      ownerAdminId: form.ownerAdminId || undefined,
      intervalMinutes: Number(form.intervalMinutes) || 0,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
      endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
      buttons,
    };
  }

  async function createAd() {
    if (!form.title.trim()) { flash('请填写广告标题。', true); return; }
    try {
      await api.post('/ads', payloadFromForm());
      setForm(emptyForm());
      setShowCreate(false);
      flash('广告已创建。');
      await loadAll();
    } catch (err: any) { flash(err.message, true); }
  }

  function startEdit(ad: any) {
    setEditId(ad.id);
    setStatsId('');
    setForm({
      title: ad.title || '',
      body: ad.body || '',
      placements: ad.placements || [],
      botId: ad.botId || '',
      groupId: ad.groupId || '',
      ownerAdminId: ad.ownerAdminId || '',
      intervalMinutes: ad.intervalMinutes || 0,
      startAt: ad.startAt ? ad.startAt.slice(0, 16) : '',
      endAt: ad.endAt ? ad.endAt.slice(0, 16) : '',
      buttons: ad.buttons?.length ? ad.buttons.map((b: any) => ({ label: b.label, url: b.url })) : [{ label: '', url: '' }],
    });
  }

  async function saveEdit(id: string) {
    try {
      const p = payloadFromForm();
      await api.patch(`/ads/${id}`, p);
      await api.put(`/ads/${id}/buttons`, { buttons: p.buttons });
      setEditId('');
      flash('已保存。');
      await loadAll();
    } catch (err: any) { flash(err.message, true); }
  }

  async function toggle(ad: any) {
    try {
      await api.patch(`/ads/${ad.id}/toggle`, { enabled: !ad.enabled });
      await loadAll();
    } catch (err: any) { flash(err.message, true); }
  }

  async function remove(ad: any) {
    if (!confirm('确认删除该广告？相关按钮与统计将一并删除。')) return;
    try {
      await api.del(`/ads/${ad.id}`);
      await loadAll();
    } catch (err: any) { flash(err.message, true); }
  }

  async function assign(ad: any, field: 'botId' | 'groupId' | 'ownerAdminId', value: string) {
    try {
      await api.patch(`/ads/${ad.id}/assign`, { [field]: value || null });
      flash('已更新分配。');
      await loadAll();
    } catch (err: any) { flash(err.message, true); }
  }

  async function openStats(ad: any) {
    if (statsId === ad.id) { setStatsId(''); setStats(null); return; }
    try {
      setEditId('');
      setStats(await api.get(`/ads/${ad.id}/stats`));
      setStatsId(ad.id);
    } catch (err: any) { flash(err.message, true); }
  }

  async function doSend(ad: any) {
    if (!sendGroup) { flash('请选择群组。', true); return; }
    try {
      await api.post(`/ads/${ad.id}/send`, { groupId: sendGroup });
      setSendFor('');
      setSendGroup('');
      flash('已发送到所选群组。');
      await loadAll();
    } catch (err: any) { flash(err.message, true); }
  }

  if (!canView) return null;

  const renderForm = (onSubmit: () => void, submitLabel: string) => (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label">广告标题</label>
        <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="md:col-span-2">
        <label className="label">广告正文</label>
        <textarea className="input min-h-[72px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </div>

      <div className="md:col-span-2">
        <label className="label">展示位置</label>
        <div className="flex flex-wrap gap-2">
          {(meta.placements || []).map((p: string) => (
            <button type="button" key={p} onClick={() => togglePlacement(p)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                form.placements.includes(p) ? 'border-tg-blue bg-tg-blue/15 text-tg-blue' : 'border-white/10 text-tg-muted hover:bg-white/5'
              }`}>
              {PLACEMENT_LABELS[p] || p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">所属机器人</label>
        <select className="input" value={form.botId} onChange={(e) => setForm({ ...form, botId: e.target.value })}>
          <option value="">（不限 / 未指定）</option>
          {meta.bots.map((b: any) => <option key={b.id} value={b.id}>{b.name} (@{b.username || '?'})</option>)}
        </select>
      </div>
      <div>
        <label className="label">所属群组</label>
        <select className="input" value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
          <option value="">（不限 / 跟随机器人）</option>
          {meta.groups.map((g: any) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </div>

      {meta.isSuper && (
        <div>
          <label className="label">分配给下级管理员</label>
          <select className="input" value={form.ownerAdminId} onChange={(e) => setForm({ ...form, ownerAdminId: e.target.value })}>
            <option value="">（自己持有）</option>
            {meta.admins.map((a: any) => <option key={a.id} value={a.id}>{a.displayName || a.email}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label">定时间隔（分钟，0=不定时）</label>
        <input className="input" type="number" min={0} value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })} />
      </div>
      <div>
        <label className="label">开始时间（可选）</label>
        <input className="input" type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
      </div>
      <div>
        <label className="label">结束时间（可选）</label>
        <input className="input" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
      </div>

      <div className="md:col-span-2">
        <label className="label">按钮（文字 + 跳转链接）</label>
        <div className="space-y-2">
          {form.buttons.map((b, i) => (
            <div key={i} className="flex gap-2">
              <input className="input flex-1" placeholder="按钮文字，如 西安98/95会所" value={b.label} onChange={(e) => setBtn(i, 'label', e.target.value)} />
              <input className="input flex-1" placeholder="https://t.me/..." value={b.url} onChange={(e) => setBtn(i, 'url', e.target.value)} />
              <button type="button" onClick={() => removeBtn(i)} className="btn-danger px-2"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={addBtn} className="badge bg-white/10 text-tg-muted"><Plus className="h-3 w-3" /> 添加按钮</button>
        </div>
      </div>

      <div className="md:col-span-2 flex gap-2">
        <button type="button" onClick={onSubmit} className="btn-primary"><Save className="h-4 w-4" /> {submitLabel}</button>
        <button type="button" onClick={() => { setShowCreate(false); setEditId(''); setForm(emptyForm()); }} className="badge bg-white/10 text-tg-muted"><X className="h-4 w-4" /> 取消</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">广告管理</h1>
          <p className="text-sm text-tg-muted">创建按钮广告位，分配给机器人 / 群组 / 下级管理员，并统计展示与点击。</p>
        </div>
        {canCreate && !showCreate && (
          <button onClick={() => { setForm(emptyForm()); setShowCreate(true); }} className="btn-primary"><Plus className="h-4 w-4" /> 新建广告</button>
        )}
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      {showCreate && canCreate && (
        <div className="card">
          <div className="mb-3 font-medium">新建广告</div>
          {renderForm(createAd, '创建广告')}
        </div>
      )}

      <div className="space-y-4">
        {ads.map((ad) => (
          <div key={ad.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ad.title || '(无标题)'}</span>
                  <span className={`badge ${ad.enabled ? 'bg-tg-green/15 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>{ad.enabled ? '已启用' : '已停用'}</span>
                </div>
                {ad.body && <div className="mt-1 truncate text-sm text-tg-muted">{ad.body}</div>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {(ad.placements || []).map((p: string) => (
                    <span key={p} className="badge bg-tg-blue/10 text-tg-blue">{PLACEMENT_LABELS[p] || p}</span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-tg-muted">
                  机器人：{ad.bot ? `${ad.bot.name}` : '不限'} · 群组：{ad.group?.title || '跟随机器人'} · 持有：{ad.ownerAdmin?.displayName || ad.ownerAdmin?.email || '我'}
                </div>
                <div className="mt-1 text-xs text-tg-muted">展示 {ad.impressions} 次 · 点击 {ad.clicks} 次 · 按钮 {ad.buttons?.length || 0} 个</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {canToggle && (
                  <button onClick={() => toggle(ad)} className="badge bg-white/10 text-tg-muted" title="启用/停用"><Power className="h-3.5 w-3.5" /></button>
                )}
                {canStats && (
                  <button onClick={() => openStats(ad)} className="badge bg-white/10 text-tg-muted"><BarChart2 className="h-3.5 w-3.5" /> 统计</button>
                )}
                {canEdit && (
                  <button onClick={() => (editId === ad.id ? setEditId('') : startEdit(ad))} className="badge bg-white/10 text-tg-muted">{editId === ad.id ? '取消' : '编辑'}</button>
                )}
                {canEdit && (
                  <button onClick={() => { setSendFor(sendFor === ad.id ? '' : ad.id); setSendGroup(''); }} className="badge bg-white/10 text-tg-muted"><Send className="h-3.5 w-3.5" /> 发送</button>
                )}
                {canDelete && (
                  <button onClick={() => remove(ad)} className="btn-danger text-xs"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>

            {(ad.buttons?.length ?? 0) > 0 && editId !== ad.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                {ad.buttons.map((b: any) => (
                  <span key={b.id} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs">{b.label} · {b.clicks || 0} 次</span>
                ))}
              </div>
            )}

            {(canAssignBot || canAssignGroup) && editId !== ad.id && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                {canAssignBot && (
                  <select className="input h-8 w-auto py-0 text-xs" value={ad.botId || ''} onChange={(e) => assign(ad, 'botId', e.target.value)}>
                    <option value="">分配机器人：不限</option>
                    {meta.bots.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                {canAssignGroup && (
                  <select className="input h-8 w-auto py-0 text-xs" value={ad.groupId || ''} onChange={(e) => assign(ad, 'groupId', e.target.value)}>
                    <option value="">分配群组：不限</option>
                    {meta.groups.map((g: any) => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                )}
                {meta.isSuper && (
                  <select className="input h-8 w-auto py-0 text-xs" value={ad.ownerAdminId || ''} onChange={(e) => assign(ad, 'ownerAdminId', e.target.value)}>
                    <option value="">持有：我</option>
                    {meta.admins.map((a: any) => <option key={a.id} value={a.id}>{a.displayName || a.email}</option>)}
                  </select>
                )}
              </div>
            )}

            {sendFor === ad.id && canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-3">
                <select className="input h-9 w-auto py-0 text-sm" value={sendGroup} onChange={(e) => setSendGroup(e.target.value)}>
                  <option value="">选择目标群组</option>
                  {meta.groups.map((g: any) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
                <button onClick={() => doSend(ad)} className="btn-primary text-xs"><Send className="h-4 w-4" /> 立即发送</button>
              </div>
            )}

            {editId === ad.id && (
              <div className="mt-4 rounded-lg bg-white/5 p-3">
                {renderForm(() => saveEdit(ad.id), '保存修改')}
              </div>
            )}

            {statsId === ad.id && stats && (
              <div className="mt-4 rounded-lg bg-white/5 p-3 text-sm">
                <div className="mb-2 flex gap-4 text-tg-muted">
                  <span>展示 <b className="text-tg-text">{stats.impressions}</b></span>
                  <span>点击 <b className="text-tg-text">{stats.clicks}</b></span>
                  <span>点击率 <b className="text-tg-text">{stats.ctr}%</b></span>
                </div>
                {stats.perButton?.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {stats.perButton.map((b: any) => <span key={b.id} className="badge bg-white/10 text-tg-muted">{b.label}: {b.clicks}</span>)}
                  </div>
                )}
                <div className="text-xs font-semibold text-tg-muted">最近点击</div>
                <div className="mt-1 max-h-48 overflow-y-auto">
                  {stats.recentClicks?.length ? stats.recentClicks.map((c: any, i: number) => (
                    <div key={i} className="flex justify-between border-b border-white/5 py-1 text-xs text-tg-muted">
                      <span>用户 {c.telegramUserId || '?'} · {c.button || ''}</span>
                      <span>{c.group || ''} {new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                  )) : <div className="py-2 text-xs text-tg-muted">暂无点击记录。</div>}
                </div>
              </div>
            )}
          </div>
        ))}
        {ads.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-tg-muted">还没有广告，点击右上角“新建广告”。</div>
        )}
      </div>
    </div>
  );
}
