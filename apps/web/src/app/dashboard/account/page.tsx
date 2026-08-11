'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [bindInfo, setBindInfo] = useState<{ code: string; command: string; expiresIn: number } | null>(
    null,
  );
  const [bindMsg, setBindMsg] = useState('');
  const [busy, setBusy] = useState(false);

  function loadProfile() {
    api
      .get('/users/profile')
      .then((p) => {
        setProfile(p);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function setLocale(locale: string) {
    await api.patch('/users/locale', { locale });
    await refresh();
  }

  async function requestBind() {
    setBindMsg('');
    setBusy(true);
    try {
      const res = await api.post<{ code: string; command: string; expiresIn: number }>(
        '/users/telegram/bind-request',
      );
      setBindInfo(res);
      setBindMsg(`绑定码已生成，约 ${Math.round(res.expiresIn / 60)} 分钟内有效`);
    } catch (e: any) {
      setBindMsg(e?.message || '生成失败');
    } finally {
      setBusy(false);
    }
  }

  async function unbindTelegram() {
    setBindMsg('');
    setBusy(true);
    try {
      await api.del('/users/telegram');
      setBindInfo(null);
      loadProfile();
      setBindMsg('已解除绑定');
    } catch (e: any) {
      setBindMsg(e?.message || '解绑失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">我的账户</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold">基本信息</h2>
          <Row k="邮箱" v={profile?.email} />
          <Row k="昵称" v={profile?.displayName || '-'} />
          <Row k="角色" v={profile?.isSuper ? '超级管理员' : '管理员'} />
          <Row k="租户" v={profile?.tenant?.name} />
          <Row k="套餐" v={profile?.tenant?.plan} />
          <Row k="可管理机器人" v={profile?.botCount} />
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold">语言 / Language</h2>
          <p className="text-sm text-tg-muted">当前：{user?.locale}</p>
          <div className="flex gap-2">
            <button onClick={() => setLocale('zh')} className="btn-ghost">中文</button>
            <button onClick={() => setLocale('en')} className="btn-ghost">English</button>
          </div>
        </div>

        <div className="card space-y-3 md:col-span-2">
          <h2 className="font-semibold">绑定 Telegram 账号</h2>
          <p className="text-sm text-tg-muted">
            通过机器人私聊完成所有权验证后，后台才会绑定你的 Telegram。
            绑定后可在私聊菜单使用「我的群组」。
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-tg-muted">
            <li>点击下方「获取绑定码」</li>
            <li>打开任意已接入本平台的机器人私聊</li>
            <li>发送 <code>/bind 绑定码</code>（或使用 <code>/start bind_绑定码</code>）</li>
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={requestBind} className="btn-primary" disabled={busy}>
              获取绑定码
            </button>
            {profile?.telegramUserId && (
              <>
                <span className="text-sm text-tg-green">
                  已绑定：{profile.telegramUserId}
                  {profile.telegramUsername ? ` (@${profile.telegramUsername})` : ''}
                </span>
                <button onClick={unbindTelegram} className="btn-ghost" disabled={busy}>
                  解除绑定
                </button>
              </>
            )}
            <button onClick={loadProfile} className="btn-ghost" disabled={busy}>
              刷新状态
            </button>
          </div>
          {bindInfo && (
            <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm">
              <div>
                绑定码：<code className="text-base font-semibold tracking-wider">{bindInfo.code}</code>
              </div>
              <div className="mt-1 text-tg-muted">
                命令：<code>{bindInfo.command}</code>
              </div>
            </div>
          )}
          {bindMsg && <span className="text-sm text-tg-muted">{bindMsg}</span>}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 text-sm">
      <span className="text-tg-muted">{k}</span>
      <span>{v ?? '-'}</span>
    </div>
  );
}
