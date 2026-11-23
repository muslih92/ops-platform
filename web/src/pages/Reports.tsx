import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOptions, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDate, fmtDateTime, todayISO } from '@/lib/format';
import { exportCsv, exportXlsx, type ExportCol } from '@/lib/export';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, Spinner, type Opt } from '@/components/ui';

type F = { key: string; label: string; type: 'select' | 'date'; options?: Opt[] };
type Report = {
  key: string; title: string; description: string; filters: F[];
  load: (f: Record<string, string>) => Promise<any[]>;
  cols: ExportCol<any>[];
};

const list = async (res: string, filters: Record<string, any>, sort?: string) => (await api.list(res, { filters, sort, export: true, pageSize: 10000 })).rows;
const clean = (f: Record<string, string | undefined>) => Object.fromEntries(Object.entries(f).filter(([, v]) => v));
const dayEnd = (d?: string) => (d ? `${d}T23:59:59+03:00` : undefined);

function useReports(): Report[] {
  const sites = useSites().options;
  const types = useOptions('leave_types', { sort: 'name' }).options;
  const site: F = { key: 'site_id', label: 'الموقع', type: 'select', options: sites };
  const from: F = { key: 'from', label: 'من تاريخ', type: 'date' };
  const to: F = { key: 'to', label: 'إلى تاريخ', type: 'date' };
  return useMemo(() => [
    { key: 'employees', title: 'الموظفون حسب الموقع والوردية', description: 'بيانات الموظفين الوظيفية (بدون بيانات الاتصال).',
      filters: [{ ...site, key: 'primary_site_id' }, { key: 'status', label: 'الحالة', type: 'select', options: options('employee_status') }],
      load: (f) => list('employees', clean(f), 'employee_number'),
      cols: [{ header: 'الرقم', value: (r) => r.employee_number }, { header: 'الاسم', value: (r) => r.full_name }, { header: 'المسمى', value: (r) => r.job_title }, { header: 'الموقع', value: (r) => r.site_name }, { header: 'الوردية', value: (r) => r.shift_name }, { header: 'الحالة', value: (r) => label('employee_status', r.status) }, { header: 'تجريبي', value: (r) => (r.is_demo ? 'نعم' : '') }] },
    { key: 'tasks', title: 'المهام', description: 'المهام حسب الحالة والموقع وتاريخ الإنشاء.',
      filters: [site, { key: 'status', label: 'الحالة', type: 'select', options: options('task_status') }, { key: 'type', label: 'النوع', type: 'select', options: options('task_type') }, from, to],
      load: (f) => list('tasks', clean({ site_id: f.site_id, status: f.status, type: f.type, created_at__gte: f.from, created_at__lte: dayEnd(f.to) }), '-created_at'),
      cols: [{ header: 'العنوان', value: (r) => r.title }, { header: 'النوع', value: (r) => label('task_type', r.type) }, { header: 'الموقع', value: (r) => r.site_name }, { header: 'المسؤول', value: (r) => r.owner_name }, { header: 'الأولوية', value: (r) => label('task_priority', r.priority) }, { header: 'الحالة', value: (r) => label('task_status', r.status) }, { header: 'الإنشاء', value: (r) => fmtDate(r.created_at) }, { header: 'الاستحقاق', value: (r) => fmtDateTime(r.due_at) }, { header: 'الإغلاق', value: (r) => fmtDateTime(r.closed_at) }] },
    { key: 'overdue', title: 'المهام المتأخرة', description: 'مهام تجاوزت موعد الاستحقاق ولم تكتمل (لا تشمل المنتظرة لجهة أخرى).',
      filters: [site], load: (f) => list('tasks', clean({ site_id: f.site_id, is_overdue: 'true' }), 'due_at'),
      cols: [{ header: 'العنوان', value: (r) => r.title }, { header: 'الموقع', value: (r) => r.site_name }, { header: 'المسؤول', value: (r) => r.owner_name }, { header: 'الاستحقاق', value: (r) => fmtDateTime(r.due_at) }, { header: 'الحالة', value: (r) => label('task_status', r.status) }] },
    { key: 'waiting', title: 'المهام بانتظار جهات أخرى', description: 'تأخير موثق خارج مسؤولية الموظف.',
      filters: [site], load: (f) => list('tasks', clean({ site_id: f.site_id, status: 'waiting_other_party' }), 'due_at'),
      cols: [{ header: 'العنوان', value: (r) => r.title }, { header: 'الموقع', value: (r) => r.site_name }, { header: 'المسؤول', value: (r) => r.owner_name }, { header: 'السبب / الجهة', value: (r) => r.blocked_reason }, { header: 'مرجع SAP', value: (r) => r.sap_notification_no }] },
    { key: 'leaves', title: 'الإجازات', description: 'طلبات الإجازة خلال فترة.',
      filters: [site, { key: 'status', label: 'الحالة', type: 'select', options: options('leave_status') }, { key: 'leave_type_id', label: 'النوع', type: 'select', options: types }, from, to],
      load: (f) => list('leave_requests', clean({ site_id: f.site_id, status: f.status, leave_type_id: f.leave_type_id, end_date__gte: f.from, start_date__lte: f.to }), 'start_date'),
      cols: [{ header: 'الموظف', value: (r) => r.employee_name }, { header: 'الرقم', value: (r) => r.employee_number }, { header: 'الموقع', value: (r) => r.site_name }, { header: 'النوع', value: (r) => r.leave_type_name }, { header: 'من', value: (r) => fmtDate(r.start_date) }, { header: 'إلى', value: (r) => fmtDate(r.end_date) }, { header: 'الأيام', value: (r) => r.days }, { header: 'الحالة', value: (r) => label('leave_status', r.status) }, { header: 'تجاوز تغطية', value: (r) => (r.coverage_override ? 'نعم' : '') }, { header: 'متخذ القرار', value: (r) => r.decided_by_name }] },
    { key: 'overrides', title: 'تجاوزات تحذير التغطية', description: 'إجازات اعتُمدت رغم تحذير التغطية مع السبب الموثق.',
      filters: [site], load: (f) => list('leave_requests', clean({ site_id: f.site_id, coverage_override: 'true' }), '-created_at'),
      cols: [{ header: 'الموظف', value: (r) => r.employee_name }, { header: 'الموقع', value: (r) => r.site_name }, { header: 'الفترة', value: (r) => `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` }, { header: 'سبب التجاوز', value: (r) => r.override_reason }, { header: 'متخذ القرار', value: (r) => r.decided_by_name }, { header: 'تاريخ القرار', value: (r) => fmtDateTime(r.decided_at) }] },
    { key: 'coverage', title: 'تغطية الورديات', description: 'المتاح مقابل الحد الأدنى لكل موقع ووردية في تاريخ محدد.',
      filters: [site, { key: 'date', label: 'التاريخ', type: 'date' }],
      load: (f) => api.rpc<any[]>('coverage_overview', { date: f.date || todayISO(), site_id: f.site_id || null }),
      cols: [{ header: 'الموقع', value: (r) => r.site_name }, { header: 'الوردية', value: (r) => r.shift_name }, { header: 'المسندون', value: (r) => r.assigned }, { header: 'الغائبون', value: (r) => r.absent }, { header: 'المتاحون', value: (r) => r.available }, { header: 'الحد الأدنى', value: (r) => r.min_staff }, { header: 'الوضع', value: (r) => ({ ok: 'كافية', at_min: 'عند الحد الأدنى', below: 'أقل من الحد الأدنى', no_rule: 'لا توجد قاعدة' } as any)[r.status] }] },
    { key: 'skills', title: 'فجوات المهارات', description: 'عدد المؤهلين لكل مهارة في كل موقع، مع إبراز المهارات الأساسية بلا بديل.',
      filters: [site], load: (f) => api.rpc<any[]>('skill_coverage', { site_id: f.site_id || null }),
      cols: [{ header: 'الموقع', value: (r) => r.site_name }, { header: 'المهارة', value: (r) => r.skill_name }, { header: 'المجال', value: (r) => r.domain_name }, { header: 'أساسية', value: (r) => (r.is_core ? 'نعم' : '') }, { header: 'الأهمية', value: (r) => label('skill_criticality', r.criticality) }, { header: 'المؤهلون', value: (r) => r.qualified }, { header: 'المتاحون اليوم', value: (r) => r.available }, { header: 'المتمكنون', value: (r) => r.expert }, { header: 'بلا بديل', value: (r) => (r.qualified <= 1 ? 'نعم' : '') }] },
    { key: 'plans', title: 'خطط التطوير', description: 'حالة خطط التطوير والتقدم والمتأخر منها.',
      filters: [site, { key: 'status', label: 'الحالة', type: 'select', options: options('plan_status') }],
      load: (f) => list('development_plans', clean(f), 'end_date'),
      cols: [{ header: 'الموظف', value: (r) => r.employee_name }, { header: 'الموقع', value: (r) => r.site_name }, { header: 'الهدف', value: (r) => r.goal }, { header: 'المهارة', value: (r) => r.target_skill_name }, { header: 'الطريقة', value: (r) => label('plan_method', r.method) }, { header: 'الانتهاء', value: (r) => fmtDate(r.end_date) }, { header: 'التقدم %', value: (r) => r.progress }, { header: 'الحالة', value: (r) => label('plan_status', r.status) }, { header: 'متأخرة', value: (r) => (r.is_late ? 'نعم' : '') }] },
    { key: 'training', title: 'الترشيحات والدورات', description: 'الحضور والإتمام (الحضور لا يعني اكتساب المهارة).',
      filters: [site, { key: 'status', label: 'الحالة', type: 'select', options: options('enrollment_status') }],
      load: (f) => list('training_enrollments', clean(f), 'employee_name'),
      cols: [{ header: 'الموظف', value: (r) => r.employee_name }, { header: 'الموقع', value: (r) => r.site_name }, { header: 'الدورة', value: (r) => r.course_name }, { header: 'الجهة', value: (r) => r.provider }, { header: 'التاريخ', value: (r) => fmtDate(r.start_date) }, { header: 'الحالة', value: (r) => label('enrollment_status', r.status) }, { header: 'النتيجة', value: (r) => r.result }] },
    { key: 'handover', title: 'بنود التسليم المفتوحة', description: 'ملاحظات الورديات التي لم تُغلق بعد.',
      filters: [site, from, to],
      load: (f) => list('handover_items', clean({ site_id: f.site_id, status: 'open', handover_at__gte: f.from, handover_at__lte: dayEnd(f.to) }), 'handover_at'),
      cols: [{ header: 'الموقع', value: (r) => r.site_name }, { header: 'وقت التسليم', value: (r) => fmtDateTime(r.handover_at) }, { header: 'النوع', value: (r) => label('handover_item_kind', r.kind) }, { header: 'الوصف', value: (r) => r.description }, { header: 'المرجع', value: (r) => r.reference_no }, { header: 'محوّل لمهمة', value: (r) => (r.linked_task_id ? 'نعم' : '') }] },
    { key: 'ideas', title: 'المبادرات والتحسينات', description: 'الأفكار والمبادرات وحالتها.',
      filters: [site, { key: 'status', label: 'الحالة', type: 'select', options: options('idea_status') }],
      load: (f) => list('ideas', clean(f), '-created_at'),
      cols: [{ header: 'العنوان', value: (r) => r.title }, { header: 'النوع', value: (r) => label('idea_kind', r.kind) }, { header: 'مقدمها', value: (r) => r.submitted_by_name }, { header: 'الموقع', value: (r) => r.site_name || 'عام' }, { header: 'المسؤول', value: (r) => r.owner_name }, { header: 'الحالة', value: (r) => label('idea_status', r.status) }, { header: 'التاريخ', value: (r) => fmtDate(r.created_at) }] },
  ], [sites, types]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Reports() {
  const auth = useAuth();
  const reports = useReports();
  const [key, setKey] = useState('tasks');
  const [f, setF] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const rep = reports.find((r) => r.key === key)!;
  const q = useQuery({ queryKey: ['report', key, applied], queryFn: () => rep.load(applied) });
  const rows = q.data ?? [];
  const filterText = rep.filters.map((fd) => {
    const v = applied[fd.key];
    if (!v) return null;
    return `${fd.label}: ${fd.type === 'select' ? fd.options?.find((o) => o.value === v)?.label ?? v : fmtDate(v)}`;
  }).filter(Boolean).join(' · ');
  const meta = { title: rep.title, filters: filterText, preparedBy: auth.me?.user.full_name || '' };
  const canExport = auth.can('reports.export');
  const file = `${rep.key}-${todayISO()}`;
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <PageHeader title="التقارير" icon={<BarChart3 className="h-6 w-6" />} description="تقارير قابلة للتصفية والطباعة والتصدير إلى Excel وCSV وPDF (عبر الطباعة)، مع تاريخ الإعداد والفلاتر ومعد التقرير." />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="no-print h-fit" bodyClass="p-2">
          <ul>{reports.map((r) => (
            <li key={r.key}><button onClick={() => { setKey(r.key); setF({}); setApplied({}); }} className={`w-full rounded-md px-3 py-2 text-start text-sm ${r.key === key ? 'bg-primary text-primary-fg' : 'hover:bg-surface-2'}`}>{r.title}</button></li>
          ))}</ul>
        </Card>
        <div className="space-y-4">
          <Card className="no-print">
            <p className="mb-3 text-sm text-muted">{rep.description}</p>
            <div className="flex flex-wrap items-end gap-3">
              {rep.filters.map((fd) => (
                <Field key={fd.key} label={fd.label}>{(id) => fd.type === 'select'
                  ? <Select id={id} value={f[fd.key] || ''} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })} options={fd.options || []} placeholder="الكل" />
                  : <Input id={id} type="date" value={f[fd.key] || ''} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })} />}</Field>
              ))}
              <Button onClick={() => setApplied({ ...f })}>عرض التقرير</Button>
              <div className="ms-auto flex flex-wrap gap-2">
                <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>طباعة / PDF</Button>
                {canExport && <>
                  <Button variant="secondary" loading={busy} disabled={!rows.length} icon={<FileSpreadsheet className="h-4 w-4" />} onClick={async () => { setBusy(true); try { await exportXlsx(file, rep.cols, rows, meta); } finally { setBusy(false); } }}>Excel</Button>
                  <Button variant="secondary" disabled={!rows.length} icon={<FileText className="h-4 w-4" />} onClick={() => exportCsv(file, rep.cols, rows, meta)}>CSV</Button>
                </>}
              </div>
            </div>
            {!canExport && <Alert tone="info" className="mt-3">التصدير يتطلب صلاحية "تصدير التقارير". يمكنك الطباعة.</Alert>}
          </Card>
          <div className="print-area card p-4">
            <div className="mb-3 border-b border-border pb-3">
              <h2 className="text-lg font-bold">{rep.title}</h2>
              <div className="text-xs text-muted">تاريخ الإعداد: {fmtDateTime(new Date().toISOString())} (توقيت الرياض) · الفلاتر: {filterText || 'بدون'} · معد التقرير: {meta.preparedBy} · عدد السجلات: <span className="num">{rows.length}</span></div>
            </div>
            {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد بيانات مطابقة" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>{rep.cols.map((c) => <th key={c.header} className="th">{c.header}</th>)}</tr></thead>
                  <tbody>{rows.slice(0, 1000).map((r, i) => <tr key={r.id || i} className="border-t border-border">{rep.cols.map((c) => <td key={c.header} className="td">{c.value(r) ?? '—'}</td>)}</tr>)}</tbody>
                </table>
                {rows.length > 1000 && <p className="mt-2 text-xs text-muted">يُعرض أول 1000 سجل على الشاشة؛ التصدير يشمل جميع السجلات ({rows.length}).</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
