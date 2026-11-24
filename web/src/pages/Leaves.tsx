import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useEmployeesDir, useList, useOne, useOptions, useRpc, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { addDays, daysBetween, fmtDate, fmtDateTime, todayISO } from '@/lib/format';
import { DataTable } from '@/components/DataTable';
import { FormModal } from '@/components/EntityForm';
import { ConfirmDialog, cx, EmptyState } from '@/components/ui';
import { exportXlsx } from '@/lib/export';
import { Alert, Badge, Button, Card, DemoBadge, Field, IconButton, Input, KV, Modal, PageHeader, Select, Spinner, Tabs, Textarea } from '@/components/ui';
import { LeaveStatus } from '@/components/StatusBadges';
import { Attachments } from '@/components/Attachments';

type Impact = { site_name?: string; shift_name?: string; min_staff: number; worst_available: number | null; worst_day: string | null; below_min: boolean; no_backup: boolean;
  skills_at_risk: { skill_id: string; skill_name: string; is_core: boolean; criticality: string; others_available: number }[] };

export function ImpactPanel({ impact, loading }: { impact?: Impact | null; loading?: boolean }) {
  if (loading) return <Spinner label="جارٍ حساب أثر الإجازة على التغطية…" />;
  if (!impact) return null;
  const risky = impact.below_min || impact.no_backup;
  return (
    <Alert tone={risky ? 'danger' : impact.skills_at_risk.length ? 'warning' : 'success'} title={risky ? 'تحذير: أثر على التغطية' : 'أثر الإجازة على التغطية'}>
      <ul className="space-y-0.5 text-sm">
        <li>الموقع/الوردية: {impact.site_name || '—'} {impact.shift_name ? `· ${impact.shift_name}` : ''}</li>
        <li>الحد الأدنى المطلوب: <b className="num">{impact.min_staff || 'لا توجد قاعدة'}</b> · أقل عدد متاح خلال الفترة: <b className="num">{impact.worst_available ?? '—'}</b>{impact.worst_day ? ` (يوم ${fmtDate(impact.worst_day)})` : ''}</li>
        {impact.below_min && <li className="font-semibold">ستنخفض التغطية عن الحد الأدنى.</li>}
        {impact.skills_at_risk.map((s) => (
          <li key={s.skill_id}>مهارة {s.is_core ? 'أساسية' : label('skill_criticality', s.criticality)}: {s.skill_name} — بدلاء مؤهلون متاحون: <b className="num">{s.others_available}</b>{s.others_available === 0 && ' (لا يوجد بديل)'}</li>
        ))}
        {!risky && impact.skills_at_risk.length === 0 && <li>لا يوجد أثر يتجاوز الحد الأدنى أو يترك مهارة أساسية بلا بديل.</li>}
      </ul>
      <p className="mt-1 text-xs opacity-80">هذا تحليل مساعد فقط. القرار النهائي بشري ويُسجل باسم متخذه.</p>
    </Alert>
  );
}

function NewLeaveModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const auth = useAuth();
  const me = auth.me!;
  const types = useOptions('leave_types', { sort: 'name' });
  const emps = useEmployeesDir();
  const canForOthers = auth.can('leave.recommend');
  const [v, setV] = useState({ employee_id: me.employee?.id || '', leave_type_id: '', start_date: todayISO(1), end_date: todayISO(1), notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV({ employee_id: me.employee?.id || '', leave_type_id: '', start_date: todayISO(1), end_date: todayISO(1), notes: '' }); setErr(''); } }, [open]); // eslint-disable-line
  const valid = v.employee_id && v.start_date && v.end_date && v.end_date >= v.start_date;
  const impact = useRpc<Impact>('leave_impact', { employee_id: v.employee_id, start_date: v.start_date, end_date: v.end_date }, open && !!valid);
  const submit = async (send: boolean) => {
    setErr('');
    if (!v.employee_id) return setErr('اختر الموظف');
    if (!v.leave_type_id) return setErr('اختر نوع الإجازة');
    if (!valid) return setErr('تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو مساويًا له');
    setBusy(true);
    try {
      const r = await api.create<any>('leave_requests', { ...v, notes: v.notes || null, status: 'draft' });
      if (send) await api.rpc('leave_transition', { id: r.id, to: 'submitted' });
      onClose(); onCreated(r.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="طلب إجازة" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button variant="secondary" loading={busy} onClick={() => submit(false)}>حفظ كمسودة</Button><Button loading={busy} onClick={() => submit(true)}>تقديم الطلب</Button></>}>
      {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الموظف" required>{(id) => canForOthers
          ? <Select id={id} value={v.employee_id} onChange={(e) => setV({ ...v, employee_id: e.target.value })} options={emps.options} placeholder="اختر" />
          : <Input id={id} value={me.employee?.full_name || 'حسابك غير مرتبط بموظف'} disabled />}</Field>
        <Field label="نوع الإجازة" required>{(id) => <Select id={id} value={v.leave_type_id} onChange={(e) => setV({ ...v, leave_type_id: e.target.value })} options={types.options} placeholder="اختر" />}</Field>
        <Field label="من تاريخ" required>{(id) => <Input id={id} type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value, end_date: v.end_date < e.target.value ? e.target.value : v.end_date })} />}</Field>
        <Field label="إلى تاريخ" required hint={valid ? `المدة ${daysBetween(v.start_date, v.end_date) + 1} يوم` : undefined}>{(id) => <Input id={id} type="date" min={v.start_date} value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} />}</Field>
        <Field label="ملاحظات" className="sm:col-span-2">{(id) => <Textarea id={id} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}</Field>
      </div>
      {v.employee_id && types.rows.find((t: any) => t.id === v.leave_type_id)?.code === 'ANNUAL' && <BalanceHint employeeId={v.employee_id} year={Number(v.start_date.slice(0, 4))} days={valid ? daysBetween(v.start_date, v.end_date) + 1 : 0} />}
      {valid && v.employee_id && <div className="mt-3"><ImpactPanel impact={impact.data} loading={impact.isLoading} /></div>}
    </Modal>
  );
}

function LeaveDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const auth = useAuth();
  const q = useOne('leave_requests', id);
  const r = q.data;
  const ev = useList('leave_events', { filters: { request_id: id }, pageSize: 100, sort: 'created_at' });
  const impact = useRpc<Impact>('leave_impact', r ? { employee_id: r.employee_id, start_date: r.start_date, end_date: r.end_date, exclude_id: r.id } : {}, !!r && !['approved', 'rejected', 'cancelled'].includes(r.status));
  const [action, setAction] = useState<null | 'recommended' | 'approved' | 'rejected' | 'cancelled'>(null);
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [err, setErr] = useState('');
  const act = useAction((p: any) => api.rpc('leave_transition', { id, ...p }), { success: 'تم تحديث حالة الطلب', onSuccess: () => { setAction(null); setNote(''); setOverride(false); setOverrideReason(''); } });
  if (!r) return <Modal open onClose={onClose} title="طلب إجازة">{q.isError ? <Alert tone="danger">{(q.error as any)?.message}</Alert> : <Spinner />}</Modal>;

  const myEmp = auth.me?.employee?.id;
  const isOwner = r.employee_id === myEmp;
  const canRec = auth.can('leave.recommend') && !isOwner;
  const canApp = auth.can('leave.approve') && !isOwner;
  const run = async () => {
    setErr('');
    if ((action === 'approved' || action === 'rejected') && !note.trim()) return setErr('يجب توثيق سبب القرار');
    if (override && !overrideReason.trim()) return setErr('اكتب سبب تجاوز تحذير التغطية');
    try { await act.mutateAsync({ to: action, note: note || null, override: override || null, override_reason: override ? overrideReason : null }); }
    catch (e) {
      if (e instanceof ApiError && e.code === 'coverage_override_required') {
        setErr(auth.can('leave.override_coverage') ? 'الاعتماد يخفض التغطية أو يترك مهارة أساسية بلا بديل. لتجاوز التحذير فعّل خيار التجاوز ووثّق السبب.' : 'الاعتماد يخفض التغطية عن الحد الأدنى وليست لديك صلاحية تجاوز التحذير. أحِل الطلب إلى مدير التشغيل.');
        if (auth.can('leave.override_coverage')) setOverride(true);
      } else setErr((e as any).message);
    }
  };
  const titles = { recommended: 'رفع توصية', approved: 'اعتماد الطلب', rejected: 'رفض الطلب', cancelled: 'إلغاء الطلب' } as const;

  return (
    <Modal open onClose={onClose} title={`طلب إجازة – ${r.employee_name}`} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>إغلاق</Button>
        {r.status === 'draft' && (isOwner || canRec) && <Button loading={act.isPending} onClick={() => act.mutate({ to: 'submitted' })}>تقديم الطلب</Button>}
        {r.status === 'pending_review' && canRec && <Button variant="secondary" onClick={() => setAction('recommended')}>رفع توصية</Button>}
        {['pending_review', 'recommended'].includes(r.status) && canApp && <><Button variant="danger" onClick={() => setAction('rejected')}>رفض</Button><Button variant="accent" onClick={() => setAction('approved')}>اعتماد</Button></>}
        {((isOwner && !['approved', 'rejected', 'cancelled'].includes(r.status)) || (canApp && r.status !== 'cancelled')) && <Button variant="ghost" onClick={() => setAction('cancelled')}>إلغاء الطلب</Button>}
      </>}>
      <div className="mb-3 flex flex-wrap gap-2"><LeaveStatus v={r.status} /><DemoBadge show={r.is_demo} />{r.coverage_override && <Badge tone="danger"><ShieldAlert className="h-3 w-3" /> اعتُمد بتجاوز تحذير التغطية</Badge>}</div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KV label="الموظف">{r.employee_name} <span className="text-xs text-muted">{r.employee_number}</span></KV>
        <KV label="النوع">{r.leave_type_name}</KV>
        <KV label="الفترة">{fmtDate(r.start_date)} – {fmtDate(r.end_date)} (<span className="num">{r.days}</span> يوم)</KV>
        <KV label="الموقع / الوردية">{r.site_name} · {r.shift_name || '—'}</KV>
        <KV label="التوصية">{r.recommendation_note ? `${r.recommendation_note} — ${r.recommended_by_name || ''}` : '—'}</KV>
        <KV label="القرار">{r.decision_reason ? `${r.decision_reason} — ${r.decided_by_name || ''} ${r.decided_at ? fmtDateTime(r.decided_at) : ''}` : '—'}</KV>
        {r.override_reason && <KV label="سبب تجاوز التغطية">{r.override_reason}</KV>}
        {r.notes && <KV label="ملاحظات الموظف">{r.notes}</KV>}
      </dl>
      {!['approved', 'rejected', 'cancelled'].includes(r.status) && <div className="mt-4"><ImpactPanel impact={impact.data} loading={impact.isLoading} /></div>}

      {action && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface-2 p-3">
          <h3 className="font-semibold">{titles[action]}</h3>
          {err && <Alert tone="danger">{err}</Alert>}
          <Field label={action === 'recommended' ? 'نص التوصية' : 'السبب / الملاحظة'} required={action === 'approved' || action === 'rejected'}>{(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          {action === 'approved' && override && (
            <Field label="سبب تجاوز تحذير التغطية (يُسجل في سجل التدقيق)" required>{(fid) => <Textarea id={fid} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="مثال: تم ترتيب تغطية مؤقتة من محطة مجاورة" />}</Field>
          )}
          <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setAction(null); setErr(''); }}>تراجع</Button><Button size="sm" loading={act.isPending} variant={action === 'rejected' ? 'danger' : 'primary'} onClick={run}>تأكيد</Button></div>
        </div>
      )}

      <div className="mt-4"><Attachments entityType="leave" entityId={r.id} canUpload={!auth.isReportOnly} title="المرفقات (مثل التقرير الطبي)" /></div>
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold">سجل الطلب</h3>
        <ol className="space-y-2 border-s border-border ps-4 text-sm">
          {(ev.data?.rows ?? []).map((e: any) => (
            <li key={e.id}><b>{label('leave_status', e.to_status)}</b> · {e.actor_name || '—'} · <span className="text-muted">{fmtDateTime(e.created_at)}</span>{e.note && <div className="whitespace-pre-line text-xs text-muted">{e.note}</div>}</li>
          ))}
          {(ev.data?.rows ?? []).length === 0 && <li className="text-muted">لا توجد أحداث.</li>}
        </ol>
      </div>
    </Modal>
  );
}

