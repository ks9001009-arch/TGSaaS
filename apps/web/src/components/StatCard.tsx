'use client';

import { ReactNode } from 'react';

export default function StatCard({
  label,
  value,
  icon,
  accent = 'text-tg-blue',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 ${accent}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-tg-muted">{label}</div>
      </div>
    </div>
  );
}
