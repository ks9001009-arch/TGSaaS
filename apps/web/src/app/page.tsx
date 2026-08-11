'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, hasSession, markSession, clearSession } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasSession()) {
        router.replace('/dashboard');
        return;
      }
      try {
        await api.get('/auth/me');
        if (cancelled) return;
        markSession();
        router.replace('/dashboard');
      } catch {
        if (cancelled) return;
        clearSession();
        router.replace('/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center text-tg-muted">
      正在加载…
    </div>
  );
}
