'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { api } from './api';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost/api';

export interface BotAccess {
  botId: string;
  permissions: string[];
}

export interface PermissionItem {
  key: string;
  label: string;
  advanced?: boolean;
}
export interface PermissionGroup {
  label: string;
  items: PermissionItem[];
}

interface AccessState {
  isSuper: boolean;
  bots: BotAccess[];
  perms: string[]; // role-based permissions (global to the admin)
  groups: PermissionGroup[]; // permission catalog for rendering toggles
  loading: boolean;
  /** super => always true; with botId => that bot's perms; without => role perms or any bot has it */
  can: (perm: string, botId?: string) => boolean;
  permsForBot: (botId: string) => string[];
  refresh: () => Promise<void>;
}

const AccessContext = createContext<AccessState>({} as AccessState);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [isSuper, setIsSuper] = useState(false);
  const [bots, setBots] = useState<BotAccess[]>([]);
  const [perms, setPerms] = useState<string[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [access, meta] = await Promise.all([
        api.get<{ isSuper: boolean; bots: BotAccess[]; permissions: string[] }>('/admins/me/access'),
        api.get<{ groups: PermissionGroup[] }>('/admins/meta/permissions'),
      ]);
      setIsSuper(access.isSuper);
      setBots(access.bots || []);
      setPerms(access.permissions || []);
      setGroups(meta.groups || []);
    } catch {
      // ignore (e.g. not logged in yet)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live permission sync via SSE. Cookie session → short-lived ticket (never put
  // the dashboard JWT in query strings / access logs).
  useEffect(() => {
    let closed = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      try {
        const { token } = await api.post<{ token: string }>('/events/ticket');
        if (closed || !token) return;
        es = new EventSource(`${BASE}/events?token=${encodeURIComponent(token)}`);
        esRef.current = es;
        es.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            if (payload?.type === 'permissions') refresh();
          } catch {
            // ignore pings / non-json
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          esRef.current = null;
          // ticket expires ~2m; reconnect with a fresh ticket
          if (!closed) {
            reconnectTimer = setTimeout(connect, 1500);
          }
        };
      } catch {
        if (!closed) reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      esRef.current = null;
    };
  }, [refresh]);

  const can = useCallback(
    (perm: string, botId?: string) => {
      if (isSuper) return true;
      if (botId) return bots.find((b) => b.botId === botId)?.permissions.includes(perm) ?? false;
      return perms.includes(perm) || bots.some((b) => b.permissions.includes(perm));
    },
    [isSuper, bots, perms],
  );

  const permsForBot = useCallback(
    (botId: string) => {
      if (isSuper) return ['*'];
      return bots.find((b) => b.botId === botId)?.permissions ?? [];
    },
    [isSuper, bots],
  );

  return (
    <AccessContext.Provider value={{ isSuper, bots, perms, groups, loading, can, permsForBot, refresh }}>
      {children}
    </AccessContext.Provider>
  );
}

export const useAccess = () => useContext(AccessContext);

// Mirror of the backend permission keys (apps/api/src/rbac/permissions.ts).
export const PERM = {
  // bots
  BOT_VIEW: 'bot.view',
  BOTS_CREATE: 'bots.create',
  BOTS_DELETE: 'bots.delete',
  BOT_START: 'bot.start',
  BOT_STOP: 'bot.stop',
  BOT_EDIT: 'bot.edit',
  BOT_TOKEN: 'bot.token',
  // groups
  GROUPS_VIEW: 'groups.view',
  GROUPS_EDIT: 'groups.edit',
  GROUPS_DELETE: 'groups.delete',
  // content / moderation
  WELCOME_EDIT: 'welcome.edit',
  VERIFY_EDIT: 'verify.edit',
  CHANNEL_GATE_EDIT: 'channelGate.edit',
  FILTER_ADS: 'filter.ads',
  FILTER_LINKS: 'filter.links',
  FILTER_KEYWORDS: 'filter.keywords',
  ANTIFLOOD_EDIT: 'antiflood.edit',
  BLACKLIST_EDIT: 'blacklist.edit',
  WHITELIST_EDIT: 'whitelist.edit',
  SCHEDULE_MANAGE: 'schedule.manage',
  // data
  STATS_VIEW: 'stats.view',
  LOGS_VIEW: 'logs.view',
  // ads
  AD_VIEW: 'ad.view',
  AD_CREATE: 'ad.create',
  AD_EDIT: 'ad.edit',
  AD_DELETE: 'ad.delete',
  AD_TOGGLE: 'ad.toggle',
  AD_ASSIGN_BOT: 'ad.assignBot',
  AD_ASSIGN_GROUP: 'ad.assignGroup',
  AD_STATS: 'ad.stats',
  // marketing center
  MARKETING_VIEW: 'marketing.view',
  BUTTON_MANAGE: 'button.manage',
  TEMPLATE_MANAGE: 'template.manage',
  TEMPLATE_APPLY: 'template.apply',
  TEMPLATE_UNAPPLY: 'template.unapply',
  // listener center
  LISTENER_VIEW: 'listener.view',
  LISTENER_ACCOUNT: 'listener.account',
  LISTENER_GROUP: 'listener.group',
  LISTENER_RULE: 'listener.rule',
  LISTENER_PUSH: 'listener.push',
  LISTENER_STATS: 'listener.stats',
  // IG/TK collection
  COLLECTION_VIEW: 'collection.view',
  COLLECTION_MANAGE: 'collection.manage',
  // system
  ADMINS_MANAGE: 'admins.manage',
  SETTINGS_MANAGE: 'settings.manage',
} as const;
