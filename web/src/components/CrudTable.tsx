import { useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { api, type ListParams } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { DataTable, type Column, type FilterDef } from './DataTable';
import { FormModal, type FieldDef } from './EntityForm';
import { Button, ConfirmDialog, IconButton, Textarea } from './ui';

/** Generic list + create/edit/archive for simple resources. Permissions are enforced by the server (RLS). */
export function CrudTable<T extends { id: string; archived_at?: string | null }>({
  resource, title, columns, fields, canWrite, filters, baseFilters, defaultSort, newDefaults, toPayload, empty, onRowClick,
  extraRowActions, createLabel = 'إضافة', archiveNoun = 'السجل', searchPlaceholder, toolbar, formChildren, modalSize,
}: {
  resource: string; title: string; columns: Column<T>[]; fields: FieldDef[] | ((row: T | null) => FieldDef[]); canWrite: boolean;
  filters?: FilterDef[]; baseFilters?: ListParams['filters']; defaultSort?: string; newDefaults?: Record<string, any>;
  toPayload?: (p: Record<string, any>, row: T | null) => Record<string, any>; empty?: { title: string; description?: string };
  onRowClick?: (row: T) => void; extraRowActions?: (row: T) => ReactNode; createLabel?: string; archiveNoun?: string;
  searchPlaceholder?: string; toolbar?: ReactNode; formChildren?: (v: Record<string, any>) => ReactNode; modalSize?: 'sm' | 'md' | 'lg';
}) {
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<T | null>(null);
  const [reason, setReason] = useState('');
  const save = useAction(async ({ payload, row }: { payload: Record<string, any>; row: T | null }) => {
    const body = toPayload ? toPayload(payload, row) : payload;
    return row ? api.update(resource, row.id, body) : api.create(resource, body);
  }, { success: 'تم الحفظ بنجاح' });
  const archive = useAction(({ row, restore }: { row: T; restore?: boolean }) => (restore ? api.restore(resource, row.id) : api.archive(resource, row.id, reason)), {
    success: 'تم تحديث حالة الأرشفة', onSuccess: () => { setArchiving(null); setReason(''); },
  });
  const fieldList = (row: T | null) => (typeof fields === 'function' ? fields(row) : fields);
  const open = creating || !!editing;

  return (
    <>
      <DataTable<T>
        resource={resource} columns={columns} filters={filters} baseFilters={baseFilters} defaultSort={defaultSort}
        searchPlaceholder={searchPlaceholder} archivedToggle onRowClick={onRowClick}
        toolbar={<>{toolbar}{canWrite && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>{createLabel}</Button>}</>}
        empty={{ title: empty?.title || 'لا توجد سجلات بعد', description: empty?.description, action: canWrite ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>{createLabel}</Button> : undefined }}
        rowActions={canWrite || extraRowActions ? (row) => (
          <>
            {extraRowActions?.(row)}
            {canWrite && !row.archived_at && <IconButton label="تعديل" onClick={() => setEditing(row)}><Pencil className="h-4 w-4" /></IconButton>}
            {canWrite && !row.archived_at && <IconButton label="أرشفة" onClick={() => setArchiving(row)}><Archive className="h-4 w-4" /></IconButton>}
            {canWrite && row.archived_at && <IconButton label="استعادة من الأرشيف" onClick={() => archive.mutate({ row, restore: true })}><ArchiveRestore className="h-4 w-4" /></IconButton>}
          </>
        ) : undefined}
      />
      <FormModal open={open} onClose={() => { setCreating(false); setEditing(null); }}
        title={editing ? `تعديل ${title}` : `${createLabel} – ${title}`} fields={fieldList(editing)} size={modalSize}
        initial={editing ?? newDefaults} onSubmit={(payload) => save.mutateAsync({ payload, row: editing })}>
        {formChildren}
      </FormModal>
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} danger confirmLabel="أرشفة" loading={archive.isPending}
        title={`أرشفة ${archiveNoun}`} onConfirm={() => archiving && archive.mutate({ row: archiving })}
        message={<>سيتم نقل {archiveNoun} إلى الأرشيف ولن يظهر في القوائم النشطة. لا يُحذف السجل نهائيًا ويمكن استعادته لاحقًا، ويُسجل الإجراء في سجل التدقيق.</>}>
        <label className="label mt-3" htmlFor="arch-reason">سبب الأرشفة (اختياري)</label>
        <Textarea id="arch-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </ConfirmDialog>
    </>
  );
}
