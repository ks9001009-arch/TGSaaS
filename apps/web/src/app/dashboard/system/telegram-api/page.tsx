'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeySquare, Save, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/access';

export default function TelegramApiPage() {
  const router = useRouter();
  const { isSuper, loading } = useAccess();

  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [masked, setMasked] = useState('');
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !isSuper) router.replace('/dashboard');
  }, [loading, isSuper, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  async function load() {
    try {
      const r = await api.get('/system/telegram-api');
      setApiId(r.apiId || '');
      setMasked(r.apiHashMasked || '');
      setConfigured(!!r.configured);
    } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (isSuper) load(); }, [isSuper]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/system/telegram-api', { apiId: apiId.trim(), apiHash: apiHash.trim() || undefined });
      setMasked(r.apiHashMasked || '');
      setConfigured(!!r.configured);
      setApiHash('');
      flash('已保存。监听账号登录时将共用这套 API 配置。');
    } catch (e: any) { flash(e.message, true); } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!isSuper) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><KeySquare className="h-6 w-6 text-tg-blue" /> Telegram API</h1>
        <p className="mt-1 text-sm text-tg-muted">
          平台统一配置 MTProto 的 API ID / API Hash（来自 my.telegram.org）。监听账号登录时无需再次填写，
          仅超级管理员可见与修改，子管理员无法查看。API Hash 加密存储。
        </p>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      <form onSubmit={save} className="card max-w-xl space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className={`badge ${configured ? 'bg-tg-green/20 text-tg-green' : 'bg-tg-amber/20 text-tg-amber'}`}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> {configured ? '已配置' : '未配置'}
          </span>
        </div>
        <div>
          <label className="label">API ID</label>
          <input className="input" value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="例如：1234567" inputMode="numeric" required />
        </div>
        <div>
          <label className="label">API Hash {masked && <span className="text-tg-muted">（当前：{masked}，留空则不修改）</span>}</label>
          <input className="input" value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder={configured ? '留空则保持不变' : '32 位 hex'} />
        </div>
        <button className="btn-primary" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存配置'}
        </button>
      </form>

      <div className="card max-w-xl space-y-2 text-sm text-tg-muted">
        <h2 className="font-semibold text-tg-text">如何获取？</h2>
        <p>1. 打开 <code className="rounded bg-white/10 px-1">my.telegram.org</code> 并用你的 Telegram 账号登录。</p>
        <p>2. 进入 <b>API development tools</b>，创建一个应用。</p>
        <p>3. 复制 <b>App api_id</b> 和 <b>App api_hash</b> 填入上方。</p>
        <p>整个平台所有监听账号共用这一套 API，请妥善保管。</p>
      </div>
    </div>
  );
}
