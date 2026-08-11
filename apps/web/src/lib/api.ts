const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost/api';

/** Client-side session marker only (JWT lives in HttpOnly cookie). */
const SESSION_KEY = 'tg_saas_authed';

export function hasSession(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(SESSION_KEY) === '1';
}

export function markSession() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(SESSION_KEY);
    // Migrate away from legacy localStorage JWT if present.
    window.localStorage.removeItem('tg_saas_token');
  }
}

/** @deprecated Use hasSession(); kept for call-site compatibility during migration. */
export function getToken(): string | null {
  return hasSession() ? 'cookie' : null;
}

export function setToken(_token?: string) {
  markSession();
}

export function clearToken() {
  clearSession();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body != null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('未授权，请重新登录');
  }
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || '请求失败';
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: any) =>
    request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(p: string, body?: any) =>
    request<T>(p, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(p: string, body?: any) =>
    request<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T = any>(p: string) => request<T>(p, { method: 'DELETE' }),
};
