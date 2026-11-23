import { useState } from 'react';
import { History } from 'lucide-react';
import { label, options, t } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { useUsersDir } from '@/lib/hooks';
import { DataTable } from '@/components/DataTable';
import { Alert, Badge, Modal, PageHeader } from '@/components/ui';

const actionTone = { insert: 'success', update: 'info', delete: 'danger', archive: 'warning', restore: 'accent', coverage_override: 'danger' } as const;
const HIDDEN = new Set(['updated_at', 'updated_by', 'created_at', 'created_by']);

function Diff({ row }: { row: any }) {
  const o = row.old_data || {};
  const n = row.new_data || {};
  const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)])).filter((k) => !HIDDEN.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (row.action === 'coverage_override') return <pre className="ltr overflow-auto rounded bg-surface-2 p-2 text-xs">{JSON.stringify(n, null, 2)}</pre>;
  if (!keys.length) return <p className="text-sm text-muted">لا توجد فروقات في الحقول.</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr><th className="th">الحقل</th><th className="th">قبل</th><th className="th">بعد</th></tr></thead>
      <tbody>{keys.map((k) => <tr key={k} className="border-t border-border align-top"><td className="td ltr font-mono">{k}</td><td className="td break-all text-danger">{show(o[k])}</td><td className="td break-all text-success">{show(n[k])}</td></tr>)}</tbody>
    </table></div>
  );
}

export default function Audit() {
  const users = useUsersDir();
  const [open, setOpen] = useState<any>(null);
  const tables = Object.entries(t.tables).map(([value, l]) => ({ value, label: l }));
  return (
    <div>
      <PageHeader title="سجل التدقيق" icon={<History className="h-6 w-6" />} description="سجل غير قابل للتعديل أو الحذف من الواجهة لكل إضافة وتعديل وأرشفة واستعادة وتجاوز تغطية." />
      <Alert tone="info" className="mb-4">لا تُسجَّل كلمات المرور. يُحفظ اسم المنفذ ووقت التنفيذ بتوقيت الرياض والسبب عند توفره.</Alert>
      <DataTable resource="audit_logs" defaultSort="-created_at" searchPlaceholder="ابحث باسم الجدول أو المنفذ أو السبب أو المعرّف…"
        filters={[
          { key: 'action', label: 'الإجراء', options: options('audit_action') },
          { key: 'table_name', label: 'الجدول', options: tables },
          { key: 'actor_id', label: 'المنفذ', options: users.options },
          { key: 'created_at__gte', label: 'من تاريخ', type: 'date' },
          { key: 'created_at__lte', label: 'إلى تاريخ', type: 'date' },
        ]}
        onRowClick={(r) => setOpen(r)}
        columns={[
          { key: 'created_at', header: 'الوقت', sortKey: 'created_at', mobile: 'title', render: (r: any) => fmtDateTime(r.created_at) },
          { key: 'actor_name', header: 'المنفذ', render: (r: any) => r.actor_name || 'النظام' },
          { key: 'action', header: 'الإجراء', render: (r: any) => <Badge tone={(actionTone as any)[r.action]}>{label('audit_action', r.action)}</Badge> },
          { key: 'table_name', header: 'الجدول', render: (r: any) => t.tables[r.table_name] || r.table_name },
          { key: 'reason', header: 'السبب', render: (r: any) => r.reason || '—' },
        ]}
        empty={{ title: 'لا توجد سجلات' }} />
      <Modal open={!!open} onClose={() => setOpen(null)} title="تفاصيل السجل" size="lg">
        {open && (
          <div className="space-y-3 text-sm">
            <div>{fmtDateTime(open.created_at)} · {open.actor_name || 'النظام'} · {label('audit_action', open.action)} · {t.tables[open.table_name] || open.table_name}</div>
            <div className="text-xs text-muted">معرّف السجل: <span className="ltr">{open.record_id}</span></div>
            {open.reason && <div>السبب: {open.reason}</div>}
            <Diff row={open} />
          </div>
        )}
      </Modal>
    </div>
  );
}
