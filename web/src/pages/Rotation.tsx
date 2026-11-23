import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Moon, Plus, Repeat, Sun, X, Ban } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAction, useEmployeesDir, useList, useOptions, useRpc, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { addDays, fmtDate, fmtDateTime, fmtWeekday, todayISO } from '@/lib/format';
import { DataTable, type Column, type FilterDef } from '@/components/DataTable';
import { FormModal, type FieldDef } from '@/components/EntityForm';
import { CrudTable } from '@/components/CrudTable';
import { Alert, Badge, Button, Card, cx, EmptyState, Field, IconButton, Input, Modal, PageHeader, Spinner, Tabs, Textarea } from '@/components/ui';

type Tab = 'schedule' | 'mine' | 'swaps' | 'coverage' | 'overtime' | 'transfers' | 'groups';
type Kind = 'swap' | 'coverage' | 'overtime' | 'transfer';

const shiftCls: Record<string, string> = {
  D: 'bg-warning-soft text-warning border-warning/40',
  N: 'bg-accent/10 text-accent border-accent/40',
  O: 'bg-surface-2 text-muted border-border',
};
const statusTone: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

export function ShiftLetter({ k, swapped }: { k?: string | null; swapped?: boolean }) {
  if (!k) return <span className="text-muted">—</span>;
  return (
    <span className={cx('inline-flex min-w-[2.25rem] items-center justify-center gap-0.5 rounded border px-1 py-0.5 text-xs font-semibold', shiftCls[k], swapped && 'ring-2 ring-danger/60')}
      title={label('shift_kind', k) + (swapped ? ' (بعد التبديل)' : '')}>
      {k === 'D' ? <Sun className="h-3 w-3" aria-hidden /> : k === 'N' ? <Moon className="h-3 w-3" aria-hidden /> : null}
      {k === 'O' ? 'راحة' : label('shift_kind', k)}
    </span>
  );
}
const StatusBadge = ({ v }: { v: string }) => <Badge tone={statusTone[v] || 'neutral'}>{label('rotation_status', v)}</Badge>;

function useRotationSettings() {
  const q = useList('system_settings', { pageSize: 100 });
  const row = (q.data?.rows ?? []).find((r: any) => r.key === 'rotation');
  return (row?.value ?? { pattern: 'DDNNOOOO', day_start: '06:00', night_start: '18:00', shift_hours: 12 }) as { pattern: string; day_start: string; night_start: string; shift_hours?: number };
}

