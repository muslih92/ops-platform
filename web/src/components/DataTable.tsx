import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Archive, Filter, Search, X } from 'lucide-react';
import { useDebounced, useList, useMediaQuery } from '@/lib/hooks';
import type { ListParams } from '@/lib/api';
import { Button, cx, EmptyState, ErrorState, Input, Pagination, Select, Skeleton, type Opt } from './ui';

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortKey?: string;
  className?: string;
  mobile?: 'title' | 'hide' | 'show';
};
export type FilterDef = { key: string; label: string; type?: 'select' | 'date' | 'bool'; options?: Opt[]; placeholder?: string };

export function DataTable<T extends { id?: string }>({
  resource, columns, filters = [], baseFilters, defaultSort, onRowClick, rowActions, toolbar, empty, searchPlaceholder = 'بحث…',
  archivedToggle, initialFilters, pageSize = 20, onParamsChange, footerNote,
}: {
  resource: string;
  columns: Column<T>[];
  filters?: FilterDef[];
  baseFilters?: ListParams['filters'];
  defaultSort?: string;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  toolbar?: ReactNode;
  empty?: { title: string; description?: string; action?: ReactNode };
  searchPlaceholder?: string;
  archivedToggle?: boolean;
  initialFilters?: Record<string, string>;
  pageSize?: number;
  onParamsChange?: (p: ListParams) => void;
  footerNote?: ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(1);
  const [f, setF] = useState<Record<string, string>>(initialFilters || {});
  const [archived, setArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(!!initialFilters && Object.keys(initialFilters).length > 0);
  const dSearch = useDebounced(search);
  const isMobile = useMediaQuery('(max-width: 767px)');

  const params: ListParams = useMemo(() => ({
    search: dSearch || undefined, sort, page, pageSize,
    filters: { ...f, ...(baseFilters || {}) },
    archived: archived ? 'only' : undefined,
  }), [dSearch, sort, page, pageSize, f, baseFilters, archived]);
  useEffect(() => setPage(1), [dSearch, f, archived, JSON.stringify(baseFilters)]);
  useEffect(() => onParamsChange?.(params), [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = useList<T>(resource, params);
  const rows = q.data?.rows ?? [];
  const activeFilters = Object.values(f).filter(Boolean).length;

  const toggleSort = (key?: string) => {
    if (!key) return;
    setSort((s) => (s === key ? `-${key}` : key));
  };

  return (
    <div className="card overflow-hidden">
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className="ps-9" aria-label="بحث" />
        </div>
        {filters.length > 0 && (
          <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} icon={<Filter className="h-4 w-4" />} aria-expanded={showFilters}>
            الفلاتر{activeFilters ? <span className="num rounded-full bg-accent px-1.5 text-xs text-accent-fg">{activeFilters}</span> : null}
          </Button>
        )}
        {archivedToggle && (
          <Button variant={archived ? 'accent' : 'secondary'} onClick={() => setArchived((a) => !a)} icon={<Archive className="h-4 w-4" />} aria-pressed={archived}>
            {archived ? 'عرض المؤرشف' : 'الأرشيف'}
          </Button>
        )}
        {toolbar}
      </div>
      {showFilters && filters.length > 0 && (
        <div className="no-print grid grid-cols-1 gap-3 border-b border-border bg-surface-2/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {filters.map((fd) => (
            <div key={fd.key}>
              <label className="label text-xs" htmlFor={`flt-${fd.key}`}>{fd.label}</label>
              {fd.type === 'date' ? (
                <Input id={`flt-${fd.key}`} type="date" value={f[fd.key] || ''} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })} />
              ) : (
                <Select id={`flt-${fd.key}`} value={f[fd.key] || ''} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })}
                  placeholder={fd.placeholder || 'الكل'}
                  options={fd.type === 'bool' ? [{ value: 'true', label: 'نعم' }, { value: 'false', label: 'لا' }] : fd.options || []} />
              )}
            </div>
          ))}
          {activeFilters > 0 && (
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => setF({})} icon={<X className="h-4 w-4" />}>مسح الفلاتر</Button>
            </div>
          )}
        </div>
      )}

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title={search || activeFilters ? 'لا توجد نتائج مطابقة' : empty?.title || 'لا توجد بيانات بعد'}
          description={search || activeFilters ? 'جرّب تعديل البحث أو الفلاتر.' : empty?.description}
          action={!search && !activeFilters ? empty?.action : undefined} />
      ) : isMobile ? (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => {
            const title = columns.find((c) => c.mobile === 'title') || columns[0];
            return (
              <li key={(r as any).id || i} className={cx('p-3', onRowClick && 'cursor-pointer active:bg-surface-2')} onClick={() => onRowClick?.(r)}>
                <div className="mb-1 font-semibold">{title.render ? title.render(r) : (r as any)[title.key]}</div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {columns.filter((c) => c !== title && c.mobile !== 'hide').map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] text-muted">{c.header}</dt>
                      <dd className="truncate text-sm">{c.render ? c.render(r) : (r as any)[c.key] ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
                {rowActions && <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>{rowActions(r)}</div>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-surface-2/60">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cx('th', c.className)} aria-sort={sort === c.sortKey ? 'ascending' : sort === `-${c.sortKey}` ? 'descending' : undefined}>
                    {c.sortKey ? (
                      <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => toggleSort(c.sortKey)}>
                        {c.header}
                        {sort === c.sortKey ? <ArrowUp className="h-3 w-3" /> : sort === `-${c.sortKey}` ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : c.header}
                  </th>
                ))}
                {rowActions && <th className="th no-print"><span className="sr-only">إجراءات</span></th>}
              </tr>
            </thead>
            <tbody className={cx(q.isFetching && 'opacity-70')}>
              {rows.map((r, i) => (
                <tr key={(r as any).id || i} className={cx('border-t border-border', onRowClick && 'cursor-pointer hover:bg-surface-2/60')} onClick={() => onRowClick?.(r)}>
                  {columns.map((c) => (
                    <td key={c.key} className={cx('td', c.className)}>{c.render ? c.render(r) : (r as any)[c.key] ?? '—'}</td>
                  ))}
                  {rowActions && <td className="td no-print whitespace-nowrap" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">{rowActions(r)}</div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footerNote}
      <Pagination page={page} pageSize={pageSize} total={q.data?.total ?? 0} onPage={setPage} />
    </div>
  );
}
