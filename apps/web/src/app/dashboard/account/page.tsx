'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [tgId, setTgId] = useState('');
  const [bindMsg, setBindMsg] = useState('');

  function loadProfile() {
    api
      .get('/users/profile')
      .then((p) => {
        setProfile(p);
        setTgId(p?.telegramUserId || '');
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

  async function bindTelegram() {
    setBindMsg('');
    try {
      await api.patch('/users/telegram', { telegramUserId: tgId.trim() });
      loadProfile();
      setBindMsg('已保存');
    } catch (e: any) {
      setBindMsg(e?.message || '保存失败');
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
            绑定后，在机器人私聊里点击「📊 我的群组」即可识别你的后台账号并查看/进入你管理的群组。
            未绑定的用户点击时会收到「暂未开通管理后台权限」的提示。
          </p>
          <p className="text-sm text-tg-muted">
            获取你的 Telegram 数字 ID：在机器人私聊中发送 <code>/id</code>。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-xs"
              value={tgId}
              onChange={(e) => setTgId(e.target.value)}
              placeholder="例如 123456789"
            />
            <button onClick={bindTelegram} className="btn-primary">保存绑定</button>
            {profile?.telegramUserId && (
              <span className="text-sm text-tg-green">已绑定：{profile.telegramUserId}</span>
            )}
            {bindMsg && <span className="text-sm text-tg-muted">{bindMsg}</span>}
          </div>
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
