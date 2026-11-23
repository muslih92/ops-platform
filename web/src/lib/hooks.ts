import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, type ListParams } from './api';
import type { Opt } from '@/components/ui';

export function useList<T = any>(res: string, params: ListParams, enabled = true) {
  return useQuery({
    queryKey: ['list', res, params],
    queryFn: () => api.list<T>(res, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOne<T = any>(res: string, id?: string | null) {
  return useQuery({ queryKey: ['one', res, id], queryFn: () => api.one<T>(res, id!), enabled: !!id });
}

export function useRpc<T = any>(fn: string, args: Record<string, unknown>, enabled = true) {
  return useQuery({ queryKey: ['rpc', fn, args], queryFn: () => api.rpc<T>(fn, args), enabled });
}

/** Options for pickers (cached). */
export function useOptions(res: string, opts: { label?: (r: any) => string; value?: string; filters?: ListParams['filters']; sort?: string; enabled?: boolean } = {}) {
  const q = useQuery({
    queryKey: ['options', res, opts.filters, opts.sort],
    queryFn: () => api.list(res, { pageSize: 200, filters: opts.filters, sort: opts.sort }),
    staleTime: 5 * 60_000,
    enabled: opts.enabled !== false,
  });
  const rows = q.data?.rows ?? [];
  const options: Opt[] = rows.map((r: any) => ({ value: String(r[opts.value || 'id']), label: opts.label ? opts.label(r) : r.name ?? r.full_name ?? r.id }));
  return { options, rows, isLoading: q.isLoading };
}

export const useSites = () => useOptions('sites', { label: (r) => `${r.name} (${r.code})`, sort: 'code' });
export const useEmployeesDir = (filters?: ListParams['filters']) =>
  useOptions('employee_directory', { label: (r) => `${r.full_name} – ${r.employee_number}`, filters, sort: 'full_name' });
export const useUsersDir = () => useOptions('user_directory', { label: (r) => r.full_name, sort: 'full_name' });

/** Invalidate everything list-like after a mutation. */
export function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['list'] });
    qc.invalidateQueries({ queryKey: ['one'] });
    qc.invalidateQueries({ queryKey: ['rpc'] });
    qc.invalidateQueries({ queryKey: ['options'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };
}

/** Mutation helper with standard toasts. */
export function useAction<TArgs = void, TRes = unknown>(fn: (a: TArgs) => Promise<TRes>, opts: { success?: string; onSuccess?: (r: TRes) => void } = {}) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast.success(opts.success);
      invalidate();
      opts.onSuccess?.(r);
    },
    onError: (e: any) => toast.error(e?.message || 'تعذر الحفظ'),
  });
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}