function LeaveCalendar({ onOpen }: { onOpen: (id: string) => void }) {
  const sites = useSites();
  const [site, setSite] = useState('');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const first = `${month}-01`;
  const startDow = new Date(`${first}T12:00:00Z`).getUTCDay();
  const nextMonth = (() => { const d = new Date(`${first}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  const prevMonth = (() => { const d = new Date(`${first}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const last = addDays(`${nextMonth}-01`, -1);
  const q = useList('leave_requests', { filters: { start_date__lte: last, end_date__gte: first, status: 'approved,recommended,pending_review', ...(site ? { site_id: site } : {}) }, pageSize: 500, sort: 'start_date' });
  const rows = q.data?.rows ?? [];
  const days = Array.from({ length: daysBetween(first, last) + 1 }, (_, i) => addDays(first, i));
  const monthName = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${first}T12:00:00Z`));
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <IconButton label="الشهر السابق" onClick={() => setMonth(prevMonth)}><ChevronRight className="h-4 w-4" /></IconButton>
        <h3 className="min-w-[140px] text-center font-semibold">{monthName}</h3>
        <IconButton label="الشهر التالي" onClick={() => setMonth(nextMonth)}><ChevronLeft className="h-4 w-4" /></IconButton>
        <div className="ms-auto w-56"><Select aria-label="الموقع" value={site} onChange={(e) => setSite(e.target.value)} options={sites.options} placeholder="كل المواقع" /></div>
      </div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted"><span><Badge tone="success">معتمد</Badge></span><span><Badge tone="accent">موصى به</Badge></span><span><Badge tone="warning">بانتظار مراجعة</Badge></span></div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {options('weekday').map((w) => <div key={w.value} className="py-1 text-center font-semibold text-muted">{w.label}</div>)}
        {Array.from({ length: startDow }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((d) => {
          const on = rows.filter((r: any) => r.start_date <= d && r.end_date >= d);
          return (
            <div key={d} className={`min-h-[72px] rounded-md border border-border p-1 ${d === todayISO() ? 'ring-2 ring-accent' : ''}`}>
              <div className="num text-muted">{Number(d.slice(8))}</div>
              {on.slice(0, 3).map((r: any) => (
                <button key={r.id} onClick={() => onOpen(r.id)} className={`mt-0.5 block w-full truncate rounded px-1 text-start ${r.status === 'approved' ? 'bg-success-soft text-success' : r.status === 'recommended' ? 'bg-info-soft text-info' : 'bg-warning-soft text-warning'}`} title={`${r.employee_name} – ${r.leave_type_name}`}>{r.employee_name}</button>
              ))}
              {on.length > 3 && <div className="text-muted">+{on.length - 3}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BalanceHint({ employeeId, year, days }: { employeeId: string; year: number; days: number }) {
  const q = useRpc<any[]>('leave_balance_report', { year });
  const b = (q.data ?? []).find((r) => r.employee_id === employeeId);
  if (!b) return null;
  const after = Number(b.remaining) - Number(b.pending) - days;
  return (
    <Alert tone={after < 0 ? 'danger' : 'info'} className="mt-3" title="رصيد الإجازة السنوية">
      الرصيد المتبقي لسنة <span className="num">{year}</span>: <b className="num">{b.remaining}</b> يوم
      {Number(b.pending) > 0 && <> (منها <span className="num">{b.pending}</span> يوم في طلبات قيد المراجعة)</>}
      {days > 0 && <> · بعد هذا الطلب: <b className="num">{after}</b> يوم</>}
      {after < 0 && <div className="mt-1 font-semibold">مدة الطلب أكبر من الرصيد المتاح.</div>}
      {!b.has_record && <div className="mt-1 text-xs opacity-80">الرصيد تقديري (لم يُدخل رصيد هذه السنة بعد).</div>}
    </Alert>
  );
}

function LeaveBalances() {
  const auth = useAuth();
  const sites = useSites();
  const thisYear = Number(todayISO().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [site, setSite] = useState('');
  const [onlyAbove, setOnlyAbove] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [closing, setClosing] = useState(false);
  const q = useRpc<any[]>('leave_balance_report', { year, site_id: site || null });
  const rows = (q.data ?? []).filter((r) => !onlyAbove || Number(r.above_cap) > 0);
  const above = (q.data ?? []).filter((r) => Number(r.above_cap) > 0);
  const canEdit = auth.can('leave.balances');
  const canClose = canEdit && auth.hasRole('system_admin', 'operations_manager');
  const month = Number(todayISO().slice(5, 7));
  const save = useAction(async (p: Record<string, any>) => {
    const ex = await api.list('leave_balances', { filters: { employee_id: editing.employee_id, year } });
    const body = { entitlement: Number(p.entitlement), carried_over: Number(p.carried_over || 0), adjustment: Number(p.adjustment || 0), notes: p.notes };
    return ex.rows[0] ? api.update('leave_balances', ex.rows[0].id, body) : api.create('leave_balances', { ...body, employee_id: editing.employee_id, year });
  }, { success: 'تم حفظ الرصيد' });
  const [closed, setClosed] = useState<any>(null);
  const close = useAction(() => api.rpc<any>('close_leave_year', { year }), {
    onSuccess: (r: any) => { setClosing(false); setClosed(r); },
  });
  const exportRows = () => exportXlsx(`leave-balances-${year}`, [
    { header: 'الرقم الوظيفي', value: (r: any) => r.employee_number }, { header: 'الاسم', value: (r: any) => r.full_name },
    { header: 'الموقع', value: (r: any) => r.site_name }, { header: 'المجموعة', value: (r: any) => r.group_code },
    { header: 'الاستحقاق', value: (r: any) => Number(r.entitlement) }, { header: 'المرحل', value: (r: any) => Number(r.carried_over) },
    { header: 'تسوية', value: (r: any) => Number(r.adjustment) }, { header: 'المستخدم', value: (r: any) => Number(r.used) },
    { header: 'قيد المراجعة', value: (r: any) => Number(r.pending) }, { header: 'المتبقي', value: (r: any) => Number(r.remaining) },
    { header: 'فوق حد الترحيل (10)', value: (r: any) => Number(r.above_cap) },
    { header: 'أيام تعويض مكتسبة', value: (r: any) => Number(r.comp_earned) }, { header: 'أيام تعويض مستخدمة', value: (r: any) => Number(r.comp_used) },
    { header: 'الرصيد', value: (r: any) => (r.has_record ? 'مُدخل' : 'تقديري') },
  ], rows, { title: `أرصدة الإجازة السنوية ${year}`, filters: onlyAbove ? 'أكثر من 10 أيام' : '', preparedBy: auth.me?.user.full_name || '' });
  return (
    <div className="space-y-3">
      <div className="card no-print flex flex-wrap items-end gap-3 p-3">
        <div><label className="label text-xs" htmlFor="lb-y">السنة</label><Select id="lb-y" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} options={[thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: String(y), label: String(y) }))} /></div>
        <div><label className="label text-xs" htmlFor="lb-s">الموقع</label><Select id="lb-s" value={site} onChange={(e) => setSite(e.target.value)} options={sites.options} placeholder="كل المواقع" /></div>
        <label className="inline-flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={onlyAbove} onChange={(e) => setOnlyAbove(e.target.checked)} /> أكثر من 10 أيام فقط</label>
        <div className="flex-1" />
        <Button variant="secondary" onClick={exportRows}>تصدير Excel</Button>
        {canClose && <Button variant="secondary" onClick={() => setClosing(true)}>ترحيل الأرصدة إلى {year + 1}</Button>}
      </div>
      {above.length > 0 && (
        <Alert tone={month >= 10 && year === thisYear ? 'danger' : 'warning'} title="أرصدة تتجاوز حد الترحيل">
          <b className="num">{above.length}</b> موظف لديهم رصيد أكثر من 10 أيام (مجموع الزيادة <b className="num">{above.reduce((a, r) => a + Number(r.above_cap), 0)}</b> يوم).
          الحد الأقصى للترحيل 10 أيام، والهدف أن يكون الرصيد 10 أيام أو أقل (والأفضل صفر) في نهاية السنة. ما يزيد على 10 لا يُرحَّل.
        </Alert>
      )}
      {closed && <Alert tone="success" title="تم الترحيل">رُحّلت أرصدة <b className="num">{closed.employees}</b> موظف إلى سنة <span className="num">{closed.year}</span> (بحد أقصى 10 أيام لكل موظف). الأيام غير المرحّلة: <b className="num">{closed.days_over_cap}</b>.</Alert>}
      <div className="card overflow-x-auto">
        {q.isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="لا توجد بيانات" /> : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-2"><tr>
              <th className="th">الموظف</th><th className="th">المجموعة</th><th className="th text-center">الاستحقاق</th><th className="th text-center">المرحّل</th>
              <th className="th text-center">تسوية</th><th className="th text-center">المستخدم</th><th className="th text-center">قيد المراجعة</th>
              <th className="th text-center">المتبقي</th><th className="th text-center">تعويض أيام</th>{canEdit && <th className="th" />}
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.employee_id} className="border-t border-border">
                <td className="td"><div className="font-medium">{r.full_name}</div><div className="text-xs text-muted">{r.employee_number} · {r.site_name || '—'}</div></td>
                <td className="td">{r.group_code || '—'}</td>
                <td className="td text-center num">{r.entitlement}</td>
                <td className="td text-center num">{Number(r.carried_over)}</td>
                <td className="td text-center num">{Number(r.adjustment)}</td>
                <td className="td text-center num">{Number(r.used)}</td>
                <td className="td text-center num">{Number(r.pending) || '—'}</td>
                <td className="td text-center">
                  <span className={cx('num rounded px-2 py-0.5 font-bold', Number(r.above_cap) > 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>{Number(r.remaining)}</span>
                  {Number(r.above_cap) > 0 && <div className="text-[11px] text-danger">+<span className="num">{Number(r.above_cap)}</span> فوق الحد</div>}
                  {!r.has_record && <div className="text-[11px] text-muted">تقديري</div>}
                </td>
                <td className="td text-center text-xs"><span className="num">{Number(r.comp_earned)}</span> مكتسب / <span className="num">{Number(r.comp_used)}</span> مستخدم</td>
                {canEdit && <td className="td"><Button size="sm" variant="ghost" onClick={() => setEditing(r)}>تعديل</Button></td>}
              </tr>))}</tbody>
          </table>
        )}
        <div className="border-t border-border p-3 text-xs text-muted">
          المتبقي = الاستحقاق السنوي + المرحّل من السنة السابقة (حد أقصى 10) + التسوية − الإجازات الاعتيادية المعتمدة في السنة (بالأيام التقويمية).
          «تقديري» يعني أن رصيد السنة لم يُدخل بعد، فيُحسب من استحقاق الموظف فقط. التنبيهات الشهرية من أكتوبر تُرسل للأرصدة المُدخلة فقط.
        </div>
      </div>
      <FormModal open={!!editing} onClose={() => setEditing(null)} title={`رصيد ${editing?.full_name ?? ''} لسنة ${year}`}
        initial={editing ? { entitlement: Number(editing.entitlement), carried_over: Number(editing.carried_over), adjustment: Number(editing.adjustment) } : null}
        onSubmit={(p) => save.mutateAsync(p)}
        fields={[
          { name: 'entitlement', label: 'الاستحقاق السنوي (بالأيام)', type: 'number', required: true, min: 0, max: 60 },
          { name: 'carried_over', label: 'المرحّل من السنة السابقة', type: 'number', min: 0, max: 10, hint: 'الحد الأقصى 10 أيام' },
          { name: 'adjustment', label: 'تسوية (+ أو −)', type: 'number', min: -60, max: 60, hint: 'مثل أيام مستخدمة قبل بدء العمل بالمنصة (بالسالب)' },
          { name: 'notes', label: 'ملاحظات', type: 'textarea' },
        ]} />
      <ConfirmDialog open={closing} onClose={() => setClosing(false)} confirmLabel="ترحيل" loading={close.isPending} onConfirm={() => close.mutate()}
        title={`ترحيل أرصدة ${year} إلى ${year + 1}`}
        message={<>سيُنشأ رصيد سنة {year + 1} لكل موظف نشط: الاستحقاق من ملفه، والمرحّل = المتبقي بحد أقصى 10 أيام. ما يزيد على 10 لا يُرحَّل. يمكن تعديل أي رصيد بعدها، ويمكن إعادة الترحيل لتحديث الأرقام.</>} />
    </div>
  );
}

type View = 'mine' | 'review' | 'all' | 'calendar' | 'balances';
export default function Leaves() {
  const auth = useAuth();
  const [sp, setSp] = useSearchParams();
  const sites = useSites();
  const types = useOptions('leave_types', { sort: 'name' });
  const emp = auth.me?.employee?.id;
  const reviewer = auth.can('leave.recommend') || auth.can('leave.approve');
  const [view, setView] = useState<View>(sp.get('tab') === 'balances' ? 'balances' : reviewer ? 'review' : 'mine');
  const [creating, setCreating] = useState(false);
  const openId = sp.get('id');
  const open = (id: string | null) => { const n = new URLSearchParams(sp); if (id) n.set('id', id); else n.delete('id'); setSp(n, { replace: true }); };
  const base = useMemo(() => {
    if (view === 'mine') return { employee_id: emp || '00000000-0000-0000-0000-000000000000' };
    if (view === 'review') return { status: 'pending_review,recommended' };
    return undefined;
  }, [view, emp]);
  return (
    <div>
      <PageHeader title="الإجازات" icon={<CalendarDays className="h-6 w-6" />}
        description="طلبات الإجازة وأثرها على التغطية والمهارات. لا يتخذ النظام قرارًا آليًا؛ كل اعتماد أو رفض بشري وموثق."
        actions={(emp || auth.can('leave.recommend')) && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>طلب إجازة</Button>} />
      <Tabs<View> value={view} onChange={setView} tabs={[
        ...(emp ? [{ value: 'mine' as View, label: 'طلباتي' }] : []),
        ...(reviewer ? [{ value: 'review' as View, label: 'بانتظار المراجعة' }] : []),
        ...(auth.isManager ? [{ value: 'all' as View, label: 'كل الطلبات' }] : []),
        { value: 'calendar', label: 'التقويم' },
        { value: 'balances', label: auth.isManager || auth.isReportOnly ? 'أرصدة الإجازة السنوية' : 'رصيدي' },
      ]} />
      {view === 'balances' ? <LeaveBalances /> : view === 'calendar' ? <LeaveCalendar onOpen={open} /> : (
        <DataTable resource="leave_requests" defaultSort="-created_at" baseFilters={base} archivedToggle={auth.isManager}
          searchPlaceholder="ابحث باسم الموظف أو رقمه أو الموقع…"
          filters={[
            { key: 'status', label: 'الحالة', options: options('leave_status') },
            { key: 'leave_type_id', label: 'النوع', options: types.options },
            { key: 'site_id', label: 'الموقع', options: sites.options },
            { key: 'start_date__gte', label: 'تبدأ من', type: 'date' },
            { key: 'start_date__lte', label: 'تبدأ قبل', type: 'date' },
            { key: 'coverage_override', label: 'بتجاوز تغطية', type: 'bool' },
          ]}
          onRowClick={(r: any) => open(r.id)}
          columns={[
            { key: 'employee_name', header: 'الموظف', sortKey: 'employee_name', mobile: 'title', render: (r: any) => <div><div className="font-medium">{r.employee_name} <DemoBadge show={r.is_demo} /></div><div className="text-xs text-muted">{r.employee_number} · {r.site_name}</div></div> },
            { key: 'leave_type_name', header: 'النوع' },
            { key: 'start_date', header: 'الفترة', sortKey: 'start_date', render: (r: any) => <span>{fmtDate(r.start_date)} – {fmtDate(r.end_date)} <span className="text-xs text-muted num">({r.days} يوم)</span></span> },
            { key: 'status', header: 'الحالة', sortKey: 'status', render: (r: any) => <div className="flex flex-wrap gap-1"><LeaveStatus v={r.status} />{r.coverage_override && <Badge tone="danger">تجاوز تغطية</Badge>}</div> },
            { key: 'created_at', header: 'تاريخ الطلب', sortKey: 'created_at', render: (r: any) => fmtDate(r.created_at) },
          ]}
          empty={{ title: view === 'review' ? 'لا توجد طلبات بانتظار المراجعة' : 'لا توجد طلبات إجازة' }} />
      )}
      <NewLeaveModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => open(id)} />
      {openId && <LeaveDetail id={openId} onClose={() => open(null)} />}
    </div>
  );
}
