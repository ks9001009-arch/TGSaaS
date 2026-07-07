'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Webhook, Key, Server, ScanText, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/access';

interface OcrSettings {
  provider: string;
  lang: string;
  ocrspaceUserId: string;
  ocrspaceApiKeyMasked: string;
  configured: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const { isSuper, loading } = useAccess();

  const [ocr, setOcr] = useState<OcrSettings | null>(null);
  const [provider, setProvider] = useState('ocrspace');
  const [lang, setLang] = useState('eng');
  const [userId, setUserId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !isSuper) router.replace('/dashboard');
  }, [loading, isSuper, router]);

  useEffect(() => {
    if (!isSuper) return;
    api.get<OcrSettings>('/system/ocr')
      .then((data) => {
        setOcr(data);
        setProvider(data.provider || 'tesseract');
        setLang(data.lang || 'eng');
        setUserId(data.ocrspaceUserId || '');
      })
      .catch(() => undefined);
  }, [isSuper]);

  async function saveOcr() {
    setSaving(true);
    setError('');
    try {
      const data = await api.put<OcrSettings>('/system/ocr', {
        provider,
        lang,
        ocrspaceUserId: userId,
        ...(apiKey.trim() ? { ocrspaceApiKey: apiKey.trim() } : {}),
      });
      setOcr(data);
      setApiKey('');
      setMsg('OCR / 图片查重 API 已更新');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-tg-muted">加载中…</div>;
  if (!isSuper) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">系统设置</h1>

      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}
      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}

      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-tg-blue">
          <ScanText className="h-5 w-5" />
          <h2 className="font-semibold">OCR / 图片查重 API</h2>
        </div>
        <p className="text-sm text-tg-muted">
          用于群采集和私聊截图查询。默认本地 tesseract（免费）；切换到 OCR.space 后识别更准，适合付费客户。
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">识别引擎</label>
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="tesseract">tesseract（免费本地）</option>
              <option value="ocrspace">OCR.space（付费云 OCR）</option>
            </select>
          </div>
          <div>
            <label className="label">语言</label>
            <input className="input" value={lang} onChange={(e) => setLang(e.target.value)} placeholder="eng 或 eng+chi_sim" />
          </div>
          <div>
            <label className="label">OCR.space 用户 ID</label>
            <input className="input" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="1478647847" />
          </div>
          <div>
            <label className="label">OCR.space API Key</label>
            <input
              className="input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={ocr?.ocrspaceApiKeyMasked ? `已配置 ${ocr.ocrspaceApiKeyMasked}` : '输入新 Key 以更换'}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-tg-muted">
            当前状态：{ocr?.configured ? '已启用 OCR.space' : provider === 'ocrspace' ? '等待填写 API Key' : '使用本地 tesseract'}
          </span>
          <button onClick={saveOcr} className="btn-primary" disabled={saving}>
            <Save className="h-4 w-4" /> 保存 OCR 设置
          </button>
        </div>
      </div>

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
            OCR 也可通过环境变量 <code className="rounded bg-white/10 px-1">OCRSPACE_API_KEY</code> 注入，启动时自动同步。
          </p>
        </div>
      </div>
    </div>
  );
}
