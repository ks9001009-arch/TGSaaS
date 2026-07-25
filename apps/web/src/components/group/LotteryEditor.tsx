'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

type Prize = {
  id?: string;
  name: string;
  weight: number;
  rewardPoints: number;
  sortOrder: number;
  isActive: boolean;
};

type LotteryConfig = {
  id: string | null;
  groupId: string;
  enabled: boolean;
  costPoints: number;
  winRatePercent: number;
  prizes: Prize[];
};

function emptyPrize(sortOrder: number): Prize {
  return {
    name: '',
    weight: 1,
    rewardPoints: 0,
    sortOrder,
    isActive: true,
  };
}

export default function LotteryEditor({ groupId }: { groupId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [costPoints, setCostPoints] = useState(10);
  const [winRatePercent, setWinRatePercent] = useState(20);
  const [prizes, setPrizes] = useState<Prize[]>([emptyPrize(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cfg = (await api.get(`/groups/${groupId}/engagement/lottery`)) as LotteryConfig;
      setEnabled(cfg.enabled ?? false);
      setCostPoints(cfg.costPoints ?? 10);
      setWinRatePercent(cfg.winRatePercent ?? 20);
      setPrizes(
        cfg.prizes?.length
          ? cfg.prizes.map((p, i) => ({
              id: p.id,
              name: p.name,
              weight: p.weight,
              rewardPoints: p.rewardPoints,
              sortOrder: p.sortOrder ?? i,
              isActive: p.isActive ?? true,
            }))
          : [emptyPrize(0)],
      );
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  function updatePrize(index: number, patch: Partial<Prize>) {
    setPrizes((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPrize() {
    setPrizes((prev) => [...prev, emptyPrize(prev.length)]);
  }

  function removePrize(index: number) {
    setPrizes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await api.put(`/groups/${groupId}/engagement/lottery`, {
        enabled,
        costPoints: Number(costPoints),
        winRatePercent: Number(winRatePercent),
        prizes: prizes.map((p, i) => ({
          ...(p.id ? { id: p.id } : {}),
          name: p.name.trim(),
          weight: Number(p.weight),
          rewardPoints: Number(p.rewardPoints),
          sortOrder: i,
          isActive: p.isActive,
        })),
      });
      await load();
      setSaved(true);
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-tg-muted">加载抽奖配置…</div>;
  }

  return (
    <div className="card max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">积分抽奖</h2>
          <p className="mt-1 text-xs text-tg-muted">
            群成员发送「抽奖」消耗积分参与。总中奖率决定是否中奖；中奖后再按奖品权重抽取具体奖品。
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">每次消耗积分</label>
          <input
            className="input"
            type="number"
            min={1}
            value={costPoints}
            onChange={(e) => setCostPoints(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">总中奖率（%）</label>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={winRatePercent}
            onChange={(e) => setWinRatePercent(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">奖品池</h3>
          <button type="button" className="btn-ghost text-xs" onClick={addPrize}>
            <Plus className="h-3.5 w-3.5" /> 添加奖品
          </button>
        </div>

        {prizes.map((p, index) => (
          <div
            key={p.id || `new-${index}`}
            className="grid gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-12"
          >
            <div className="sm:col-span-4">
              <label className="label">奖品名称</label>
              <input
                className="input"
                value={p.name}
                placeholder="例如：神秘礼包"
                onChange={(e) => updatePrize(index, { name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">权重</label>
              <input
                className="input"
                type="number"
                min={1}
                value={p.weight}
                onChange={(e) => updatePrize(index, { weight: Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">奖励积分</label>
              <input
                className="input"
                type="number"
                min={0}
                value={p.rewardPoints}
                onChange={(e) => updatePrize(index, { rewardPoints: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-4">
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.isActive}
                  onChange={(e) => updatePrize(index, { isActive: e.target.checked })}
                />
                启用
              </label>
              <button
                type="button"
                className="btn-ghost text-xs text-red-400"
                onClick={() => removePrize(index)}
                disabled={prizes.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-400">已保存</p>}

      <button type="button" className="btn" disabled={saving} onClick={save}>
        <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存抽奖配置'}
      </button>
    </div>
  );
}
