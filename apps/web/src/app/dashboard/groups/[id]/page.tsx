'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, PERM } from '@/lib/access';
import WelcomeEditor from '@/components/group/WelcomeEditor';
import ButtonEditor from '@/components/group/ButtonEditor';
import VerificationEditor from '@/components/group/VerificationEditor';
import ChannelGateEditor from '@/components/group/ChannelGateEditor';
import KeywordsEditor from '@/components/group/KeywordsEditor';
import FilterEditor from '@/components/group/FilterEditor';
import ListEditor from '@/components/group/ListEditor';
import LogsView from '@/components/group/LogsView';

// each tab is shown only if the admin holds (one of) the relevant permission(s)
const TAB_DEFS: { id: string; label: string; perms: string[] }[] = [
  { id: 'welcome', label: '欢迎消息', perms: [PERM.WELCOME_EDIT] },
  { id: 'buttons', label: '按钮编辑器', perms: [PERM.WELCOME_EDIT] },
  { id: 'verify', label: '新人验证', perms: [PERM.VERIFY_EDIT] },
  { id: 'channel', label: '关注频道解禁', perms: [PERM.CHANNEL_GATE_EDIT] },
  { id: 'keywords', label: '关键词', perms: [PERM.FILTER_KEYWORDS] },
  { id: 'filter', label: '广告/过滤', perms: [PERM.FILTER_ADS, PERM.FILTER_LINKS, PERM.ANTIFLOOD_EDIT] },
  { id: 'lists', label: '黑/白名单', perms: [PERM.BLACKLIST_EDIT, PERM.WHITELIST_EDIT] },
  { id: 'logs', label: '日志中心', perms: [PERM.LOGS_VIEW] },
];

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { isSuper, can } = useAccess();
  const [group, setGroup] = useState<any>(null);
  const [tab, setTab] = useState('');

  const tabs = useMemo(
    () => TAB_DEFS.filter((t) => isSuper || t.perms.some((p) => can(p))),
    [isSuper, can],
  );

  const reload = useCallback(async () => {
    const g = await api.get(`/groups/${id}`);
    setGroup(g);
  }, [id]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  // pick the first permitted tab once tabs are known
  useEffect(() => {
    if (tabs.length && !tabs.find((t) => t.id === tab)) setTab(tabs[0].id);
  }, [tabs, tab]);

  async function removeGroup() {
    if (!confirm('确认删除该群组？机器人将退出该群，且其所有配置将被清除。')) return;
    try {
      await api.del(`/groups/${id}`);
      router.replace('/dashboard/groups');
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (!group) {
    return <div className="text-tg-muted">加载中…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/groups" className="btn-ghost h-9 w-9 p-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{group.title}</h1>
          <p className="text-sm text-tg-muted">
            {group.bot?.name} · ID {group.telegramChatId} · 成员 {group.memberCount}
          </p>
        </div>
        {(isSuper || can(PERM.GROUPS_DELETE)) && (
          <button onClick={removeGroup} className="btn-danger text-xs">
            <Trash2 className="h-4 w-4" /> 删除群组
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              tab === t.id ? 'bg-tg-blue text-white' : 'text-tg-muted hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-tg-muted">
          你没有该群组的任何配置权限。
        </div>
      )}

      {tab === 'welcome' && <WelcomeEditor group={group} reload={reload} />}
      {tab === 'buttons' && <ButtonEditor group={group} reload={reload} />}
      {tab === 'verify' && <VerificationEditor group={group} reload={reload} />}
      {tab === 'channel' && <ChannelGateEditor group={group} reload={reload} />}
      {tab === 'keywords' && <KeywordsEditor group={group} reload={reload} />}
      {tab === 'filter' && <FilterEditor group={group} reload={reload} />}
      {tab === 'lists' && <ListEditor group={group} reload={reload} />}
      {tab === 'logs' && <LogsView groupId={group.id} />}
    </div>
  );
}
