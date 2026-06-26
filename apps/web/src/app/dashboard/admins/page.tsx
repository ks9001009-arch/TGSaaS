'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Trash2, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';

export default function AdminsPage() {
  const router = useRouter();
  const { groups, can, isSuper, loading } = useAccess();
  const [bots, setBots] = useState<any[]>([]);
  const [botId, setBotId] = useState('');
  const [admins, setAdmins] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // create form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');

  // inline edit (profile / password)
  const [editId, setEditId] = useState('');
  const [edit, setEdit] = useState<{ displayName: string; telegramUsername: string; password: string }>({
    displayName: '',
    telegramUsername: '',
    password: '',
  });

  const canManage = isSuper || can(PERM.ADMINS_MANAGE);

  // route guard: sub-admins without ADMINS_MANAGE cannot view this page
  useEffect(() => {
    if (!loading && !canManage) router.replace('/dashboard');
  }, [loading, canManage, router]);

  function flash(m: string, isErr = false) {
    if (isErr) setError(m);
    else setMsg(m);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  }

  useEffect(() => {
    api.get('/bots').then((b: any[]) => {
      const manageable = b.filter((x) => can(PERM.ADMINS_MANAGE, x.id));
      setBots(manageable);
      if (manageable[0]) setBotId(manageable[0].id);
    }).catch(() => {});
  }, []);

  async function loadAdmins(id: string) {
    if (!id) return;
    try {
      setAdmins(await api.get(`/admins?botId=${id}`));
    } catch (err: any) {
      flash(err.message, true);
    }
  }
  useEffect(() => { loadAdmins(botId); }, [botId]);

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    const username = email.trim();
    if (!/^[A-Za-z0-9_]{2,}$/.test(username)) {
      flash('管理员用户名仅支持字母、数字、下划线，且至少 2 个字符。', true);
      return;
    }
    if (!password) {
      flash('请输入登录密码。', true);
      return;
    }
    try {
      await api.post('/admins', {
        botId,
        email: username,
        password,
        displayName: displayName.trim() || undefined,
        telegramUsername: telegramUsername.trim() || undefined,
      });
      setEmail(''); setPassword(''); setDisplayName(''); setTelegramUsername('');
      flash('下级管理员已创建，默认仅开放基础权限，可在下方按需调整。');
      await loadAdmins(botId);
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  async function togglePerm(admin: any, key: string) {
    const has = admin.permissions.includes(key);
    const next = has ? admin.permissions.filter((p: string) => p !== key) : [...admin.permissions, key];
    try {
      await api.patch(`/admins/${admin.id}/permissions`, { permissions: next });
      await loadAdmins(botId); // realtime SSE also pushes to the affected admin
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  async function toggleActive(admin: any) {
    try {
      await api.patch(`/admins/${admin.id}/active`, { active: !admin.active });
      await loadAdmins(botId);
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  async function remove(admin: any) {
    if (!confirm('确认删除该管理员？该账号将无法再登录。')) return;
    try {
      await api.del(`/admins/${admin.id}`);
      await loadAdmins(botId);
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  function startEdit(a: any) {
    setEditId(a.id);
    setEdit({ displayName: a.admin?.displayName || '', telegramUsername: a.admin?.telegramUsername || '', password: '' });
  }

  async function saveEdit(a: any) {
    try {
      const body: any = { displayName: edit.displayName, telegramUsername: edit.telegramUsername };
      if (edit.password) body.password = edit.password;
      await api.patch(`/admins/${a.id}`, body);
      setEditId('');
      flash('已保存。');
      await loadAdmins(botId);
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  async function assignBot(a: any, newBotId: string) {
    if (!newBotId) return;
    try {
      await api.post(`/admins/${a.id}/bots`, { botId: newBotId });
      flash('已分配机器人。');
      await loadAdmins(botId);
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  async function unassignBot(a: any, targetBotId: string) {
    if ((a.bots?.length ?? 0) <= 1) {
      flash('至少需要保留一个机器人绑定。', true);
      return;
    }
    if (!confirm('取消该机器人的绑定？')) return;
    try {
      await api.del(`/admins/${a.id}/bots/${targetBotId}`);
      flash('已取消绑定。');
      await loadAdmins(botId);
    } catch (err: any) {
      flash(err.message, true);
    }
  }

  if (!canManage) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">下级管理员</h1>
        <p className="text-sm text-tg-muted">为每个机器人创建独立管理员，绑定机器人、开关权限、重置密码，修改后实时生效。</p>
      </div>

      <div className="card">
        <label className="label">选择机器人</label>
        <select className="input" value={botId} onChange={(e) => setBotId(e.target.value)}>
          {bots.map((b) => <option key={b.id} value={b.id}>{b.name} (@{b.username || '?'})</option>)}
        </select>
      </div>

      {error && <div className="rounded-lg bg-tg-red/15 px-4 py-2 text-sm text-tg-red">{error}</div>}
      {msg && <div className="rounded-lg bg-tg-green/15 px-4 py-2 text-sm text-tg-green">{msg}</div>}

      {botId && (
        <form onSubmit={createAdmin} className="card grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">管理员用户名（唯一）</label>
            <input
              className="input"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例如：admin001"
              pattern="[A-Za-z0-9_]+"
              minLength={2}
              required
            />
            <p className="mt-1 text-xs text-tg-muted">用于登录后台，不可重复，仅支持字母、数字、下划线。</p>
          </div>
          <div>
            <label className="label">登录密码</label>
            <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入登录密码" required />
          </div>
          <div>
            <label className="label">管理员昵称（可选）</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例如：华东运营、客服A" />
            <p className="mt-1 text-xs text-tg-muted">仅用于后台显示，方便识别管理员。</p>
          </div>
          <div>
            <label className="label">Telegram 用户名（绑定）</label>
            <input className="input" value={telegramUsername} onChange={(e) => setTelegramUsername(e.target.value)} placeholder="例如：xiaoming" />
            <p className="mt-1 text-xs text-tg-muted">可带或不带 @，系统会自动统一保存为 @username。</p>
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary"><UserPlus className="h-4 w-4" /> 创建管理员</button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {admins.map((a) => {
          const boundIds: string[] = (a.bots ?? []).map((x: any) => x.id);
          const assignable = bots.filter((b) => !boundIds.includes(b.id));
          return (
            <div key={a.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.admin?.displayName || a.admin?.email}</div>
                  <div className="text-xs text-tg-muted">
                    {a.admin?.email}
                    {a.admin?.telegramUsername
                      ? ` · ${a.admin.telegramUsername.startsWith('@') ? a.admin.telegramUsername : '@' + a.admin.telegramUsername}`
                      : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => (editId === a.id ? setEditId('') : startEdit(a))} className="badge bg-white/10 text-tg-muted">
                    {editId === a.id ? '取消编辑' : '编辑'}
                  </button>
                  <button onClick={() => toggleActive(a)} className={`badge ${a.active ? 'bg-tg-green/15 text-tg-green' : 'bg-white/10 text-tg-muted'}`}>
                    {a.active ? '已启用' : '已停用'}
                  </button>
                  <button onClick={() => remove(a)} className="btn-danger text-xs"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              {editId === a.id && (
                <div className="mt-4 grid gap-3 rounded-lg bg-white/5 p-3 md:grid-cols-3">
                  <div>
                    <label className="label">管理员昵称（仅自己可见）</label>
                    <input className="input" value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Telegram 用户名（绑定）</label>
                    <input className="input" value={edit.telegramUsername} onChange={(e) => setEdit({ ...edit, telegramUsername: e.target.value })} placeholder="@username" />
                  </div>
                  <div>
                    <label className="label">重置密码（留空不改）</label>
                    <input className="input" type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} placeholder="可以是 admin" />
                  </div>
                  <div className="md:col-span-3 flex gap-2">
                    <button onClick={() => saveEdit(a)} className="btn-primary text-xs"><Save className="h-4 w-4" /> 保存</button>
                    <button onClick={() => setEditId('')} className="badge bg-white/10 text-tg-muted"><X className="h-4 w-4" /> 关闭</button>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold text-tg-muted">绑定的机器人</div>
                <div className="flex flex-wrap items-center gap-2">
                  {(a.bots ?? []).map((b: any) => (
                    <span key={b.id} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs">
                      {b.name || `@${b.username}`}
                      <button onClick={() => unassignBot(a, b.id)} className="text-tg-muted hover:text-tg-red"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  {assignable.length > 0 && (
                    <select
                      className="input h-8 w-auto py-0 text-xs"
                      value=""
                      onChange={(e) => assignBot(a, e.target.value)}
                    >
                      <option value="">+ 分配机器人</option>
                      {assignable.map((b) => <option key={b.id} value={b.id}>{b.name} (@{b.username || '?'})</option>)}
                    </select>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {groups.map((g) => (
                  <div key={g.label}>
                    <div className="mb-1 text-xs font-semibold text-tg-muted">{g.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {g.items.map((item) => {
                        const checked = a.permissions.includes(item.key);
                        return (
                          <button
                            key={item.key}
                            onClick={() => togglePerm(a, item.key)}
                            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                              checked ? 'border-tg-blue bg-tg-blue/15 text-tg-blue' : 'border-white/10 text-tg-muted hover:bg-white/5'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {admins.length === 0 && botId && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-tg-muted">
            该机器人还没有下级管理员。
          </div>
        )}
      </div>
    </div>
  );
}
