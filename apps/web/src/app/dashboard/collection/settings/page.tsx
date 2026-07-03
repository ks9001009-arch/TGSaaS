'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, RefreshCw, Power, PowerOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

interface GroupCfg {
  groupId: string;
  title: string | null;
  telegramChatId: string;
  enabled: boolean;
  collectInstagram: boolean;
  collectTiktok: boolean;
  replyOnCapture: boolean;
  submissionCount: number;
}

interface Overview {
  defaultEnabled: boolean;
  groups: GroupCfg[];
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-tg-blue' : 'bg-white/15'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export default function CollectionSettingsPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();
  const canManage = isSuper || can(PERM.COLLECTION_MANAGE);

  const [data, setData] = useState<Overview>({ defaultEnabled: false, groups: [] });
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { if (!loading && !canManage) router.replace('/dashboard'); }, [loading, canManage, router]);

  function flash(m: string) { setError(m); setTimeout(() => setError(''), 4000); }
  function ok(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000); }

  async function load() {
    setBusy(true);
    try { setData(await api.get<Overview>('/collection/overview')); }
    catch (e: any) { flash(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (canManage) load(); }, [canManage]);

  async function patchGroup(g: GroupCfg, patch: Partial<GroupCfg>) {
    setSaving(g.groupId);
    setData((d) => ({ ...d, groups: d.groups.map((x) => x.groupId === g.groupId ? { ...x, ...patch } : x) }));
    try { await api.patch(`/collection/groups/${g.groupId}`, patch); }
    catch (e: any) { flash(e.message); load(); }
    finally { setSaving(null); }
  }

  async function bulk(enabled: boolean) {
    if (!confirm(`确定要${enabled ? '开启' : '关闭'}当前所有群组的采集吗？`)) return;
    setBusy(true);
    try {
      const r = await api.post<{ count: number }>('/collection/bulk-toggle', { enabled });
      ok(`已${enabled ? '开启' : '关闭'} ${r.count} 个群组的采集`);
      await load();
    } catch (e: any) { flash(e.message); }
    finally { setBusy(false); }
  }

  async function setDefault(enabled: boolean) {
    setData((d) => ({ ...d, defaultEnabled: enabled }));
    try { await api.post('/collection/default', { enabled }); ok('默认采集开关已更新'); }
    catch (e: any) { flash(e.message); load(); }
  }

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!canManage) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><SlidersHorizontal className="h-6 w-6 text-tg-blue" /> 采集设置</h1>
          <p className="mt-1 text-sm text-tg-muted">按群控制 IG/TK 采集。采集不是"一开全开"——每个群单独控制；新入群的默认状态由下方"默认开关"决定。</p>
        </div>
        <button onClick={load} className="btn-ghost" disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> 刷新</button>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold">新群默认采集</h2>
          <p className="text-sm text-tg-muted">机器人新加入群组时，是否自动开启采集。关闭时，新群需在下方手动开启（更可控，推荐）。</p>
          <div className="flex items-center gap-3">
            <Toggle on={data.defaultEnabled} onClick={() => isSuper && setDefault(!data.defaultEnabled)} disabled={!isSuper} />
            <span className="text-sm">{data.defaultEnabled ? '默认开启' : '默认关闭'}</span>
            {!isSuper && <span className="text-xs text-tg-muted">（仅超级管理员可改）</span>}
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold">批量操作</h2>
          <p className="text-sm text-tg-muted">一键开启或关闭你当前可见的所有群组的采集。</p>
          <div className="flex gap-2">
            <button onClick={() => bulk(true)} className="btn-primary" disabled={busy}><Power className="h-4 w-4" /> 全部开启</button>
            <button onClick={() => bulk(false)} className="btn-ghost" disabled={busy}><PowerOff className="h-4 w-4" /> 全部关闭</button>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-tg-muted">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2">群组</th>
              <th className="px-3 py-2 text-center">采集</th>
              <th className="px-3 py-2 text-center">Instagram</th>
              <th className="px-3 py-2 text-center">TikTok</th>
              <th className="px-3 py-2 text-center">采集后回复</th>
              <th className="px-3 py-2 text-right">已采集</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-tg-muted">{busy ? '加载中…' : '暂无群组。把机器人加入群组后会自动出现在这里。'}</td></tr>}
            {data.groups.map((g) => (
              <tr key={g.groupId} className={`border-b border-white/5 ${saving === g.groupId ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2">
                  <div className="font-medium">{g.title || '未命名群组'}</div>
                  <div className="font-mono text-xs text-tg-muted">{g.telegramChatId}</div>
                </td>
                <td className="px-3 py-2 text-center"><div className="flex justify-center"><Toggle on={g.enabled} onClick={() => patchGroup(g, { enabled: !g.enabled })} disabled={saving === g.groupId} /></div></td>
                <td className="px-3 py-2 text-center"><div className="flex justify-center"><Toggle on={g.collectInstagram} onClick={() => patchGroup(g, { collectInstagram: !g.collectInstagram })} disabled={saving === g.groupId} /></div></td>
                <td className="px-3 py-2 text-center"><div className="flex justify-center"><Toggle on={g.collectTiktok} onClick={() => patchGroup(g, { collectTiktok: !g.collectTiktok })} disabled={saving === g.groupId} /></div></td>
                <td className="px-3 py-2 text-center"><div className="flex justify-center"><Toggle on={g.replyOnCapture} onClick={() => patchGroup(g, { replyOnCapture: !g.replyOnCapture })} disabled={saving === g.groupId} /></div></td>
                <td className="px-3 py-2 text-right font-mono">{g.submissionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
