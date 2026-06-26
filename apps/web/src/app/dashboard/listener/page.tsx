'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone, Plus, Trash2, LogIn, LogOut, RefreshCw, Power, FolderSync, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

type Account = {
  id: string; phone: string; label: string;
  loginStatus: string; onlineStatus: string; sessionStatus: string;
  enabled: boolean; lastConnectedAt: string | null; lastError: string | null;
  groupCount: number; listeningCount: number;
};

const LOGIN_LABEL: Record<string, string> = {
  NEW: '未登录', CODE_SENT: '待输入验证码', PASSWORD_NEEDED: '待输入二步密码',
  LOGGED_IN: '已登录', FAILED: '登录失败', LOGGED_OUT: '已登出',
};
const ONLINE_LABEL: Record<string, string> = { ONLINE: '在线', OFFLINE: '离线', CONNECTING: '连接中' };

export default function ListenerAccountsPage() {
  const router = useRouter();
  const { can, isSuper, loading } = useAccess();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');

  // login modal state
  const [loginAcc, setLoginAcc] = useState<Account | null>(null);
  const [step, setStep] = useState<'code' | 'password'>('code');
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);

  const canView = isSuper || can(PERM.LISTENER_VIEW) || can(PERM.LISTENER_ACCOUNT);
  const canManage = isSuper || can(PERM.LISTENER_ACCOUNT);

  useEffect(() => { if (!loading && !canView) router.replace('/dashboard'); }, [loading, canView, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 5000);
  }

  async function load() {
    try {
      const [a, s] = await Promise.all([api.get('/listener/accounts'), api.get('/listener/stats')]);
      setAccounts(a); setStats(s);
    } catch (e: any) { flash(e.message, true); }
  }
  useEffect(() => { if (canView) load(); }, [canView]);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/listener/accounts', { phone: phone.trim(), label: label.trim() || undefined });
      setPhone(''); setLabel('');
      flash('已添加监听账号，点击「登录」发送验证码。');
      await load();
    } catch (e: any) { flash(e.message, true); }
  }

  async function remove(a: Account) {
    if (!confirm(`确定删除监听账号 ${a.phone}？会同时登出并删除其 session。`)) return;
    try { await api.del(`/listener/accounts/${a.id}`); flash('已删除。'); await load(); }
    catch (e: any) { flash(e.message, true); }
  }

  async function toggleEnabled(a: Account) {
    try { await api.patch(`/listener/accounts/${a.id}`, { enabled: !a.enabled }); await load(); }
    catch (e: any) { flash(e.message, true); }
  }

  async function syncDialogs(a: Account) {
    try { const r = await api.post(`/listener/accounts/${a.id}/sync-dialogs`); flash(`已同步 ${r.length} 个群组/频道。`); await load(); }
    catch (e: any) { flash(e.message, true); }
  }

  async function logout(a: Account) {
    if (!confirm(`登出 ${a.phone}？下次需重新验证码登录。`)) return;
    try { await api.post(`/listener/accounts/${a.id}/logout`); flash('已登出。'); await load(); }
    catch (e: any) { flash(e.message, true); }
  }

  async function startLogin(a: Account) {
    setLoginAcc(a); setStep('code'); setCode(''); setPwd(''); setBusy(true);
    try {
      const r = await api.post(`/listener/accounts/${a.id}/login/send-code`);
      if (r.alreadyLoggedIn) { flash('该账号已登录。'); setLoginAcc(null); await load(); }
      else flash('验证码已发送到该 Telegram 账号。');
    } catch (e: any) { flash(e.message, true); setLoginAcc(null); }
    finally { setBusy(false); }
  }

  async function submitCode() {
    if (!loginAcc) return;
    setBusy(true);
    try {
      const r = await api.post(`/listener/accounts/${loginAcc.id}/login/confirm`, { code: code.trim() });
      if (r.needPassword) { setStep('password'); flash('该账号开启了两步验证，请输入二步密码。'); }
      else { flash('登录成功，已开始保持在线。'); setLoginAcc(null); await load(); }
    } catch (e: any) { flash(e.message, true); } finally { setBusy(false); }
  }

  async function submitPassword() {
    if (!loginAcc) return;
    setBusy(true);
    try {
      await api.post(`/listener/accounts/${loginAcc.id}/login/password`, { password: pwd });
      flash('登录成功，已开始保持在线。'); setLoginAcc(null); await load();
    } catch (e: any) { flash(e.message, true); } finally { setBusy(false); }
  }

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!canView) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Phone className="h-6 w-6 text-tg-blue" /> 监听账号</h1>
        <p className="mt-1 text-sm text-tg-muted">使用真实 Telegram 账号（MTProto / Telethon）监听群组。非 Bot Token。登录后 session 保存在服务器，重启自动恢复，无需重新验证码。</p>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {[
            ['账号', stats.accounts], ['在线', stats.online], ['监听群组', stats.listeningGroups],
            ['命中', stats.hits], ['已推送', stats.pushed], ['推送失败', stats.failed],
          ].map(([k, v]) => (
            <div key={k as string} className="card py-3 text-center">
              <div className="text-2xl font-bold">{v as number}</div>
              <div className="text-xs text-tg-muted">{k as string}</div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <form onSubmit={addAccount} className="card flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="label">手机号（含国家码）</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8613800138000" required />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="label">账号备注（可选）</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例如：客服A / 监听号1" />
          </div>
          <button className="btn-primary"><Plus className="h-4 w-4" /> 添加账号</button>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-tg-muted">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2">手机号 / 备注</th>
              <th className="px-3 py-2">登录状态</th>
              <th className="px-3 py-2">在线</th>
              <th className="px-3 py-2">Session</th>
              <th className="px-3 py-2">群组 / 监听中</th>
              <th className="px-3 py-2">最近连接</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-tg-muted">还没有监听账号。</td></tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-white/5">
                <td className="px-3 py-2">
                  <div className="font-medium">{a.phone}</div>
                  <div className="text-xs text-tg-muted">{a.label || '—'}{!a.enabled && <span className="ml-1 text-tg-amber">（已停用）</span>}</div>
                  {a.lastError && <div className="mt-0.5 max-w-[260px] truncate text-xs text-tg-red" title={a.lastError}>{a.lastError}</div>}
                </td>
                <td className="px-3 py-2">
                  <span className={`badge ${a.loginStatus === 'LOGGED_IN' ? 'bg-tg-green/20 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>
                    {LOGIN_LABEL[a.loginStatus] || a.loginStatus}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`badge ${a.onlineStatus === 'ONLINE' ? 'bg-tg-green/20 text-tg-green' : a.onlineStatus === 'CONNECTING' ? 'bg-tg-amber/20 text-tg-amber' : 'bg-white/10 text-tg-muted'}`}>
                    {ONLINE_LABEL[a.onlineStatus] || a.onlineStatus}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-tg-muted">{a.sessionStatus}</td>
                <td className="px-3 py-2">{a.groupCount} / <b>{a.listeningCount}</b></td>
                <td className="px-3 py-2 text-xs text-tg-muted">{a.lastConnectedAt ? new Date(a.lastConnectedAt).toLocaleString() : '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    {canManage && a.loginStatus !== 'LOGGED_IN' && (
                      <button onClick={() => startLogin(a)} className="btn-ghost px-2 py-1 text-xs" title="登录"><LogIn className="h-3.5 w-3.5" /> 登录</button>
                    )}
                    {canManage && a.loginStatus === 'LOGGED_IN' && (
                      <>
                        <button onClick={() => syncDialogs(a)} className="btn-ghost px-2 py-1 text-xs" title="同步群组"><FolderSync className="h-3.5 w-3.5" /> 同步群组</button>
                        <button onClick={() => logout(a)} className="btn-ghost px-2 py-1 text-xs" title="登出"><LogOut className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                    {canManage && (
                      <>
                        <button onClick={() => toggleEnabled(a)} className="btn-ghost px-2 py-1 text-xs" title={a.enabled ? '停用' : '启用'}><Power className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(a)} className="btn-danger px-2 py-1 text-xs" title="删除"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loginAcc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && setLoginAcc(null)}>
          <div className="card w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">登录 {loginAcc.phone}</h2>
              <button onClick={() => setLoginAcc(null)} className="text-tg-muted hover:text-tg-text"><X className="h-5 w-5" /></button>
            </div>
            {step === 'code' ? (
              <>
                <p className="text-sm text-tg-muted">Telegram 已向该账号发送登录验证码，请输入收到的验证码。</p>
                <div>
                  <label className="label">验证码</label>
                  <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="例如：12345" inputMode="numeric" autoFocus />
                </div>
                <div className="flex gap-2">
                  <button onClick={submitCode} disabled={busy || !code.trim()} className="btn-primary flex-1">{busy ? '验证中…' : '确认验证码'}</button>
                  <button onClick={() => startLogin(loginAcc)} disabled={busy} className="btn-ghost" title="重新发送"><RefreshCw className="h-4 w-4" /></button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-tg-muted">该账号开启了两步验证（2FA），请输入二步验证密码。</p>
                <div>
                  <label className="label">二步验证密码</label>
                  <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
                </div>
                <button onClick={submitPassword} disabled={busy || !pwd} className="btn-primary w-full">{busy ? '登录中…' : '完成登录'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
