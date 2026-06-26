'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Plus, Trash2, Power, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

const SCOPE_LABEL: Record<string, string> = { TENANT: '全部群组', ACCOUNT: '按账号', GROUP: '按群组' };

type Rule = {
  id: string; name: string; scope: string; accountId: string | null; chatId: string | null;
  include: string[]; exclude: string[]; regex: string | null; enabled: boolean;
};

const empty = () => ({ name: '', scope: 'TENANT', accountId: '', chatId: '', include: '', exclude: '', regex: '' });

export default function ListenerRulesPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();

  const [rules, setRules] = useState<Rule[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [form, setForm] = useState(empty());
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const canView = isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_RULE);
  const canManage = isSuper || can(PERM.LISTENER_RULE);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  async function load() {
    try {
      const [r, a] = await Promise.all([api.get('/listener/rules'), api.get('/listener/accounts')]);
      setRules(r); setAccounts(a);
    } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) load(); }, [canView]);

  function toLines(v: string): string[] {
    return v.split(/[\n,，]/).map((s) => s.trim()).filter(Boolean);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const include = toLines(form.include);
    if (!include.length) { flash('请至少填写一个包含关键词。', true); return; }
    try {
      await api.post('/listener/rules', {
        name: form.name || undefined,
        scope: form.scope,
        accountId: form.scope === 'TENANT' ? undefined : (form.accountId || undefined),
        chatId: form.scope === 'GROUP' ? (form.chatId || undefined) : undefined,
        include,
        exclude: toLines(form.exclude),
        regex: form.regex || undefined,
      });
      setForm(empty()); setShowCreate(false); flash('规则已创建。'); await load();
    } catch (e: any) { flash(e.message, true); }
  }

  async function toggle(r: Rule) {
    try { await api.patch(`/listener/rules/${r.id}`, { enabled: !r.enabled }); await load(); }
    catch (e: any) { flash(e.message, true); }
  }
  async function remove(r: Rule) {
    if (!confirm('删除该规则？')) return;
    try { await api.del(`/listener/rules/${r.id}`); await load(); } catch (e: any) { flash(e.message, true); }
  }

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!canView) return null;

  const accLabel = (id: string | null) => {
    if (!id) return '—';
    const a = accounts.find((x) => x.id === id);
    return a ? a.phone : id;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><KeyRound className="h-6 w-6 text-tg-blue" /> 关键词规则</h1>
          <p className="mt-1 text-sm text-tg-muted">命中「包含关键词」且不含「排除关键词」的消息会被记录并按推送目标推送。支持按租户 / 按账号 / 按群组配置。</p>
        </div>
        {canManage && <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="h-4 w-4" /> 新建规则</button>}
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-tg-muted">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">范围</th>
              <th className="px-3 py-2">包含关键词</th>
              <th className="px-3 py-2">排除关键词</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-tg-muted">还没有关键词规则。</td></tr>}
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-white/5">
                <td className="px-3 py-2 font-medium">{r.name || '（未命名）'}</td>
                <td className="px-3 py-2 text-xs text-tg-muted">
                  {SCOPE_LABEL[r.scope] || r.scope}
                  {r.scope === 'ACCOUNT' && <div>{accLabel(r.accountId)}</div>}
                  {r.scope === 'GROUP' && <div>{r.chatId}</div>}
                </td>
                <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{r.include.map((k, i) => <span key={i} className="badge bg-tg-blue/15 text-tg-blue">{k}</span>)}</div></td>
                <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{r.exclude.map((k, i) => <span key={i} className="badge bg-white/10 text-tg-muted">{k}</span>)}{r.regex && <span className="badge bg-tg-amber/20 text-tg-amber">正则</span>}</div></td>
                <td className="px-3 py-2"><span className={`badge ${r.enabled ? 'bg-tg-green/20 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>{r.enabled ? '启用' : '停用'}</span></td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {canManage && <button onClick={() => toggle(r)} className="btn-ghost px-2 py-1 text-xs"><Power className="h-3.5 w-3.5" /></button>}
                    {canManage && <button onClick={() => remove(r)} className="btn-danger px-2 py-1 text-xs"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowCreate(false)}>
          <form onSubmit={create} className="card w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">新建关键词规则</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="text-tg-muted hover:text-tg-text"><X className="h-5 w-5" /></button>
            </div>
            <div>
              <label className="label">规则名称（可选）</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：西安会所线索" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">适用范围</label>
                <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                  <option value="TENANT">全部群组</option>
                  <option value="ACCOUNT">按账号</option>
                  <option value="GROUP">按群组</option>
                </select>
              </div>
              {form.scope !== 'TENANT' && (
                <div>
                  <label className="label">监听账号</label>
                  <select className="input" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                    <option value="">请选择…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.phone}</option>)}
                  </select>
                </div>
              )}
            </div>
            {form.scope === 'GROUP' && (
              <div>
                <label className="label">群组 Chat ID（-100…）</label>
                <input className="input" value={form.chatId} onChange={(e) => setForm({ ...form, chatId: e.target.value })} placeholder="-1001234567890" />
              </div>
            )}
            <div>
              <label className="label">包含关键词（逗号或换行分隔）</label>
              <textarea className="input min-h-[70px]" value={form.include} onChange={(e) => setForm({ ...form, include: e.target.value })} placeholder="会所, 上门, 预约" />
            </div>
            <div>
              <label className="label">排除关键词（可选）</label>
              <textarea className="input min-h-[50px]" value={form.exclude} onChange={(e) => setForm({ ...form, exclude: e.target.value })} placeholder="招聘, 广告" />
            </div>
            <div>
              <label className="label">正则表达式（可选，进阶）</label>
              <input className="input" value={form.regex} onChange={(e) => setForm({ ...form, regex: e.target.value })} placeholder="留空则只用关键词" />
            </div>
            <button className="btn-primary w-full">创建规则</button>
          </form>
        </div>
      )}
    </div>
  );
}
