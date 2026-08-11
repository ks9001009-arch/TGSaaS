'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, markSession, clearSession } from './api';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  tenantId: string;
  isSuper: boolean;
  locale: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const me = await api.get<User>('/auth/me');
      markSession();
      setUser(me);
    } catch {
      clearSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Always probe cookie session (HttpOnly JWT not readable from JS).
    refresh();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ user: User }>('/auth/login', { email, password });
    markSession();
    setUser(res.user);
  }

  async function register(email: string, password: string, displayName?: string, inviteCode?: string) {
    const res = await api.post<{ user: User }>('/auth/register', {
      email,
      password,
      displayName,
      inviteCode,
    });
    markSession();
    setUser(res.user);
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // still clear local marker
    }
    clearSession();
    setUser(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
