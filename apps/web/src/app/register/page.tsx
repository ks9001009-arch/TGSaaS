'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Public registration is disabled. Accounts are created by a super admin and
// handed out, so this route just redirects to the login page.
export default function RegisterPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-tg-bg px-4 text-sm text-tg-muted">
      注册已关闭，正在跳转到登录…
    </div>
  );
}
