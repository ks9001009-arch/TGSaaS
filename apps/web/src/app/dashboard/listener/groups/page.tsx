'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Search, CheckSquare, Square, RefreshCw, Radio, RadioTower } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

type Group = {
  id: string; accountId: string; accountPhone?: string; accountLabel?: string;
  tgChatId: string; title: string; username: string | null; type: string;
  listening: boolean; lastMessageAt: string | null;
};

export default function ListenerGroupsPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();

  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const canView = isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_GROUP);
  const canManage = isSuper || can(PERM.LISTENER_GROUP);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  async function loadAccounts() {
    try { setAccounts(await api.get('/listener/accounts')); } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) loadAccounts(); }, [canView]);

  async function loadGroups() {
    try {
      const qs = accountId ? `?accountId=${accountId}` : '';
      setGroups(await api.get(`/listener/groups${qs}`));
      setSelected(new Set());
    } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) loadGroups(); }, [canView, accountId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? groups.filter((g) => `${g.title} ${g.username || ''} ${g.tgChatId}`.toLowerCase().includes(q)) : groups;
  }, [groups, search]);

  function toggleOne(id: string) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelected(new Set(visible.map((g) => g.id))); }
  function clearAll() { setSelected(new Set()); }

  async function syncDialogs() {
    if (!accountId) { flash('请先选择一个监听账号再同步。', true); return; }
    try { const r = await api.post(`/listener/accounts/${accountId}/sync-dialogs`); flash(`已同步 ${r.length} 个群组/频道。`); await loadGroups(); }
    catch (e: any) { flash(e.message, true); }
  }

  async function toggleListen(g: Group) {
    try { await api.patch(`/listener/groups/${g.id}/listen`, { listening: !g.listening }); await loadGroups(); }
    catch (e: any) { flash(e.message, true); }
  }

  async function batch(listening: boolean) {
    if (!selected.size) { flash('请至少选择一个群组。', true); return; }
    try { const r = await api.post('/listener/groups/listen/batch', { ids: [...selected], listening }); flash(`已${listening ? '开启' : '停止'}监听 ${r.count} 个群组。`); await loadGroups(); }
    catch (e: any) { flash(e.message, true); }
  }

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!canView) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Users className="h-6 w-6 text-tg-blue" /> 监听群组</h1>
        <p className="mt-1 text-sm text-tg-muted">监听账号加入的群组会自动读取。开启监听后，该群组的新消息会进入关键词匹配与推送流程。</p>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      <div className="card flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="label">按账号筛选</label>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">全部监听账号</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.phone}{a.label ? `（${a.label}）` : ''}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="label">搜索群组</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-tg-muted" />
            <input className="input pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="名称 / @用户名 / ID" />
          </div>
        </div>
        {canManage && <button onClick={syncDialogs} className="btn-ghost"><FolderSyncIcon /> 同步该账号群组</button>}
        <button onClick={loadGroups} className="btn-ghost"><RefreshCw className="h-4 w-4" /> 刷新</button>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={selectAll} className="btn-ghost px-3 py-1.5">全选</button>
          <button onClick={clearAll} className="btn-ghost px-3 py-1.5">清空</button>
          <span className="text-tg-muted">已选 {selected.size} / {visible.length}</span>
          <div className="flex-1" />
          <button onClick={() => batch(true)} className="btn-primary"><RadioTower className="h-4 w-4" /> 批量开启监听</button>
          <button onClick={() => batch(false)} className="btn-ghost"><Radio className="h-4 w-4" /> 批量停止</button>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-tg-muted">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 w-10"></th>
              <th className="px-3 py-2">群组</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">所属账号</th>
              <th className="px-3 py-2">最近消息</th>
              <th className="px-3 py-2">监听</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-tg-muted">没有群组。请先登录账号并点击「同步该账号群组」。</td></tr>
            )}
            {visible.map((g) => (
              <tr key={g.id} className="border-b border-white/5">
                <td className="px-3 py-2">
                  <button onClick={() => toggleOne(g.id)}>
                    {selected.has(g.id) ? <CheckSquare className="h-5 w-5 text-tg-blue" /> : <Square className="h-5 w-5 text-tg-muted" />}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{g.title || g.tgChatId}</div>
                  <div className="text-xs text-tg-muted">{g.username ? `@${g.username}` : g.tgChatId}</div>
                </td>
                <td className="px-3 py-2 text-xs text-tg-muted">{g.type}</td>
                <td className="px-3 py-2 text-xs text-tg-muted">{g.accountPhone}{g.accountLabel ? `（${g.accountLabel}）` : ''}</td>
                <td className="px-3 py-2 text-xs text-tg-muted">{g.lastMessageAt ? new Date(g.lastMessageAt).toLocaleString() : '—'}</td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <button onClick={() => toggleListen(g)} className={`badge ${g.listening ? 'bg-tg-green/20 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>
                      {g.listening ? '监听中' : '未监听'}
                    </button>
                  ) : (
                    <span className={`badge ${g.listening ? 'bg-tg-green/20 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>{g.listening ? '监听中' : '未监听'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FolderSyncIcon() {
  return <RefreshCw className="h-4 w-4" />;
}