export default function Rotation() {
  const auth = useAuth();
  const [sp, setSp] = useSearchParams();
  const emp = auth.me?.employee;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'schedule', label: 'جدول المجموعات' },
    ...(emp ? [{ value: 'mine' as Tab, label: 'جدولي' }] : []),
    { value: 'swaps', label: 'تبديل الورديات' },
    { value: 'coverage', label: 'طلبات التغطية' },
    { value: 'overtime', label: 'العمل الإضافي' },
    ...(auth.isManager ? [{ value: 'transfers' as Tab, label: 'نقل الموظفين' }, { value: 'groups' as Tab, label: 'المجموعات والدورة' }] : []),
  ];
  const tab = (tabs.find((t) => t.value === sp.get('tab'))?.value ?? 'schedule') as Tab;
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }); };
  return (
    <div>
      <PageHeader title="المناوبات والطلبات" icon={<Repeat className="h-6 w-6" />}
        description="دورة 12 ساعة لأربع مجموعات: يومان نهاري ثم يومان ليلي ثم أربعة أيام راحة. مع تبديل الورديات والتغطية والنقل والعمل الإضافي، وكل طلب يحتاج اعتمادًا." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'mine' && emp && <MySchedule employeeId={emp.id} />}
      {tab === 'swaps' && <SwapsTab />}
      {tab === 'coverage' && <CoverageTab />}
      {tab === 'overtime' && <OvertimeTab />}
      {tab === 'transfers' && <TransfersTab />}
      {tab === 'groups' && <GroupsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------
function ScheduleTab() {
  const [start, setStart] = useState(todayISO());
  const [day, setDay] = useState(todayISO());
  const settings = useRotationSettings();
  const end = addDays(start, 27);
  const cal = useRpc<any[]>('rotation_calendar', { from: start, to: end });
  const groups = useList('shift_groups', { pageSize: 20, sort: 'code' });
  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));
  const byKey = useMemo(() => new Map((cal.data ?? []).map((r) => [r.group_id + '|' + r.day, r])), [cal.data]);
  const gs = groups.data?.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="card no-print flex flex-wrap items-end gap-3 p-3">
        <div><label className="label text-xs" htmlFor="rc-d">من تاريخ</label><Input id="rc-d" type="date" dir="ltr" className="text-end" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} /></div>
        <Button variant="secondary" onClick={() => setStart(addDays(start, -28))}>الفترة السابقة</Button>
        <Button variant="secondary" onClick={() => setStart(addDays(start, 28))}>الفترة التالية</Button>
        <Button variant="ghost" onClick={() => { setStart(todayISO()); setDay(todayISO()); }}>اليوم</Button>
        <div className="flex-1 text-xs text-muted">
          النهاري <span className="ltr num">{settings.day_start}</span> – <span className="ltr num">{settings.night_start}</span>،
          والليلي <span className="ltr num">{settings.night_start}</span> – <span className="ltr num">{settings.day_start}</span>
        </div>
      </div>
      <div className="card overflow-x-auto">
        {cal.isLoading ? <Spinner /> : gs.length === 0 ? <EmptyState title="لا توجد مجموعات" /> : (
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-surface-2"><tr>
              <th className="th sticky start-0 bg-surface-2">المجموعة</th>
              {days.map((d) => (
                <th key={d} className={cx('th cursor-pointer text-center', d === day && 'bg-accent/10', d === todayISO() && 'underline')} onClick={() => setDay(d)} title="اضغط لعرض المناوبين">{fmtWeekday(d)}</th>
              ))}
            </tr></thead>
            <tbody>
              {gs.map((g: any) => (
                <tr key={g.id} className="border-t border-border">
                  <td className="td sticky start-0 bg-surface">
                    <div className="flex items-center gap-2 whitespace-nowrap font-semibold"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />{g.name}</div>
                    <div className="text-muted"><span className="num">{g.members_count}</span> موظف</div>
                  </td>
                  {days.map((d) => {
                    const c = byKey.get(g.id + '|' + d);
                    return <td key={d} className={cx('p-1 text-center', d === day && 'bg-accent/5')}><ShiftLetter k={c?.actual} swapped={c?.swapped} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap gap-3 border-t border-border p-3 text-xs text-muted">
          <ShiftLetter k="D" /><ShiftLetter k="N" /><ShiftLetter k="O" />
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded ring-2 ring-danger/60" /> تغيّر بسبب تبديل معتمد</span>
        </div>
      </div>
      <DutyRoster date={day} />
    </div>
  );
}

const stateLabel: Record<string, { t: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }> = {
  on_duty: { t: 'على رأس العمل', tone: 'success' },
  absent: { t: 'إجازة/غياب', tone: 'danger' },
  transferred: { t: 'منقول مؤقتًا', tone: 'info' },
  covering: { t: 'تغطية', tone: 'warning' },
};

function DutyRoster({ date }: { date: string }) {
  const q = useRpc<any[]>('duty_roster', { date });
  const rows = q.data ?? [];
  const part = (k: 'D' | 'N') => rows.filter((r) => r.shift_kind === k);
  const block = (k: 'D' | 'N') => {
    const list = part(k);
    const present = list.filter((r) => r.state !== 'absent').length;
    return (
      <Card title={<span className="inline-flex items-center gap-2">{k === 'D' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}الوردية {label('shift_kind', k)} – المجموعة {list[0]?.group_code ?? '—'} <span className="text-xs text-muted">(حاضر <span className="num">{present}</span> من <span className="num">{list.length}</span>)</span></span>} bodyClass="p-0">
        {list.length === 0 ? <EmptyState title="لا يوجد موظفون في هذه الوردية" description="اربط الموظفين بالمجموعات من ملفاتهم." /> : (
          <ul className="divide-y divide-border">{list.map((r) => (
            <li key={r.employee_id + r.state} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <span className="font-medium">{r.full_name}</span><span className="text-xs text-muted">{r.employee_number} · {r.site_name || '—'}</span>
              <span className="flex-1 text-xs text-muted">{r.note}</span>
              <Badge tone={stateLabel[r.state]?.tone}>{stateLabel[r.state]?.t ?? r.state}</Badge>
            </li>))}</ul>
        )}
      </Card>
    );
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">المناوبون يوم {fmtDate(date)}</h3>
      {q.isLoading ? <Spinner /> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{block('D')}{block('N')}</div>}
    </div>
  );
}

export function MySchedule({ employeeId }: { employeeId: string }) {
  const [start, setStart] = useState(todayISO());
  const q = useRpc<any[]>('employee_schedule', { employee_id: employeeId, from: start, to: addDays(start, 30) });
  const rows = q.data ?? [];
  const work = rows.filter((r) => r.shift_kind === 'D' || r.shift_kind === 'N').length;
  return (
    <div className="space-y-3">
      <div className="card no-print flex flex-wrap items-end gap-3 p-3">
        <div><label className="label text-xs" htmlFor="ms-d">من تاريخ</label><Input id="ms-d" type="date" dir="ltr" className="text-end" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} /></div>
        <div className="text-sm text-muted">أيام الدوام في الفترة: <b className="num text-fg">{work}</b></div>
      </div>
      {q.isLoading ? <Spinner /> : rows.every((r) => !r.group_code) ? (
        <div className="card"><EmptyState title="لم تُحدد مجموعة لهذا الموظف" description="يحدد المشرف المجموعة من ملف الموظف." /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2"><tr><th className="th">اليوم</th><th className="th">المجموعة</th><th className="th">الوردية</th><th className="th">ملاحظات</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.day} className={cx('border-t border-border', r.day === todayISO() && 'bg-accent/5')}>
                <td className="td">{fmtWeekday(r.day)}</td>
                <td className="td">{r.group_code || '—'}</td>
                <td className="td"><ShiftLetter k={r.on_leave ? null : r.shift_kind} swapped={r.swapped} />{r.on_leave && <Badge tone="danger">{r.on_leave}</Badge>}</td>
                <td className="td text-xs text-muted">{[r.covering, r.overtime_hours ? `عمل إضافي ${r.overtime_hours} ساعة` : null, r.swapped ? 'تبديل معتمد' : null].filter(Boolean).join(' · ') || ''}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Requests (shared list + decision dialog)
// ---------------------------------------------------------------------
function RequestList({ kind, resource, columns, filters, canCreate, createLabel, fields, newDefaults, title, formChildren, baseFilters, intro, extraValidate }: {
  kind: Kind; resource: string; columns: Column<any>[]; filters?: FilterDef[]; canCreate: boolean; createLabel: string; title: string;
  fields: FieldDef[]; newDefaults?: Record<string, any>; formChildren?: (v: Record<string, any>) => ReactNode; baseFilters?: Record<string, any>;
  intro?: ReactNode; extraValidate?: (v: Record<string, any>) => Record<string, string>;
}) {
  const auth = useAuth();
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<{ row: any; decision: 'approved' | 'rejected' | 'cancelled' } | null>(null);
  const [note, setNote] = useState('');
  const create = useAction((p: Record<string, any>) => api.create(resource, p), { success: 'تم إرسال الطلب للاعتماد' });
  const decide = useAction(() => api.rpc('rotation_decide', { kind, id: deciding!.row.id, decision: deciding!.decision, note: note.trim() || null }), {
    success: 'تم تحديث الطلب', onSuccess: () => { setDeciding(null); setNote(''); },
  });
  const approver = auth.can('rotation.approve');
  const myEmp = auth.me?.employee?.id;
  const ownsRow = (r: any) => r.created_by === auth.me?.user.id || [r.employee_id, r.covering_employee_id].includes(myEmp);
  const decLabel = { approved: 'اعتماد', rejected: 'رفض', cancelled: 'إلغاء' } as const;
  return (
    <div className="space-y-3">
      {intro}
      <DataTable resource={resource} defaultSort={kind === 'swap' ? '-created_at' : undefined} baseFilters={baseFilters}
        filters={[{ key: 'status', label: 'الحالة', options: options('rotation_status') }, ...(filters || [])]}
        toolbar={canCreate && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>{createLabel}</Button>}
        empty={{ title: 'لا توجد طلبات', action: canCreate ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>{createLabel}</Button> : undefined }}
        columns={[...columns,
          { key: 'status', header: 'الحالة', sortKey: 'status', render: (r: any) => <div><StatusBadge v={r.status} />{r.decision_note && <div className="mt-1 max-w-[16rem] text-xs text-muted">{r.decision_note}</div>}{r.decided_by_name && <div className="text-[11px] text-muted">{r.decided_by_name} · {fmtDateTime(r.decided_at)}</div>}</div> }]}
        rowActions={(r: any) => (
          <>
            {approver && r.status === 'pending' && !ownsRow(r) && <IconButton label="اعتماد" onClick={() => setDeciding({ row: r, decision: 'approved' })}><Check className="h-4 w-4 text-success" /></IconButton>}
            {approver && r.status === 'pending' && !ownsRow(r) && <IconButton label="رفض" onClick={() => setDeciding({ row: r, decision: 'rejected' })}><X className="h-4 w-4 text-danger" /></IconButton>}
            {((r.status === 'pending' && (ownsRow(r) || approver)) || (r.status === 'approved' && approver)) && !r.applied_at &&
              <IconButton label="إلغاء الطلب" onClick={() => setDeciding({ row: r, decision: 'cancelled' })}><Ban className="h-4 w-4" /></IconButton>}
          </>
        )} />
      <FormModal open={creating} onClose={() => setCreating(false)} title={`${createLabel} – ${title}`} fields={fields} initial={newDefaults}
        submitLabel="إرسال للاعتماد" onSubmit={(p) => create.mutateAsync(p)} extraValidate={extraValidate} size="lg">
        {formChildren}
      </FormModal>
      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={deciding ? `${decLabel[deciding.decision]} ${title}` : ''} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setDeciding(null)}>تراجع</Button>
          <Button variant={deciding?.decision === 'approved' ? 'primary' : 'danger'} loading={decide.isPending} onClick={() => decide.mutate()}>{deciding ? decLabel[deciding.decision] : ''}</Button>
        </>}>
        <Field label={deciding?.decision === 'rejected' ? 'سبب الرفض' : 'ملاحظة (اختيارية)'} required={deciding?.decision === 'rejected'}>
          {(id) => <Textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {deciding?.decision === 'approved' && kind === 'coverage' && deciding.row.method === 'overtime' && <Alert tone="info" className="mt-3">سيُسجل العمل الإضافي تلقائيًا للموظف المغطي.</Alert>}
      </Modal>
    </div>
  );
}

const useGroups = () => useOptions('shift_groups', { label: (r) => r.name, sort: 'code' });

/** Preview of the groups' shifts on the chosen dates (inside the swap form). */
function SwapPreview({ v }: { v: Record<string, any> }) {
  const from = [v.a_start, v.b_start].filter(Boolean).sort()[0];
  const to = [v.a_end, v.b_end, v.a_start, v.b_start].filter(Boolean).sort().reverse()[0];
  const ok = !!from && !!to && v.group_a_id && v.group_b_id && to >= from;
  const q = useRpc<any[]>('rotation_calendar', { from, to }, !!ok);
  if (!ok) return null;
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 20; d = addDays(d, 1)) days.push(d);
  const get = (g: string, d: string) => (q.data ?? []).find((r) => r.group_id === g && r.day === d);
  return (
    <div className="mt-4 overflow-x-auto rounded border border-border p-2">
      <div className="mb-2 text-xs text-muted">الجدول الحالي للمجموعتين في الأيام المختارة:</div>
      <table className="text-xs"><thead><tr><th className="th" />{days.map((d) => <th key={d} className="th text-center">{fmtWeekday(d)}</th>)}</tr></thead>
        <tbody>{[v.group_a_id, v.group_b_id].map((g: string) => (
          <tr key={g}><td className="td font-semibold">{get(g, days[0])?.group_code}</td>{days.map((d) => <td key={d} className="p-1 text-center"><ShiftLetter k={get(g, d)?.actual} swapped={get(g, d)?.swapped} /></td>)}</tr>
        ))}</tbody></table>
    </div>
  );
}

function SwapsTab() {
  const auth = useAuth();
  const groups = useGroups();
  return (
    <RequestList kind="swap" resource="shift_swaps" title="تبديل ورديات" createLabel="طلب تبديل" canCreate={!auth.isReportOnly}
      intro={<Alert tone="info">التبديل يكون باتفاق المجموعتين، وغالبًا يومين (ليلتين أو نهارين). «أيام المجموعة الأولى» تعمل فيها المجموعة الثانية بدلًا عنها، و«أيام الرد» تعمل فيها المجموعة الأولى بدل الثانية.</Alert>}
      filters={[{ key: 'group_a_id', label: 'المجموعة الطالبة', options: groups.options }, { key: 'a_start__gte', label: 'من تاريخ', type: 'date' }]}
      columns={[
        { key: 'groups', header: 'المجموعتان', mobile: 'title', render: (r: any) => <span className="font-semibold">{r.group_a_code} ⇄ {r.group_b_code}</span> },
        { key: 'a_start', header: `أيام المجموعة الأولى`, sortKey: 'a_start', render: (r: any) => <span>{fmtDate(r.a_start)}{r.a_days > 1 && <> – {fmtDate(r.a_end)}</>} <span className="text-xs text-muted num">({r.a_days} يوم)</span></span> },
        { key: 'b_start', header: 'أيام الرد', render: (r: any) => r.b_start ? <span>{fmtDate(r.b_start)}{r.b_days > 1 && <> – {fmtDate(r.b_end)}</>} <span className="text-xs text-muted num">({r.b_days} يوم)</span></span> : '—' },
        { key: 'reason', header: 'السبب', render: (r: any) => <span className="text-sm">{r.reason || '—'}</span> },
        { key: 'created_by_name', header: 'مقدم الطلب', render: (r: any) => <span className="text-xs">{r.created_by_name}<div className="text-muted">{fmtDate(r.created_at)}</div></span> },
      ]}
      fields={[
        { name: 'group_a_id', label: 'المجموعة الأولى (الطالبة)', type: 'select', required: true, options: groups.options },
        { name: 'group_b_id', label: 'المجموعة الثانية', type: 'select', required: true, options: groups.options },
        { name: 'a_start', label: 'أيام المجموعة الأولى: من', type: 'date', required: true },
        { name: 'a_end', label: 'إلى', type: 'date', required: true },
        { name: 'b_start', label: 'أيام الرد (اختياري): من', type: 'date' },
        { name: 'b_end', label: 'إلى', type: 'date' },
        { name: 'reason', label: 'السبب', type: 'textarea', wide: true },
      ]}
      extraValidate={(v) => {
        const e: Record<string, string> = {};
        if (v.group_a_id && v.group_a_id === v.group_b_id) e.group_b_id = 'اختر مجموعة مختلفة';
        if (v.a_start && v.a_end && v.a_end < v.a_start) e.a_end = 'تاريخ النهاية قبل البداية';
        if (!!v.b_start !== !!v.b_end) e.b_end = 'أدخل بداية ونهاية أيام الرد';
        if (v.b_start && v.b_end && v.b_end < v.b_start) e.b_end = 'تاريخ النهاية قبل البداية';
        return e;
      }}
      formChildren={(v) => <SwapPreview v={v} />} />
  );
}

function CoverageTab() {
  const auth = useAuth();
  const emps = useEmployeesDir();
  const sites = useSites();
  const myEmp = auth.me?.employee?.id;
  return (
    <RequestList kind="coverage" resource="coverage_requests" title="تغطية" createLabel="طلب تغطية" canCreate={!auth.isReportOnly && (auth.isManager || !!myEmp)}
      intro={<Alert tone="info">التغطية إما <b>عمل إضافي</b> (يُسجل تلقائيًا في سجل العمل الإضافي عند الاعتماد) أو <b>تعويض أيام</b> (يُضاف للموظف رصيد أيام يأخذها لاحقًا بإجازة «تعويض أيام»).</Alert>}
      filters={[{ key: 'method', label: 'طريقة التغطية', options: options('coverage_method') }, { key: 'site_id', label: 'الموقع', options: sites.options },
        { key: 'work_date__gte', label: 'من تاريخ', type: 'date' }, { key: 'work_date__lte', label: 'إلى تاريخ', type: 'date' }]}
      columns={[
        { key: 'covering_name', header: 'الموظف المغطي', sortKey: 'covering_name', mobile: 'title', render: (r: any) => <div><div className="font-medium">{r.covering_name}</div><div className="text-xs text-muted">{r.covering_number}</div></div> },
        { key: 'work_date', header: 'اليوم والوردية', sortKey: 'work_date', render: (r: any) => <span className="inline-flex items-center gap-1">{fmtDate(r.work_date)} <ShiftLetter k={r.shift_kind} />{r.group_code && <span className="text-xs text-muted">({r.group_code})</span>}</span> },
        { key: 'absent_name', header: 'بدل', render: (r: any) => r.absent_name || '—' },
        { key: 'method', header: 'الطريقة', render: (r: any) => <div>{label('coverage_method', r.method)}<div className="text-xs text-muted">{r.method === 'overtime' ? `${r.hours} ساعة` : `${r.comp_days} يوم${r.comp_date ? ' · ' + fmtDate(r.comp_date) : ''}`}</div></div> },
        { key: 'reason', header: 'السبب', render: (r: any) => <span className="text-sm">{r.reason}</span> },
      ]}
      newDefaults={{ work_date: todayISO(), shift_kind: 'D', method: 'overtime', hours: 12, comp_days: 1, covering_employee_id: auth.isManager ? '' : myEmp }}
      fields={[
        { name: 'work_date', label: 'يوم التغطية', type: 'date', required: true },
        { name: 'shift_kind', label: 'الوردية', type: 'select', required: true, options: [{ value: 'D', label: 'نهاري' }, { value: 'N', label: 'ليلي' }] },
        { name: 'covering_employee_id', label: 'الموظف المغطي', type: 'select', required: true, options: emps.options },
        { name: 'absent_employee_id', label: 'بدل الموظف (اختياري)', type: 'select', options: emps.options },
        { name: 'method', label: 'طريقة التغطية', type: 'select', required: true, options: options('coverage_method') },
        { name: 'hours', label: 'عدد الساعات', type: 'number', required: true, min: 1, max: 24, show: (v) => v.method === 'overtime' },
        { name: 'comp_days', label: 'أيام التعويض المستحقة', type: 'number', required: true, min: 0.5, max: 5, show: (v) => v.method === 'day_compensation' },
        { name: 'comp_date', label: 'موعد يوم التعويض (اختياري)', type: 'date', show: (v) => v.method === 'day_compensation' },
        { name: 'site_id', label: 'الموقع', type: 'select', options: sites.options, placeholder: 'موقع الموظف الغائب' },
        { name: 'reason', label: 'سبب التغطية', type: 'textarea', required: true, wide: true },
      ]}
      extraValidate={(v) => (v.absent_employee_id && v.absent_employee_id === v.covering_employee_id ? { absent_employee_id: 'لا يمكن أن يغطي الموظف نفسه' } : {}) as Record<string, string>} />
  );
}

function OvertimeTab() {
  const auth = useAuth();
  const emps = useEmployeesDir();
  const sites = useSites();
  const myEmp = auth.me?.employee?.id;
  const [range, setRange] = useState({ from: addDays(todayISO(), -30), to: todayISO() });
  const totals = useList('overtime_entries', { pageSize: 1000, filters: { status: 'approved', work_date__gte: range.from, work_date__lte: range.to } });
  const sum = (rows: any[]) => rows.reduce((a, r) => a + Number(r.hours || 0), 0);
  const all = totals.data?.rows ?? [];
  const byCause = options('overtime_cause').map((o) => ({ ...o, hours: sum(all.filter((r: any) => r.cause === o.value)) })).filter((x) => x.hours > 0);
  return (
    <RequestList kind="overtime" resource="overtime_entries" title="عمل إضافي" createLabel="تسجيل عمل إضافي" canCreate={!auth.isReportOnly && (auth.isManager || !!myEmp)}
      intro={
        <Card title="ملخص العمل الإضافي المعتمد">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div><label className="label text-xs" htmlFor="ot-f">من</label><Input id="ot-f" type="date" dir="ltr" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
            <div><label className="label text-xs" htmlFor="ot-t">إلى</label><Input id="ot-t" type="date" dir="ltr" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
            <div className="text-sm">الإجمالي: <b className="num">{sum(all)}</b> ساعة في <b className="num">{all.length}</b> سجل</div>
          </div>
          <div className="flex flex-wrap gap-2">{byCause.length === 0 ? <span className="text-sm text-muted">لا يوجد عمل إضافي معتمد في الفترة</span> : byCause.map((c) => (
            <span key={c.value} className="rounded border border-border bg-surface-2 px-2 py-1 text-sm">{c.label}: <b className="num">{c.hours}</b> ساعة</span>))}</div>
        </Card>}
      filters={[{ key: 'cause', label: 'السبب', options: options('overtime_cause') }, { key: 'site_id', label: 'الموقع', options: sites.options },
        { key: 'work_date__gte', label: 'من تاريخ', type: 'date' }, { key: 'work_date__lte', label: 'إلى تاريخ', type: 'date' }]}
      columns={[
        { key: 'employee_name', header: 'الموظف', sortKey: 'employee_name', mobile: 'title', render: (r: any) => <div><div className="font-medium">{r.employee_name}</div><div className="text-xs text-muted">{r.employee_number}</div></div> },
        { key: 'work_date', header: 'التاريخ', sortKey: 'work_date', render: (r: any) => fmtDate(r.work_date) },
        { key: 'hours', header: 'الساعات', sortKey: 'hours', render: (r: any) => <span className="num font-semibold">{r.hours}</span> },
        { key: 'cause', header: 'السبب', render: (r: any) => <Badge tone={r.cause === 'breakdown' || r.cause === 'pipe_burst' ? 'danger' : 'neutral'}>{label('overtime_cause', r.cause)}</Badge> },
        { key: 'description', header: 'الوصف', render: (r: any) => <div className="max-w-[20rem] text-sm">{r.description || '—'}{r.reference_no && <div className="text-xs text-muted">مرجع: {r.reference_no}</div>}{r.site_name && <div className="text-xs text-muted">{r.site_name}</div>}</div> },
      ]}
      newDefaults={{ work_date: todayISO(), hours: 4, cause: 'breakdown', employee_id: auth.isManager ? '' : myEmp }}
      fields={[
        { name: 'employee_id', label: 'الموظف', type: 'select', required: true, options: emps.options },
        { name: 'work_date', label: 'التاريخ', type: 'date', required: true },
        { name: 'hours', label: 'عدد الساعات', type: 'number', required: true, min: 0.5, max: 24 },
        { name: 'cause', label: 'السبب', type: 'select', required: true, options: options('overtime_cause').filter((o) => o.value !== 'coverage') },
        { name: 'site_id', label: 'الموقع', type: 'select', options: sites.options },
        { name: 'reference_no', label: 'رقم البلاغ / أمر العمل (اختياري)' },
        { name: 'description', label: 'وصف العمل (العطل أو الانكسار وما تم)', type: 'textarea', required: true, wide: true },
      ]} />
  );
}

function TransfersTab() {
  const auth = useAuth();
  const emps = useEmployeesDir();
  const groups = useGroups();
  return (
    <RequestList kind="transfer" resource="group_transfers" title="نقل موظف" createLabel="طلب نقل" canCreate={auth.can('shifts.manage')}
      intro={<Alert tone="info">النقل الدائم يغيّر مجموعة الموظف من تاريخ البداية. النقل المؤقت يعيده لمجموعته تلقائيًا بعد تاريخ النهاية.</Alert>}
      filters={[{ key: 'kind', label: 'النوع', options: options('transfer_kind') }, { key: 'to_group_id', label: 'إلى مجموعة', options: groups.options }]}
      columns={[
        { key: 'employee_name', header: 'الموظف', sortKey: 'employee_name', mobile: 'title', render: (r: any) => <div><div className="font-medium">{r.employee_name}</div><div className="text-xs text-muted">{r.employee_number}</div></div> },
        { key: 'groups', header: 'من ← إلى', render: (r: any) => <span className="font-semibold">{r.from_group_code || '—'} ← {r.to_group_code}</span> },
        { key: 'kind', header: 'النوع', render: (r: any) => <Badge tone={r.kind === 'permanent' ? 'info' : 'neutral'}>{label('transfer_kind', r.kind)}</Badge> },
        { key: 'start_date', header: 'الفترة', sortKey: 'start_date', render: (r: any) => <span>{fmtDate(r.start_date)}{r.end_date ? ` – ${fmtDate(r.end_date)}` : ' فصاعدًا'}{r.applied_at && <div className="text-xs text-success">طُبق</div>}</span> },
        { key: 'reason', header: 'السبب', render: (r: any) => <span className="text-sm">{r.reason}</span> },
      ]}
      newDefaults={{ kind: 'temporary', start_date: todayISO() }}
      fields={[
        { name: 'employee_id', label: 'الموظف', type: 'select', required: true, options: emps.options },
        { name: 'to_group_id', label: 'إلى المجموعة', type: 'select', required: true, options: groups.options },
        { name: 'kind', label: 'نوع النقل', type: 'select', required: true, options: options('transfer_kind') },
        { name: 'start_date', label: 'من تاريخ', type: 'date', required: true },
        { name: 'end_date', label: 'إلى تاريخ', type: 'date', required: true, show: (v) => v.kind === 'temporary' },
        { name: 'reason', label: 'سبب النقل', type: 'textarea', required: true, wide: true },
      ]}
      extraValidate={(v) => (v.kind === 'temporary' && v.end_date && v.start_date && v.end_date < v.start_date ? { end_date: 'تاريخ النهاية قبل البداية' } : {}) as Record<string, string>} />
  );
}

function GroupsTab() {
  const auth = useAuth();
  const canWrite = auth.can('settings.manage') || (auth.can('shifts.manage') && auth.hasRole('system_admin', 'operations_manager'));
  const s = useRotationSettings();
  const [v, setV] = useState<{ day_start?: string; night_start?: string }>({});
  const save = useAction(() => api.put('/api/settings', { rotation: { ...s, day_start: v.day_start ?? s.day_start, night_start: v.night_start ?? s.night_start } }), { success: 'تم حفظ أوقات الورديات' });
  return (
    <div className="space-y-3">
      <Card title="أوقات الوردية (12 ساعة)">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label text-xs" htmlFor="rs-d">بداية النهاري</label><Input id="rs-d" type="time" dir="ltr" value={v.day_start ?? s.day_start} disabled={!auth.can('settings.manage')} onChange={(e) => setV({ ...v, day_start: e.target.value })} /></div>
          <div><label className="label text-xs" htmlFor="rs-n">بداية الليلي</label><Input id="rs-n" type="time" dir="ltr" value={v.night_start ?? s.night_start} disabled={!auth.can('settings.manage')} onChange={(e) => setV({ ...v, night_start: e.target.value })} /></div>
          {auth.can('settings.manage') && <Button onClick={() => save.mutate()} loading={save.isPending}>حفظ</Button>}
          <div className="text-xs text-muted">الدورة: يومان نهاري، يومان ليلي، أربعة أيام راحة (8 أيام).</div>
        </div>
      </Card>
      <Alert tone="info">«بداية الدورة» هي أول يوم نهاري للمجموعة. عدّلها لتطابق الجدول الفعلي، وسيُحدَّث الجدول لكل الأيام تلقائيًا. تُربط الموظفين بالمجموعة من ملف الموظف.</Alert>
      <CrudTable resource="shift_groups" title="مجموعة" createLabel="إضافة مجموعة" archiveNoun="المجموعة" canWrite={canWrite} defaultSort="code"
        columns={[
          { key: 'name', header: 'المجموعة', sortKey: 'code', mobile: 'title', render: (r: any) => <span className="inline-flex items-center gap-2 font-medium"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} aria-hidden />{r.name} <span className="text-xs text-muted">({r.code})</span></span> },
          { key: 'cycle_start_date', header: 'بداية الدورة', render: (r: any) => fmtDate(r.cycle_start_date) },
          { key: 'today', header: 'اليوم', render: (r: any) => <ShiftLetter k={r.today} /> },
          { key: 'members_count', header: 'الموظفون', render: (r: any) => <span className="num">{r.members_count}</span> },
          { key: 'notes', header: 'ملاحظات' },
        ]}
        fields={[
          { name: 'code', label: 'الرمز', required: true, hint: 'مثل A' },
          { name: 'name', label: 'الاسم', required: true },
          { name: 'color', label: 'اللون', type: 'color' },
          { name: 'cycle_start_date', label: 'بداية الدورة (أول يوم نهاري)', type: 'date', required: true },
          { name: 'notes', label: 'ملاحظات', type: 'textarea' },
        ]}
        newDefaults={{ color: '#0e7490', cycle_start_date: todayISO() }} />
    </div>
  );
}
