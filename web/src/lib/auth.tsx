import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export type Role = 'system_admin' | 'operations_manager' | 'site_supervisor' | 'employee' | 'report_viewer';
export type Me = {
  user: { id: string; email: string; full_name: string; employee_id: string | null };
  roles: Role[];
  permissions: string[];
  employee: null | { id: string; employee_number: string; full_name: string; job_title: string; primary_site_id: string; shift_id: string; site_name: string; shift_name: string };
  supervisedSites: string[];
  unreadNotifications: number;
};

type Ctx = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
  hasRole: (...r: Role[]) => boolean;
  isGlobal: boolean;
  isManager: boolean;
  isReportOnly: boolean;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try { return await api.get<Me>('/api/auth/me'); } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  useEffect(() => {
    const h = () => qc.setQueryData(['me'], null);
    window.addEventListener('ops:unauthenticated', h);
    return () => window.removeEventListener('ops:unauthenticated', h);
  }, [qc]);

  const me = q.data ?? null;
  const roles = me?.roles ?? [];
  const value: Ctx = {
    me,
    loading: q.isLoading,
    refresh: () => q.refetch(),
    logout: async () => {
      await api.post('/api/auth/logout').catch(() => {});
      qc.clear();
      qc.setQueryData(['me'], null);
    },
    can: (perm) => !!me?.permissions.includes(perm),
    hasRole: (...r) => r.some((x) => roles.includes(x)),
    isGlobal: roles.some((r) => ['system_admin', 'operations_manager', 'report_viewer'].includes(r)),
    isManager: roles.some((r) => ['system_admin', 'operations_manager', 'site_supervisor'].includes(r)),
    isReportOnly: roles.length > 0 && roles.every((r) => r === 'report_viewer'),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
