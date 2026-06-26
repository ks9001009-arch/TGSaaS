'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Bot } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password, displayName || undefined, inviteCode || undefined);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-tg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-tg-blue">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-xl font-semibold">创建账号</h1>
          <p className="mt-1 text-sm text-tg-muted">注册后即可创建并管理你的机器人</p>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">昵称（可选）</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="label">邮箱</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">密码（至少 8 位）</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="label">邀请码（可选）</label>
            <input className="input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          </div>
          {error && <p className="text-sm text-tg-red">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? '注册中…' : '注册'}
          </button>
          <p className="text-center text-sm text-tg-muted">
            已有账号？{' '}
            <Link href="/login" className="text-tg-blue hover:underline">
              去登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
