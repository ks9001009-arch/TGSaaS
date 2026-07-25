'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Collection center UI has been retired from the console. */
export default function CollectionSettingsRetiredPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/groups');
  }, [router]);
  return <div className="text-sm text-tg-muted">采集中心已下线，正在跳转到群组中心…</div>;
}
