'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

export default function ListEditor({ group, reload }: { group: any; reload: () => Promise<void> }) {
  const [type, setType] = useState<'BLACK' | 'WHITE'>('BLACK');
  const [uid, setUid] = useState('');
  const [note, setNote] = useState('');
  const entries = group.listEntries || [];

  async function add() {
    if (!uid.trim()) return;
    await api.post(`/groups/${group.id}/list`, { type, telegramUserId: uid, note });
    setUid('');
    setNote('');
    await reload();
  }
  async function del(id: string) {
    await api.del(`/groups/${group.id}/list/${id}`);
    await reload();
  }

  const black = entries.filter((e: any) => e.type === 'BLACK');
  const white = entries.filter((e: any) => e.type === 'WHITE');

  return (
    <div className="space-y-6">
      <div className="card space-y-3">
        <h2 className="font-semibold">添加名单</h2>
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
          <div>
            <label className="label">类型</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="BLACK">黑名单</option>
              <option value="WHITE">白名单</option>
            </select>
          </div>
          <div>
            <label className="label">用户 ID</label>
            <input className="input" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="123456789" />
          </div>
          <div>
            <label className="label">备注</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button onClick={add} className="btn-primary h-10">
            <Plus className="h-4 w-4" /> 添加
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {[
          { title: '黑名单', data: black, color: 'text-tg-red' },
          { title: '白名单', data: white, color: 'text-tg-green' },
        ].map((col) => (
          <div key={col.title} className="card">
            <h3 className={`mb-2 font-semibold ${col.color}`}>{col.title}</h3>
            <div className="divide-y divide-white/5">
              {col.data.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-mono">{e.telegramUserId}</span>
                    {e.note && <span className="ml-2 text-xs text-tg-muted">{e.note}</span>}
                  </div>
                  <button onClick={() => del(e.id)} className="btn-danger p-1.5">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {col.data.length === 0 && <p className="py-3 text-sm text-tg-muted">空</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
