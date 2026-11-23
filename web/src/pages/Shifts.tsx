import { useState } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useList, useOptions, useRpc, useSites } from '@/lib/hooks';
import { label } from '@/lib/i18n';
import { addDays, fmtDate, fmtTime, fmtWeekday, todayISO } from '@/lib/format';
import { CrudTable } from '@/components/CrudTable';
import { Alert, Badge, Card, cx, EmptyState, Input, PageHeader, Select, Spinner, Tabs } from '@/components/ui';

type Tab = 'coverage' | 'week' | 'shifts' | 'rules' | 'assign' | 'mine';
const covCls: Record<string, string> = { below: 'bg-danger-soft text-danger border-danger/40', at_min: 'bg-warning-soft text-warning border-warning/40', ok: 'bg-success-soft text-success border-success/40', no_rule: 'bg-surface-2 text-muted border-border' };
const covLabel: Record<string, string> = { below: 'أقل من الحد الأدنى', at_min: 'عند الحد الأدنى', ok: 'جيدة', no_rule: 'بدون قاعدة' };

export default function Shifts() {
  const auth = useAuth();
  const manager = auth.isManager;
  const [tab, setTab] = useState<Tab>(manager ? 'coverage' : 'mine');
  const tabs: { value: Tab; label: string }[] = manager
    ? [{ value: 'coverage', label: 'التغطية اليومية' }, { value: 'week', label: 'تغطية الأسبوع' }, { value: 'shifts', label: 'الورديات' }, { value: 'rules', label: 'الحد الأدنى للتغطية' }, { value: 'assign', label: 'إسناد الموظفين' }]
    : [{ value: 'mine', label: 'وردياتي' }];
  if (manager && auth.me?.employee) tabs.push({ value: 'mine', label: 'وردياتي' });
  return (
    <div>
      <PageHeader title="الورديات والتغطية" icon={<CalendarClock className="h-6 w-6" />}
        description="ضبط الورديات لكل موقع وأوقاتها وأيام العمل، وربط الموظفين بالموقع والوردية، ومتابعة التغطية مقابل الحد الأدنى." />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'coverage' && <CoverageDay />}
      {tab === 'week' && <CoverageWeek />}
      {tab === 'shifts' && <ShiftsTab />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'assign' && <AssignTab />}
      {tab === 'mine' && <MyShifts />}
    </div>
  );
}

