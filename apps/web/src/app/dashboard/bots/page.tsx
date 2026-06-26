'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Plus, Trash2, Play, Square, RefreshCw, KeyRound, ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

const STATUS: Record<string, { label: string; cls: string }> = {
  RUNNING: { label: '运行中', cls: 'bg-tg-green/15 text-tg-green' },
  STOPPED: { label: '已停止', cls: 'bg-white/10 text-tg-muted' },
  OFFLINE: { label: '离线 / Token失效', cls: 'bg-tg-red/15 text-tg-red' },
};

export default function BotsPage() {
  const router = useRouter();
  const { isSuper, can, loading: accessLoading, refresh: refreshAccess } = useAccess();
  const canView = isSuper || can(PERM.BOT_VIEW);
  useEffect(() => {
    if (!accessLoading && !canView) router.replace('/dashboard');
  }, [accessLoading, canView, router]);
  const [bots, setBots] = useState<any[]>([]);
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<any>(null);

  async function load() {
    setBots(await api.get('/bots'));
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m);
    else setMsg(m);
    setTimeout(() => {
      setError('');
      setMsg('');
    }, 4000);
  }

  async function createBot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setLoading(true);
    try {
      await api.post('/bots', { token, name: name || undefined });
      setToken('');
      setName('');
      flash('机器人已创建并自动上线（已初始化配置、注册命令）。');
      await load();
      await refreshAccess();
    } catch (err: any) {
      flash(err.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function act(id: string, action: 'start' | 'stop' | 'restart') {
    try {
      await api.post(`/bots/${id}/${action}`);
      await load();
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  async function changeToken(id: string) {
    const t = prompt('粘贴新的 Bot Token：');
    if (!t) return;
    try {
      await api.patch(`/bots/${id}/token`, { token: t.trim() });
      flash('Token 已更换，机器人已重启。');
      await load();
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  async function remove(id: string) {
    if (!confirm('确认删除该机器人？将停止实例并清除其所有数据。')) return;
    try {
      await api.del(`/bots/${id}`);
      await load();
      await refreshAccess();
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  async function openLogs(id: string) {
    setLogsFor(id);
    setLogs(null);
    try {
      setLogs(await api.get(`/bots/${id}/logs`));
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">机器人管理</h1>
        <p className="text-sm text-tg-muted">
          托管多个 Telegram 机器人，统一代码、统一升级。每个机器人数据相互隔离。
        </p>
      </div>

      {(isSuper || can(PERM.BOTS_CREATE)) && (
        <form onSubmit={createBot} className="card grid gap-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
          <div>
            <label className="label">机器人名称（可选）</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Bot" />
          </div>
          <div>
            <label className="label">Bot Token（来自 @BotFather）</label>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:ABCdEf..." required />
          </div>
          <button className="btn-primary h-10" disabled={loading}>
            <Plus className="h-4 w-4" /> {loading ? '创建中…' : '添加机器人'}
          </button>
        </form>
      )}

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {bots.map((b) => {
          const st = STATUS[b.status] || STATUS.STOPPED;
          const canStart = can(PERM.BOT_START, b.id);
          const canStop = can(PERM.BOT_STOP, b.id);
          return (
            <div key={b.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-blue/15 text-tg-blue">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-tg-muted">@{b.username || '未知'}</div>
                  </div>
                </div>
                <span className={`badge ${st.cls}`}>{st.label}</span>
              </div>

              <div className="mt-3 flex gap-4 text-xs text-tg-muted">
                <span>群组 {b._count?.groups ?? 0}</span>
                <span>管理员 {b._count?.admins ?? 0}</span>
              </div>
              {b.lastError && <div className="mt-2 truncate text-xs text-tg-red" title={b.lastError}>⚠ {b.lastError}</div>}

              <div className="mt-4 flex flex-wrap gap-2">
                {canStart && b.status !== 'RUNNING' && (
                  <button onClick={() => act(b.id, 'start')} className="btn-ghost text-xs"><Play className="h-4 w-4" /> 启动</button>
                )}
                {canStop && b.status === 'RUNNING' && (
                  <button onClick={() => act(b.id, 'stop')} className="btn-ghost text-xs"><Square className="h-4 w-4" /> 停止</button>
                )}
                {canStart && canStop && (
                  <button onClick={() => act(b.id, 'restart')} className="btn-ghost text-xs"><RefreshCw className="h-4 w-4" /> 重启</button>
                )}
                {can(PERM.BOT_TOKEN, b.id) && (
                  <button onClick={() => changeToken(b.id)} className="btn-ghost text-xs"><KeyRound className="h-4 w-4" /> 换Token</button>
                )}
                {can(PERM.LOGS_VIEW, b.id) && (
                  <button onClick={() => openLogs(b.id)} className="btn-ghost text-xs"><ScrollText className="h-4 w-4" /> 日志</button>
                )}
                {can(PERM.BOTS_DELETE, b.id) && (
                  <button onClick={() => remove(b.id)} className="btn-danger text-xs"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          );
        })}
        {bots.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-tg-muted">
            {isSuper ? '还没有机器人，使用上方表单添加第一个吧。' : '你还没有被分配任何机器人。'}
          </div>
        )}
      </div>

      {logsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setLogsFor(null)}>
          <div className="card max-h-[80vh] w-full max-w-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">机器人日志</h3>
              <button className="btn-ghost text-xs" onClick={() => setLogsFor(null)}>关闭</button>
            </div>
            {!logs ? (
              <div className="text-sm text-tg-muted">加载中…</div>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="mb-3 text-tg-muted">
                  状态：{STATUS[logs.bot?.status]?.label || logs.bot?.status} ·
                  最后在线：{logs.bot?.lastSeenAt ? new Date(logs.bot.lastSeenAt).toLocaleString() : '—'}
                </div>
                {logs.logs?.length ? logs.logs.map((l: any) => (
                  <div key={l.id} className="flex justify-between gap-2 border-b border-white/5 py-1">
                    <span>{l.action} {l.detail ? `· ${l.detail}` : ''}</span>
                    <span className="shrink-0 text-tg-muted">{l.group?.title} · {new Date(l.createdAt).toLocaleTimeString()}</span>
                  </div>
                )) : <div className="text-tg-muted">暂无日志</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
