import { useRef } from 'react';
import { Archive, Download, Paperclip, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { fmtBytes, fmtDateTime } from '@/lib/format';
import { Button, IconButton, Spinner } from './ui';

export function Attachments({ entityType, entityId, canUpload = true, canArchive = false, title = 'المرفقات' }: {
  entityType: string; entityId: string; canUpload?: boolean; canArchive?: boolean; title?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const q = useList('attachments', { filters: { entity_type: entityType, entity_id: entityId }, pageSize: 100 });
  const up = useAction((f: File) => api.upload(entityType, entityId, f), { success: 'تم رفع الملف' });
  const arch = useAction((id: string) => api.archive('attachments', id), { success: 'تمت أرشفة المرفق' });
  const rows = q.data?.rows ?? [];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Paperclip className="h-4 w-4" aria-hidden /> {title}</h3>
        {canUpload && (
          <>
            <input ref={input} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.pptx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ''; }} />
            <Button size="sm" variant="secondary" loading={up.isPending} icon={<Upload className="h-4 w-4" />} onClick={() => input.current?.click()}>إرفاق ملف</Button>
          </>
        )}
      </div>
      {q.isLoading ? <Spinner /> : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-center text-sm text-muted">لا توجد مرفقات. الحد الأقصى للملف 15 ميجابايت.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((a: any) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-accent hover:underline">{a.file_name}</a>
                <div className="text-xs text-muted">{a.uploaded_by_name || '—'} · {fmtDateTime(a.created_at)} · {fmtBytes(a.size_bytes)}</div>
              </div>
              <IconButton label="تنزيل" onClick={() => window.open(`/api/files/${a.id}?download=1`, '_blank')}><Download className="h-4 w-4" /></IconButton>
              {canArchive && <IconButton label="أرشفة المرفق" onClick={() => arch.mutate(a.id)}><Archive className="h-4 w-4" /></IconButton>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
