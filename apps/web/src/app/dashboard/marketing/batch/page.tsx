'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Square, Search, Send, Trash2, BarChart3, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

type Group = {
  id: string;
  title: string;
  status: string;
  isActive: boolean;
  memberCount: number | null;
  botId: string | null;
  applied: boolean;
  appliedEnabled: boolean;
  hasOverride: boolean;
};

export default function BatchApplyPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();

  const [templates, setTemplates] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [bots, setBots] = useState<any[]>([]);
  const [botId, setBotId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [stats, setStats] = useState<any>(null);

  const canView = isSuper || can(PERM.MARKETING_VIEW) || can(PERM.TEMPLATE_APPLY);
  const canApply = isSuper || can(PERM.TEMPLATE_APPLY);
  const canUnapply = isSuper || can(PERM.TEMPLATE_UNAPPLY);
  const canStats = isSuper || can(PERM.AD_STATS);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  async function loadTemplates() {
    try { setTemplates(await api.get('/marketing/templates')); } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) loadTemplates(); }, [canView]);

  async function loadGroups() {
    try {
      const qs = new URLSearchParams();
      if (templateId) qs.set('templateId', templateId);
      if (botId) qs.set('botId', botId);
      const r = await api.get(`/marketing/assignments/groups?${qs.toString()}`);
      setBots(r.bots || []);
      setGroups(r.groups || []);
      setSelected(new Set());
    } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) loadGroups(); }, [canView, templateId, botId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? groups.filter((g) => (g.title || '').toLowerCase().includes(q)) : groups;
  }, [groups, search]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function selectAll() { setSelected(new Set(visible.map((g) => g.id))); }
  function clearAll() { setSelected(new Set()); }
  function invert() {
    setSelected((prev) => {
      const n = new Set<string>();
      for (const g of visible) if (!prev.has(g.id)) n.add(g.id);
      return n;
    });
  }
  function selectApplied() { setSelected(new Set(visible.filter((g) => g.applied).map((g) => g.id))); }

  async function apply() {
    if (!templateId) { flash('请先选择广告模板。', true); return; }
    if (!selected.size) { flash('请至少选择一个群组。', true); return; }
    try {
      const r = await api.post('/marketing/assignments/apply', { templateId, groupIds: [...selected] });
      flash(`已应用到 ${r.count} 个群组。`);
      await loadGroups();
    } catch (e: any) { flash(e.message, true); }
  }
  async function remove() {
    if (!templateId) { flash('请先选择广告模板。', true); return; }
    if (!selected.size) { flash('请至少选择一个群组。', true); return; }
    try {
      const r = await api.post('/marketing/assignments/remove', { templateId, groupIds: [...selected] });
      flash(`已从 ${r.count} 个群组移除。`);
      await loadGroups();
    } catch (e: any) { flash(e.message, true); }
  }
  async function toggleGroup(g: Group) {
    try {
      await api.patch('/marketing/assignments/toggle', { templateId, groupId: g.id, enabled: !g.appliedEnabled });
      await loadGroups();
    } catch (e: any) { flash(e.message, true); }
  }

  async function loadStats() {
    if (!templateId) { flash('请先选择广告模板。', true); return; }
    try { setStats(await api.get(`/marketing/assignments/stats?templateId=${templateId}`)); }
    catch (e: any) { flash(e.message, true); }
  }

  function botName(id: string | null) {
    if (!id) return '—';
    const b = bots.find((x) => x.id === id);
    return b ? (b.name || b.username || id) : id;
  }

  if (loading) return <div className="p-6 text-gray-500">加载中…</div>;
  if (!canView) return null;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">批量应用广告模板</h1>
        <p className="text-sm text-gray-500 mt-1">将一套广告按钮模板一键应用到多个群组，可按机器人筛选、搜索、全选/反选、排除并单独开关。</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}
      {msg && <div className="bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg">{msg}</div>}

      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">广告模板</label>
          <select className="border rounded-lg px-3 py-2 text-sm min-w-[220px]" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">请选择模板…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} · {t.kind}{t.enabled ? '' : '（已停用）'}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">按机器人筛选</label>
          <select className="border rounded-lg px-3 py-2 text-sm min-w-[180px]" value={botId} onChange={(e) => setBotId(e.target.value)}>
            <option value="">全部机器人</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>{b.name || b.username || b.id}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col flex-1 min-w-[180px]">
          <label className="text-xs text-gray-500 mb-1">搜索群组</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
            <input className="border rounded-lg pl-8 pr-3 py-2 text-sm w-full" placeholder="群组名称…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <button onClick={loadGroups} className="flex items-center gap-1 border rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={selectAll} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50">全选</button>
        <button onClick={invert} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50">反选</button>
        <button onClick={clearAll} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50">清空</button>
        <button onClick={selectApplied} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50">选中已应用</button>
        <span className="text-gray-400">已选 {selected.size} / {visible.length}</span>
        <div className="flex-1" />
        {canApply && (
          <button onClick={apply} className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Send className="w-4 h-4" /> 一键应用
          </button>
        )}
        {canUnapply && (
          <button onClick={remove} className="flex items-center gap-1 px-4 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">
            <Trash2 className="w-4 h-4" /> 一键移除
          </button>
        )}
        {canStats && (
          <button onClick={loadStats} className="flex items-center gap-1 px-4 py-1.5 border rounded-lg hover:bg-gray-50">
            <BarChart3 className="w-4 h-4" /> 查看统计
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 w-10"></th>
              <th className="px-3 py-2">群组</th>
              <th className="px-3 py-2">所属机器人</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">应用状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">没有可管理的群组。</td></tr>
            )}
            {visible.map((g) => (
              <tr key={g.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">
                  <button onClick={() => toggleOne(g.id)}>
                    {selected.has(g.id)
                      ? <CheckSquare className="w-5 h-5 text-blue-600" />
                      : <Square className="w-5 h-5 text-gray-300" />}
                  </button>
                </td>
                <td className="px-3 py-2 font-medium">{g.title || g.id}</td>
                <td className="px-3 py-2 text-gray-500">{botName(g.botId)}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${g.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {g.isActive ? '运行中' : (g.status || '未启用')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {g.applied ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${g.appliedEnabled ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {g.appliedEnabled ? '已启用' : '已应用·已停用'}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">未应用</span>
                  )}
                  {g.hasOverride && <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">独立覆盖</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {g.applied && canApply && (
                    <button onClick={() => toggleGroup(g)} className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-100">
                      {g.appliedEnabled ? '停用' : '启用'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stats && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">广告统计</h2>
            <button onClick={() => setStats(null)} className="text-sm text-gray-400 hover:text-gray-600">关闭</button>
          </div>
          <div className="flex gap-6 text-sm">
            <div>总展示：<b>{stats.totals?.impressions ?? 0}</b></div>
            <div>总点击：<b>{stats.totals?.clicks ?? 0}</b></div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr><th className="px-3 py-2">群组</th><th className="px-3 py-2">启用</th><th className="px-3 py-2">展示</th><th className="px-3 py-2">点击</th><th className="px-3 py-2">CTR</th></tr>
            </thead>
            <tbody>
              {(stats.perGroup || []).map((p: any) => (
                <tr key={p.groupId} className="border-t">
                  <td className="px-3 py-2">{p.group}</td>
                  <td className="px-3 py-2">{p.enabled ? '是' : '否'}</td>
                  <td className="px-3 py-2">{p.impressions}</td>
                  <td className="px-3 py-2">{p.clicks}</td>
                  <td className="px-3 py-2">{p.ctr}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
