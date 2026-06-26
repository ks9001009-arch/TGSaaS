'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Webhook, Key, Server } from 'lucide-react';
import { useAccess } from '@/lib/access';

export default function SettingsPage() {
  const router = useRouter();
  const { isSuper, loading } = useAccess();

  // system settings are tenant-super-admin only
  useEffect(() => {
    if (!loading && !isSuper) router.replace('/dashboard');
  }, [loading, isSuper, router]);

  if (!loading && !isSuper) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">系统设置</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <div className="flex items-center gap-2 text-tg-blue">
            <Server className="h-5 w-5" /> <h2 className="font-semibold">部署信息</h2>
          </div>
          <p className="text-sm text-tg-muted">
            后端 API、PostgreSQL、Redis、Nginx 均通过 Docker Compose 编排。修改 .env 后执行
            <code className="mx-1 rounded bg-white/10 px-1">docker compose up -d --build</code>
            即可生效。
          </p>
        </div>

        <div className="card space-y-2">
          <div className="flex items-center gap-2 text-tg-green">
            <Webhook className="h-5 w-5" /> <h2 className="font-semibold">Webhook</h2>
          </div>
          <p className="text-sm text-tg-muted">
            每个机器人拥有独立 Webhook 地址 <code className="rounded bg-white/10 px-1">/webhook/&lt;botId&gt;</code>，
            并使用 secret_token 校验。生产环境需 HTTPS 公网地址（设置 PUBLIC_URL）。
          </p>
        </div>

        <div className="card space-y-2">
          <div className="flex items-center gap-2 text-tg-amber">
            <Key className="h-5 w-5" /> <h2 className="font-semibold">API / 第三方</h2>
          </div>
          <p className="text-sm text-tg-muted">
            Turnstile / reCAPTCHA / AI 风控的密钥在 .env 中配置，留空则使用本地按钮/数学/验证码方案。
          </p>
        </div>
      </div>
    </div>
  );
}
