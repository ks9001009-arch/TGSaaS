'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListChecks, RefreshCw, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

export default function ListenerHitsPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();

  const [tab, setTab] = useState<'hits' | 'logs'>('hits');
  const [hits, setHits] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState('');

  const canView = isSuper || can(PERM.LISTENER_STATS);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string) { setError(m); setTimeout(() => setError(''), 4000); }

  async function load() {
    try {
      const [h, l] = await Promise.all([api.get('/listener/hits?limit=200'), api.get('/listener/push-logs?limit=200')]);
      setHits(h); setLogs(l);
    } catch (e: any) { flash(e.message); }
  }
  useEffect(() => { if (canView) load(); }, [canView]);

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!canView) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ListChecks className="h-6 w-6 text-tg-blue" /> 命中记录</h1>
          <p className="mt-1 text-sm text-tg-muted">关键词命中的消息与推送记录。推送按 (来源群, 消息, 目标) 去重，同一条消息对同一目标只推送一次。</p>
        </div>
        <button onClick={load} className="btn-ghost"><RefreshCw className="h-4 w-4" /> 刷新</button>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}

      <div className="flex gap-2 text-sm">
        <button onClick={() => setTab('hits')} className={`rounded-lg px-3 py-1.5 ${tab === 'hits' ? 'bg-tg-blue/15 text-tg-blue' : 'text-tg-muted hover:bg-white/5'}`}>命中消息（{hits.length}）</button>
        <button onClick={() => setTab('logs')} className={`rounded-lg px-3 py-1.5 ${tab === 'logs' ? 'bg-tg-blue/15 text-tg-blue' : 'text-tg-muted hover:bg-white/5'}`}>推送记录（{logs.length}）</button>
      </div>

      {tab === 'hits' ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-tg-muted">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">来源群</th>
                <th className="px-3 py-2">发送人</th>
                <th className="px-3 py-2">关键词</th>
                <th className="px-3 py-2">内容</th>
                <th className="px-3 py-2">链接</th>
              </tr>
            </thead>
            <tbody>
              {hits.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-tg-muted">暂无命中记录。</td></tr>}
              {hits.map((h) => (
                <tr key={h.id} className="border-b border-white/5 align-top">
                  <td className="px-3 py-2 text-xs text-tg-muted whitespace-nowrap">{new Date(h.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{h.sourceTitle || h.sourceChatId}</td>
                  <td className="px-3 py-2 text-xs">{h.senderName}{h.senderUsername ? ` @${h.senderUsername}` : ''}</td>
                  <td className="px-3 py-2"><span className="badge bg-tg-blue/15 text-tg-blue">{h.matchedKeyword}</span></td>
                  <td className="px-3 py-2 max-w-[320px] truncate" title={h.content}>{h.content}</td>
                  <td className="px-3 py-2">{h.messageLink ? <a href={h.messageLink} target="_blank" className="inline-flex items-center gap-1 text-tg-blue hover:underline">打开 <ExternalLink className="h-3 w-3" /></a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-tg-muted">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">来源群</th>
                <th className="px-3 py-2">消息ID</th>
                <th className="px-3 py-2">方式</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">失败原因</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-tg-muted">暂无推送记录。</td></tr>}
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-white/5 align-top">
                  <td className="px-3 py-2 text-xs text-tg-muted whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.sourceChatId}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.messageId}</td>
                  <td className="px-3 py-2 text-xs">{l.method === 'FORWARD' ? '原消息转发' : '链接'}</td>
                  <td className="px-3 py-2"><span className={`badge ${l.status === 'SENT' ? 'bg-tg-green/20 text-tg-green' : 'bg-tg-red/20 text-tg-red'}`}>{l.status === 'SENT' ? '成功' : '失败'}</span></td>
                  <td className="px-3 py-2 max-w-[260px] truncate text-xs text-tg-red" title={l.failReason || ''}>{l.failReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
