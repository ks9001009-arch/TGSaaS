'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Plus, Trash2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/access';

type IpRow = { id: string; ip: string; label?: string | null; createdAt: string };
type Audit = {
  id: string;
  adminEmail: string;
  ip: string;
  success: boolean;
  reason: string;
  userAgent?: string | null;
  createdAt: string;
};

export default function SecurityCenterPage() {
  const router = useRouter();
  const { isSuper, loading } = useAccess();
  const [ips, setIps] = useState<IpRow[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !isSuper) router.replace('/dashboard');
  }, [loading, isSuper, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m);
    else setMsg(m);
    setTimeout(() => {
      setError('');
      setMsg('');
    }, 4000);
  }

  async function load() {
    try {
      const [a, b] = await Promise.all([
        api.get('/security/ip-allowlist'),
        api.get('/security/login-audits?limit=50'),
      ]);
      setIps(a || []);
      setAudits(b || []);
    } catch (e: any) {
      flash(e.message || '加载失败', true);
    }
  }

  useEffect(() => {
    if (isSuper) load();
  }, [isSuper]);

  async function addIp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/security/ip-allowlist', { ip: ip.trim(), label: label.trim() || undefined });
      setIp('');
      setLabel('');
      flash('已加入白名单');
      await load();
    } catch (err: any) {
      flash(err.message || '添加失败', true);
    } finally {
      setBusy(false);
    }
  }

  async function removeIp(id: string) {
    if (!confirm('确定移除此 IP？若清空白名单，下次登录会自动锁定新 IP。')) return;
    try {
      await api.del(`/security/ip-allowlist/${id}`);
      flash('已移除');
      await load();
    } catch (err: any) {
      flash(err.message || '删除失败', true);
    }
  }

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!isSuper) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Shield className="h-6 w-6 text-tg-blue" /> 安全中心
        </h1>
        <p className="mt-1 text-sm text-tg-muted">
          超管登录启用严格 IP 白名单。异常登录、广告创建/发送、管理员变更会即时通知 Telegram{' '}
          <span className="font-medium text-tg-text">@ji_labs</span>
          （请先与托管机器人私聊 /start）。
        </p>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">登录 IP 白名单</h2>
          <button type="button" className="btn-ghost text-sm" onClick={() => load()}>
            <RefreshCw className="mr-1 inline h-4 w-4" /> 刷新
          </button>
        </div>
        <form onSubmit={addIp} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">IP / CIDR</label>
            <input
              className="input"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="例如 1.2.3.4 或 1.2.3.0/24"
              required
            />
          </div>
          <div>
            <label className="label">备注</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="办公室" />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            <Plus className="mr-1 inline h-4 w-4" /> 添加
          </button>
        </form>
        <ul className="divide-y divide-tg-border">
          {ips.length === 0 && (
            <li className="py-3 text-sm text-tg-muted">暂无记录。下次超管成功登录将自动锁定当前 IP。</li>
          )}
          {ips.map((row) => (
            <li key={row.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-mono">{row.ip}</div>
                <div className="text-tg-muted">
                  {row.label || '无备注'} · {new Date(row.createdAt).toLocaleString()}
                </div>
              </div>
              <button type="button" className="btn-ghost text-tg-red" onClick={() => removeIp(row.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-medium">最近登录审计</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-tg-muted">
              <tr>
                <th className="py-2 pr-3">时间</th>
                <th className="py-2 pr-3">账号</th>
                <th className="py-2 pr-3">IP</th>
                <th className="py-2 pr-3">结果</th>
                <th className="py-2">原因</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id} className="border-t border-tg-border">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-3">{a.adminEmail}</td>
                  <td className="py-2 pr-3 font-mono">{a.ip}</td>
                  <td className="py-2 pr-3">{a.success ? '成功' : '失败'}</td>
                  <td className="py-2">{a.reason}</td>
                </tr>
              ))}
              {audits.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-tg-muted">
                    暂无审计记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
