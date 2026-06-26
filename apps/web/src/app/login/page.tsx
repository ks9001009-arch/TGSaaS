'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Bot } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('admin12345');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
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
          <h1 className="text-xl font-semibold">登录管理后台</h1>
          <p className="mt-1 text-sm text-tg-muted">Telegram 群管理 SaaS 平台</p>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">管理员用户名 / 邮箱</label>
            <input className="input" type="text" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">密码</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-tg-red">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
          <p className="text-center text-sm text-tg-muted">
            还没有账号？{' '}
            <Link href="/register" className="text-tg-blue hover:underline">
              立即注册
            </Link>
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-tg-muted">
          演示账号：admin@demo.local / admin12345
        </p>
      </div>
    </div>
  );
}
