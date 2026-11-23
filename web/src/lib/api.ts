export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'ops-app' };
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مرة أخرى.');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/auth/')) window.dispatchEvent(new Event('ops:unauthenticated'));
    throw new ApiError(res.status, data?.error || 'تعذر تنفيذ الطلب', data?.code);
  }
  return data as T;
}

export type ListResult<T> = { rows: T[]; total: number; page: number; pageSize: number };
export type ListParams = {
  search?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  archived?: 'include' | 'only';
  filters?: Record<string, string | number | boolean | undefined | null>;
  export?: boolean;
};

export function qs(p: ListParams = {}) {
  const u = new URLSearchParams();
  if (p.search) u.set('search', p.search);
  if (p.sort) u.set('sort', p.sort);
  if (p.page) u.set('page', String(p.page));
  if (p.pageSize) u.set('pageSize', String(p.pageSize));
  if (p.archived) u.set('archived', p.archived);
  if (p.export) u.set('export', '1');
  for (const [k, v] of Object.entries(p.filters || {})) {
    if (v !== undefined && v !== null && v !== '') u.set(`f.${k}`, String(v));
  }
  return u.toString();
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T = any>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  list: <T = any>(res: string, p?: ListParams) => request<ListResult<T>>('GET', `/api/r/${res}?${qs(p)}`),
  one: <T = any>(res: string, id: string) => request<T>('GET', `/api/r/${res}/${id}`),
  create: <T = any>(res: string, body: Record<string, unknown>) => request<T>('POST', `/api/r/${res}`, body),
  update: <T = any>(res: string, id: string, body: Record<string, unknown>) => request<T>('PATCH', `/api/r/${res}/${id}`, body),
  archive: (res: string, id: string, reason?: string) => request('POST', `/api/r/${res}/${id}/archive`, { reason }),
  restore: (res: string, id: string) => request('POST', `/api/r/${res}/${id}/restore`, {}),
  remove: (res: string, key: Record<string, string>) => request('DELETE', `/api/r/${res}`, key),
  rpc: <T = any>(fn: string, args: Record<string, unknown> = {}) => request<any>('POST', `/api/rpc/${fn}`, args).then((r) => (Array.isArray(r) ? r : r?.result) as T),
  upload: (entityType: string, entityId: string, file: File) => {
    const fd = new FormData();
    fd.append('entity_type', entityType);
    fd.append('entity_id', entityId);
    fd.append('file', file);
    return request<any>('POST', '/api/files', fd, true);
  },
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<any>('POST', '/api/settings/logo', fd, true);
  },
};