function CoverageDay() {
  const [date, setDate] = useState(todayISO());
  const [site, setSite] = useState('');
  const sites = useSites();
  const q = useRpc<any[]>('coverage_overview', { date, site_id: site || null });
  const rows = q.data ?? [];
  const below = rows.filter((r) => r.status === 'below').length;
  return (
    <div className="space-y-3">
      <div className="card no-print grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div><label className="label text-xs" htmlFor="cv-d">التاريخ</label><Input id="cv-d" type="date" dir="ltr" className="text-end" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label text-xs" htmlFor="cv-s">الموقع</label><Select id="cv-s" value={site} onChange={(e) => setSite(e.target.value)} options={sites.options} placeholder="كل المواقع" /></div>
      </div>
      {below > 0 && <Alert tone="danger" title="تحذير تغطية"><AlertTriangle className="me-1 inline h-4 w-4" />{below} وردية أقل من الحد الأدنى في {fmtDate(date)}. راجع الإجازات المعتمدة أو أسند موظفين إضافيين.</Alert>}
      {q.isLoading ? <Spinner /> : rows.length === 0 ? <div className="card"><EmptyState title="لا توجد ورديات تعمل في هذا اليوم" description="تأكد من ضبط الورديات وأيام العمل لكل موقع." /></div> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.site_id + r.shift_id} className={cx('rounded-lg border p-3', covCls[r.status])}>
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-semibold text-fg">{r.site_name}</div><div className="text-sm text-muted">{r.shift_name} · <span className="ltr">{fmtTime(r.start_time)}–{fmtTime(r.end_time)}</span></div></div>
                <Badge tone={r.status === 'below' ? 'danger' : r.status === 'at_min' ? 'warning' : r.status === 'ok' ? 'success' : 'neutral'}>{covLabel[r.status]}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center text-fg">
                <div><div className="num text-lg font-bold">{r.assigned}</div><div className="text-[11px] text-muted">مسند</div></div>
                <div><div className="num text-lg font-bold">{r.absent}</div><div className="text-[11px] text-muted">غياب/إجازة</div></div>
                <div><div className="num text-lg font-bold">{r.available}</div><div className="text-[11px] text-muted">متاح</div></div>
                <div><div className="num text-lg font-bold">{r.min_staff || '—'}</div><div className="text-[11px] text-muted">الحد الأدنى</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Calendar view: coverage + leaves for 14 days, per site/shift. */
function CoverageWeek() {
  const [start, setStart] = useState(todayISO());
  const [site, setSite] = useState('');
  const sites = useSites();
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const results = days.map((d) => useRpc<any[]>('coverage_overview', { date: d, site_id: site || null })); // eslint-disable-line react-hooks/rules-of-hooks
  const leaves = useList('leave_requests', { filters: { status: 'approved,recommended,pending_review', start_date__lte: days[13], end_date__gte: days[0], ...(site ? { site_id: site } : {}) } as any, pageSize: 200 });
  const keys = new Map<string, { site: string; shift: string; start: string }>();
  results.forEach((r) => (r.data ?? []).forEach((x: any) => keys.set(x.site_id + '|' + x.shift_id, { site: x.site_name, shift: x.shift_name, start: x.start_time })));
  const rows = [...keys.entries()].sort((a, b) => (a[1].site + a[1].start).localeCompare(b[1].site + b[1].start));
  return (
    <div className="space-y-3">
      <div className="card no-print grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div><label className="label text-xs" htmlFor="wk-d">من تاريخ</label><Input id="wk-d" type="date" dir="ltr" className="text-end" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label className="label text-xs" htmlFor="wk-s">الموقع</label><Select id="wk-s" value={site} onChange={(e) => setSite(e.target.value)} options={sites.options} placeholder="كل المواقع" /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-surface-2"><tr><th className="th sticky start-0 bg-surface-2">الموقع / الوردية</th>{days.map((d) => <th key={d} className="th text-center">{fmtWeekday(d)}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={15}><EmptyState title="لا توجد بيانات" /></td></tr>}
            {rows.map(([k, v]) => (
              <tr key={k} className="border-t border-border">
                <td className="td sticky start-0 bg-surface"><div className="font-medium">{v.site}</div><div className="text-muted">{v.shift}</div></td>
                {days.map((d, i) => {
                  const c = (results[i].data ?? []).find((x: any) => x.site_id + '|' + x.shift_id === k);
                  if (!c) return <td key={d} className="td text-center text-muted">—</td>;
                  return <td key={d} className="p-1 text-center"><div className={cx('num rounded border px-1 py-1 font-semibold', covCls[c.status])} title={`${covLabel[c.status]}: متاح ${c.available} من ${c.assigned}، الحد الأدنى ${c.min_staff}`}>{c.available}/{c.min_staff || '–'}</div></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-3 border-t border-border p-3 text-xs text-muted">
          <span>الخلية: المتاح / الحد الأدنى</span>
          {Object.entries(covLabel).map(([k, l]) => <span key={k} className={cx('rounded border px-2', covCls[k])}>{l}</span>)}
        </div>
      </div>
      <Card title="الإجازات والغياب في الفترة" bodyClass="p-0">
        {(leaves.data?.rows ?? []).length === 0 ? <EmptyState title="لا توجد إجازات في هذه الفترة" /> : (
          <ul className="divide-y divide-border">{leaves.data!.rows.map((l: any) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <span className="font-medium">{l.employee_name}</span><span className="text-muted">{l.site_name} · {l.shift_name}</span>
              <span className="flex-1 text-muted">{fmtDate(l.start_date)} – {fmtDate(l.end_date)}</span>
              <Badge tone={l.status === 'approved' ? 'success' : 'warning'}>{label('leave_status', l.status)}</Badge></li>))}</ul>
        )}
      </Card>
    </div>
  );
}

function ShiftsTab() {
  const auth = useAuth();
  const sites = useSites();
  return (
    <CrudTable resource="shifts" title="وردية" createLabel="إضافة وردية" archiveNoun="الوردية" canWrite={auth.can('shifts.manage')} defaultSort="site_name"
      columns={[
        { key: 'name', header: 'الوردية', sortKey: 'name', mobile: 'title', render: (r: any) => <span className="inline-flex items-center gap-2 font-medium"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} aria-hidden />{r.name}</span> },
        { key: 'code', header: 'الرمز' },
        { key: 'site_name', header: 'الموقع', sortKey: 'site_name', render: (r: any) => r.site_name || 'عامة' },
        { key: 'time', header: 'الوقت', render: (r: any) => <span className="ltr num">{fmtTime(r.start_time)} – {fmtTime(r.end_time)}</span> },
        { key: 'work_days', header: 'أيام العمل', render: (r: any) => (r.work_days?.length === 7 ? 'كل الأيام' : r.work_days?.map((d: number) => label('weekday', d)).join('، ')) },
        { key: 'employees_count', header: 'الموظفون', render: (r: any) => <span className="num">{r.employees_count}</span> },
      ]}
      filters={[{ key: 'site_id', label: 'الموقع', options: sites.options }]}
      newDefaults={{ work_days: [0, 1, 2, 3, 4, 5, 6], color: '#0e7490' }}
      fields={[
        { name: 'name', label: 'اسم الوردية', required: true },
        { name: 'code', label: 'الرمز', required: true, hint: 'مثل A أو D12 – يُستخدم في الاستيراد' },
        { name: 'site_id', label: 'الموقع', type: 'select', options: sites.options, placeholder: 'عامة لكل المواقع', hint: 'لكل موقع وردياته الخاصة وعددها' },
        { name: 'color', label: 'اللون', type: 'color' },
        { name: 'start_time', label: 'وقت البداية', type: 'time', required: true },
        { name: 'end_time', label: 'وقت النهاية', type: 'time', required: true },
        { name: 'work_days', label: 'أيام العمل', type: 'weekdays', required: true },
      ]} />
  );
}

function RulesTab() {
  const auth = useAuth();
  const sites = useSites();
  const shifts = useOptions('shifts', { label: (r) => `${r.name} – ${r.site_name || 'عامة'}`, sort: 'site_name' });
  const skills = useOptions('skills', { filters: { is_core: true }, sort: 'domain_order' });
  return (
    <CrudTable resource="coverage_rules" title="قاعدة تغطية" createLabel="إضافة قاعدة" archiveNoun="القاعدة" canWrite={auth.can('shifts.manage')} defaultSort="site_name"
      columns={[
        { key: 'site_name', header: 'الموقع', sortKey: 'site_name', mobile: 'title' },
        { key: 'shift_name', header: 'الوردية', sortKey: 'shift_name' },
        { key: 'min_staff', header: 'الحد الأدنى', sortKey: 'min_staff', render: (r: any) => <span className="num font-semibold">{r.min_staff}</span> },
        { key: 'required_skill_ids', header: 'مهارات أساسية مطلوبة', render: (r: any) => (r.required_skill_ids?.length ? `${r.required_skill_ids.length} مهارة` : '—') },
        { key: 'notes', header: 'ملاحظات' },
      ]}
      filters={[{ key: 'site_id', label: 'الموقع', options: sites.options }]}
      fields={[
        { name: 'site_id', label: 'الموقع', type: 'select', required: true, options: sites.options },
        { name: 'shift_id', label: 'الوردية', type: 'select', required: true, options: shifts.options },
        { name: 'min_staff', label: 'الحد الأدنى لعدد الموظفين', type: 'number', required: true, min: 0, max: 200 },
        { name: 'required_skill_ids', label: 'مهارات أساسية يجب توفرها في الوردية', type: 'multiselect', options: skills.options },
        { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      ]} />
  );
}

function AssignTab() {
  const auth = useAuth();
  const sites = useSites();
  const shifts = useOptions('shifts', { label: (r) => `${r.name} – ${r.site_name || 'عامة'}`, sort: 'site_name' });
  const lines = useOptions('lines', { label: (r) => `${r.name} – ${r.site_name}` });
  const emps = useOptions('employee_directory', { label: (r) => `${r.full_name} – ${r.employee_number}`, sort: 'full_name' });
  return (
    <>
      <Alert tone="info" className="mb-3">الإسناد المؤقت أو الدوري يتقدم على الوردية الافتراضية في ملف الموظف خلال فترته. بدون إسناد، تُحتسب الوردية الافتراضية.</Alert>
      <CrudTable resource="shift_assignments" title="إسناد" createLabel="إسناد موظف لوردية" archiveNoun="الإسناد" canWrite={auth.can('shifts.manage')} defaultSort="-start_date"
        columns={[
          { key: 'employee_name', header: 'الموظف', sortKey: 'employee_name', mobile: 'title' },
          { key: 'site_name', header: 'الموقع', sortKey: 'site_name' },
          { key: 'shift_name', header: 'الوردية' },
          { key: 'line_name', header: 'الخط' },
          { key: 'period', header: 'الفترة', render: (r: any) => `${fmtDate(r.start_date)} – ${r.end_date ? fmtDate(r.end_date) : 'مفتوحة'}` },
        ]}
        filters={[{ key: 'site_id', label: 'الموقع', options: sites.options }, { key: 'shift_id', label: 'الوردية', options: shifts.options }]}
        newDefaults={{ start_date: todayISO() }}
        fields={[
          { name: 'employee_id', label: 'الموظف', type: 'select', required: true, options: emps.options },
          { name: 'site_id', label: 'الموقع', type: 'select', required: true, options: sites.options },
          { name: 'shift_id', label: 'الوردية', type: 'select', required: true, options: shifts.options },
          { name: 'line_id', label: 'الخط', type: 'select', options: lines.options },
          { name: 'start_date', label: 'من تاريخ', type: 'date', required: true },
          { name: 'end_date', label: 'إلى تاريخ (اختياري)', type: 'date' },
          { name: 'notes', label: 'ملاحظات', type: 'textarea' },
        ]} />
    </>
  );
}

function MyShifts() {
  const auth = useAuth();
  const emp = auth.me?.employee;
  const q = useList('shift_assignments', { filters: { employee_id: emp?.id }, pageSize: 50 }, !!emp);
  if (!emp) return <div className="card"><EmptyState title="حسابك غير مرتبط بملف موظف" /></div>;
  return (
    <div className="space-y-3">
      <Card title="ورديتي الافتراضية">
        <div className="text-sm"><b>{emp.site_name || '—'}</b> · {emp.shift_name || 'لم تُحدد وردية'}</div>
      </Card>
      <Card title="الإسنادات" bodyClass="p-0">
        {(q.data?.rows ?? []).length === 0 ? <EmptyState title="لا توجد إسنادات إضافية" /> : (
          <ul className="divide-y divide-border">{q.data!.rows.map((a: any) => (
            <li key={a.id} className="px-4 py-2.5 text-sm"><b>{a.site_name}</b> · {a.shift_name}{a.line_name ? ` · ${a.line_name}` : ''}
              <div className="text-xs text-muted">{fmtDate(a.start_date)} – {a.end_date ? fmtDate(a.end_date) : 'مفتوحة'}</div></li>))}</ul>
        )}
      </Card>
    </div>
  );
}
