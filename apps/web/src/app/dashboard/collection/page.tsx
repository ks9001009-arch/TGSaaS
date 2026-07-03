'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, RefreshCw, Search, Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost/api';

interface Submission {
  id: string;
  platform: 'INSTAGRAM' | 'TIKTOK';
  username: string;
  rawText: string | null;
  ocrText: string | null;
  hasScreenshot: boolean;
  submittedByTgId: string | null;
  submittedByUsername: string | null;
  chatId: string | null;
  chatTitle: string | null;
  messageId: string | null;
  createdAt: string;
}

interface ListResult {
  total: number;
  page: number;
  pageSize: number;
  items: Submission[];
}

interface GroupOpt {
  groupId: string;
  title: string | null;
}

function platformBadge(p: string) {
  return p === 'INSTAGRAM'
    ? <span className="badge bg-pink-500/15 text-pink-400">Instagram</span>
    : <span className="badge bg-cyan-500/15 text-cyan-400">TikTok</span>;
}

export default function CollectionRecordsPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();
  const canView = isSuper || can(PERM.COLLECTION_VIEW);

  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState<'' | 'INSTAGRAM' | 'TIKTOK'>('');
  const [groupId, setGroupId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResult>({ total: 0, page: 1, pageSize: 20, items: [] });
  const [groups, setGroups] = useState<GroupOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shot, setShot] = useState<{ url: string; username: string } | null>(null);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string) { setError(m); setTimeout(() => setError(''), 4000); }

  const load = useCallback(async (targetPage = page) => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (platform) params.set('platform', platform);
      if (groupId) params.set('groupId', groupId);
      params.set('page', String(targetPage));
      params.set('pageSize', '20');
      const res = await api.get<ListResult>(`/collection/submissions?${params.toString()}`);
      setData(res);
      setPage(res.page);
    } catch (e: any) { flash(e.message); }
    finally { setBusy(false); }
  }, [q, platform, groupId, page]);

  useEffect(() => {
    if (!canView) return;
    api.get<{ groups: GroupOpt[] }>('/collection/overview')
      .then((o) => setGroups(o.groups || []))
      .catch(() => undefined);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  async function openScreenshot(s: Submission) {
    try {
      const res = await fetch(`${BASE}/collection/submissions/${s.id}/screenshot`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('截图加载失败');
      const blob = await res.blob();
      setShot({ url: URL.createObjectURL(blob), username: s.username });
    } catch (e: any) { flash(e.message); }
  }

  function closeShot() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!canView) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><AtSign className="h-6 w-6 text-tg-blue" /> 采集记录 / 查询</h1>
          <p className="mt-1 text-sm text-tg-muted">按用户名查询已采集的 Instagram / TikTok 账号。支持平台、群组筛选，点击可查看原始截图。</p>
        </div>
        <button onClick={() => load(1)} className="btn-ghost" disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> 刷新</button>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}

      <div className="card grid gap-3 md:grid-cols-[1fr,180px,220px,auto]">
        <div>
          <label className="label">用户名 / 关键词</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tg-muted" />
            <input
              className="input pl-9"
              placeholder="如 john_doe 或 @john_doe"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(1); }}
            />
          </div>
        </div>
        <div>
          <label className="label">平台</label>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as any)}>
            <option value="">全部平台</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="TIKTOK">TikTok</option>
          </select>
        </div>
        <div>
          <label className="label">群组</label>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">全部群组</option>
            {groups.map((g) => <option key={g.groupId} value={g.groupId}>{g.title || g.groupId}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => load(1)} className="btn-primary w-full md:w-auto" disabled={busy}><Search className="h-4 w-4" /> 查询</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-tg-muted">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2">平台</th>
              <th className="px-3 py-2">用户名</th>
              <th className="px-3 py-2">来源群</th>
              <th className="px-3 py-2">提交人</th>
              <th className="px-3 py-2">时间</th>
              <th className="px-3 py-2">截图</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-tg-muted">{busy ? '加载中…' : '没有找到记录。'}</td></tr>}
            {data.items.map((s) => (
              <tr key={s.id} className="border-b border-white/5 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{platformBadge(s.platform)}</td>
                <td className="px-3 py-2 font-medium">{s.username}</td>
                <td className="px-3 py-2">{s.chatTitle || s.chatId || '—'}</td>
                <td className="px-3 py-2 text-xs">{s.submittedByUsername ? `@${s.submittedByUsername}` : '(无用户名)'}{s.submittedByTgId ? ` · ${s.submittedByTgId}` : ''}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-tg-muted">{new Date(s.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {s.hasScreenshot
                    ? <button onClick={() => openScreenshot(s)} className="inline-flex items-center gap-1 text-tg-blue hover:underline"><ImageIcon className="h-4 w-4" /> 查看</button>
                    : <span className="text-tg-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-tg-muted">
        <span>共 {data.total} 条 · 第 {data.page}/{totalPages} 页</span>
        <div className="flex gap-2">
          <button onClick={() => load(page - 1)} disabled={busy || page <= 1} className="btn-ghost"><ChevronLeft className="h-4 w-4" /> 上一页</button>
          <button onClick={() => load(page + 1)} disabled={busy || page >= totalPages} className="btn-ghost">下一页 <ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {shot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeShot}>
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <button onClick={closeShot} className="absolute -right-3 -top-3 rounded-full bg-tg-panel p-1.5 text-tg-text shadow-lg hover:bg-white/10"><X className="h-4 w-4" /></button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.url} alt={shot.username} className="max-h-[85vh] max-w-[85vw] rounded-lg" />
            <div className="mt-2 text-center text-sm text-white/80">{shot.username}</div>
          </div>
        </div>
      )}
    </div>
  );
}
