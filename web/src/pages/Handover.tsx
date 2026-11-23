import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useEmployeesDir, useList, useOptions, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { addDays, fmtDate, fmtDateTime, fromLocalInput, toLocalInput, todayISO } from '@/lib/format';
import { DataTable } from '@/components/DataTable';
import { Alert, Badge, Button, Card, DemoBadge, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, Tabs, Textarea } from '@/components/ui';

const statusTone = { draft: 'neutral', submitted: 'warning', acknowledged: 'success' } as const;
export const HandoverStatus = ({ v }: { v: string }) => <Badge tone={(statusTone as any)[v]}>{label('handover_status', v)}</Badge>;

type Item = { kind: string; description: string; reference_no: string; event_time: string };

export function NewHandoverModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const nav = useNavigate();
  const me = auth.me!;
  const sites = useSites();
  const [v, setV] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const siteId = v.site_id ?? me.employee?.primary_site_id ?? '';
  const shifts = useOptions('shifts', { label: (r) => `${r.name} (${String(r.start_time).slice(0, 5)}–${String(r.end_time).slice(0, 5)})`, filters: siteId ? { site_id: siteId } : undefined, enabled: !!siteId });
  const lines = useOptions('lines', { filters: siteId ? { site_id: siteId } : undefined, enabled: !!siteId });
  const emps = useEmployeesDir();
  const val = (k: string, d = '') => v[k] ?? d;
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));

  const reset = () => { setV({}); setItems([]); setErr(''); };
  const submit = async (status: 'draft' | 'submitted') => {
    setErr('');
    if (!siteId) return setErr('اختر الموقع');
    if (status === 'submitted' && !val('incoming_employee_id')) return setErr('حدد الموظف المستلم قبل التسليم');
    const bad = items.find((i) => i.description.trim().length < 2);
    if (bad) return setErr('أكمل وصف جميع البنود أو احذف البنود الفارغة');
    setBusy(true);
    try {
      const r = await api.create<any>('handover_reports', {
        site_id: siteId, shift_id: val('shift_id', me.employee?.shift_id || '') || null, line_id: val('line_id') || null,
        handover_at: fromLocalInput(val('handover_at', toLocalInput(new Date().toISOString()))),
        outgoing_employee_id: val('outgoing_employee_id', me.employee?.id || '') || null, incoming_employee_id: val('incoming_employee_id') || null,
        systems_status: val('systems_status') || null, general_notes: val('general_notes') || null, next_shift_instructions: val('next_shift_instructions') || null,
        status: 'draft',
      });
      for (const it of items) {
        await api.create('handover_items', { report_id: r.id, kind: it.kind, description: it.description.trim(), reference_no: it.reference_no || null, event_time: it.event_time ? fromLocalInput(it.event_time) : null });
      }
      if (status === 'submitted') await api.rpc('handover_confirm', { report_id: r.id, side: 'outgoing' });
      reset(); onClose(); nav(`/handover/${r.id}`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="تقرير تسليم واستلام وردية" size="xl"
      footer={<>
        <Button variant="secondary" onClick={() => { reset(); onClose(); }}>إلغاء</Button>
        <Button variant="secondary" loading={busy} onClick={() => submit('draft')}>حفظ كمسودة</Button>
        <Button loading={busy} onClick={() => submit('submitted')}>تأكيد التسليم</Button>
      </>}>
      {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="الموقع" required>{(id) => <Select id={id} value={siteId} onChange={(e) => { set('site_id', e.target.value); set('shift_id', ''); set('line_id', ''); }} options={sites.options} placeholder="اختر" />}</Field>
        <Field label="الوردية">{(id) => <Select id={id} value={val('shift_id', me.employee?.shift_id || '')} onChange={(e) => set('shift_id', e.target.value)} options={shifts.options} placeholder="اختر" />}</Field>
        <Field label="الخط">{(id) => <Select id={id} value={val('line_id')} onChange={(e) => set('line_id', e.target.value)} options={lines.options} placeholder="—" />}</Field>
        <Field label="وقت التسليم" required>{(id) => <Input id={id} type="datetime-local" value={val('handover_at', toLocalInput(new Date().toISOString()))} onChange={(e) => set('handover_at', e.target.value)} />}</Field>
        <Field label="الموظف المسلّم">{(id) => <Select id={id} value={val('outgoing_employee_id', me.employee?.id || '')} onChange={(e) => set('outgoing_employee_id', e.target.value)} options={emps.options} placeholder="اختر" />}</Field>
        <Field label="الموظف المستلم">{(id) => <Select id={id} value={val('incoming_employee_id')} onChange={(e) => set('incoming_employee_id', e.target.value)} options={emps.options} placeholder="اختر" />}</Field>
        <Field label="حالة الأنظمة" className="sm:col-span-2 lg:col-span-3" hint="وصف حالة المضخات والصمامات والخزانات والأنظمة عند التسليم (توثيق فقط)">{(id) => <Textarea id={id} value={val('systems_status')} onChange={(e) => set('systems_status', e.target.value)} />}</Field>
        <Field label="ملاحظات عامة" className="sm:col-span-2 lg:col-span-3">{(id) => <Textarea id={id} value={val('general_notes')} onChange={(e) => set('general_notes', e.target.value)} />}</Field>
        <Field label="تعليمات للوردية التالية" className="sm:col-span-2 lg:col-span-3">{(id) => <Textarea id={id} value={val('next_shift_instructions')} onChange={(e) => set('next_shift_instructions', e.target.value)} />}</Field>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between"><div className="label mb-0">البنود: المهام المعلقة، الإنذارات، المعدات خارج الخدمة، البلاغات، تعليمات المتابعة</div>
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setItems((s) => [...s, { kind: 'followup', description: '', reference_no: '', event_time: '' }])}>إضافة بند</Button></div>
        {items.length === 0 && <p className="text-sm text-muted">لا توجد بنود. أضف بندًا لكل ملاحظة تحتاج متابعة.</p>}
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[180px_1fr_140px_190px_auto]">
              <Select aria-label="نوع البند" value={it.kind} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} options={options('handover_item_kind')} />
              <Input aria-label="الوصف" placeholder="الوصف" value={it.description} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <Input aria-label="رقم المرجع" placeholder="رقم البلاغ/المرجع" value={it.reference_no} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, reference_no: e.target.value } : x)))} />
              <Input aria-label="وقت الحدث" type="datetime-local" value={it.event_time} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, event_time: e.target.value } : x)))} />
              <IconButton label="حذف البند" onClick={() => setItems((s) => s.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconButton>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function HandoverReport() {
  const auth = useAuth();
  const sites = useSites();
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = useState(todayISO());
  const [site, setSite] = useState('');
  const from = mode === 'daily' ? date : addDays(date, -6);
  const range = { handover_at__gte: `${from}T00:00:00+03:00`, handover_at__lte: `${date}T23:59:59+03:00`, ...(site ? { site_id: site } : {}) };
  const reps = useList('handover_reports', { filters: range, pageSize: 200, sort: 'handover_at' });
  const items = useList('handover_items', { filters: range, pageSize: 500, sort: 'handover_at' });
  const rows = reps.data?.rows ?? [];
  const its = items.data?.rows ?? [];
  const open = its.filter((i: any) => i.status === 'open');
  const siteName = sites.options.find((o) => o.value === site)?.label || 'كل المواقع';
  return (
    <div className="space-y-4">
      <Card className="no-print">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="نوع التقرير">{(id) => <Select id={id} value={mode} onChange={(e) => setMode(e.target.value as any)} options={[{ value: 'daily', label: 'يومي' }, { value: 'weekly', label: 'أسبوعي (7 أيام حتى التاريخ)' }]} />}</Field>
          <Field label="التاريخ">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="الموقع">{(id) => <Select id={id} value={site} onChange={(e) => setSite(e.target.value)} options={sites.options} placeholder="كل المواقع" />}</Field>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>طباعة / PDF</Button>
        </div>
      </Card>
      <div className="print-area space-y-4">
        <div className="card p-4">
          <h2 className="text-lg font-bold">تقرير تسليم الورديات {mode === 'daily' ? 'اليومي' : 'الأسبوعي'}</h2>
          <p className="text-sm text-muted">الفترة: {fmtDate(from)} – {fmtDate(date)} · {siteName} · أعده: {auth.me?.user.full_name} · تاريخ الإعداد: {fmtDateTime(new Date().toISOString())}</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div><div className="text-2xl font-bold num">{rows.length}</div><div className="text-xs text-muted">تقارير تسليم</div></div>
            <div><div className="text-2xl font-bold num">{its.length}</div><div className="text-xs text-muted">بنود مسجلة</div></div>
            <div><div className="text-2xl font-bold text-warning num">{open.length}</div><div className="text-xs text-muted">بنود مفتوحة</div></div>
          </div>
        </div>
        {reps.isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="لا توجد تقارير تسليم في هذه الفترة" /> : (
          <Card title="التقارير">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr><th className="th">الوقت</th><th className="th">الموقع</th><th className="th">الوردية</th><th className="th">المسلّم</th><th className="th">المستلم</th><th className="th">الحالة</th><th className="th">بنود مفتوحة</th></tr></thead>
              <tbody>{rows.map((r: any) => (
                <tr key={r.id}><td className="td">{fmtDateTime(r.handover_at)}</td><td className="td">{r.site_name}</td><td className="td">{r.shift_name || '—'}</td><td className="td">{r.outgoing_name || '—'}</td><td className="td">{r.incoming_name || '—'}</td><td className="td">{label('handover_status', r.status)}</td><td className="td num">{r.open_items}</td></tr>))}</tbody>
            </table></div>
          </Card>
        )}
        {open.length > 0 && (
          <Card title="البنود المفتوحة التي تحتاج متابعة">
            <ul className="divide-y divide-border">{open.map((i: any) => (
              <li key={i.id} className="py-2 text-sm"><Badge tone="warning">{label('handover_item_kind', i.kind)}</Badge> {i.description}
                <div className="text-xs text-muted">{i.site_name} · {fmtDateTime(i.handover_at)}{i.reference_no ? ` · مرجع ${i.reference_no}` : ''}{i.linked_task_id ? ' · محوّلة إلى مهمة' : ''}</div></li>))}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Handover() {
  const nav = useNavigate();
  const auth = useAuth();
  const sites = useSites();
  const [tab, setTab] = useState<'list' | 'mine' | 'report'>('list');
  const [creating, setCreating] = useState(false);
  const emp = auth.me?.employee?.id;
  const base = useMemo(() => (tab === 'mine' ? { incoming_employee_id: emp, status: 'submitted' } : undefined), [tab, emp]);
  const canCreate = !!emp || auth.isManager;
  return (
    <div>
      <PageHeader title="تسليم واستلام الورديات" icon={<ArrowLeftRight className="h-6 w-6" />}
        description="توثيق حالة الأنظمة والملاحظات المفتوحة بين الورديات، وتحويل الملاحظات إلى مهام. لا تُرسل أي أوامر تشغيل للمعدات."
        actions={canCreate && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>تسليم وردية</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'list', label: 'السجل' }, ...(emp ? [{ value: 'mine' as const, label: 'بانتظار استلامي' }] : []), { value: 'report', label: 'التقرير اليومي/الأسبوعي' }]} />
      {tab === 'report' ? <HandoverReport /> : (
        <DataTable resource="handover_reports" defaultSort="-handover_at" archivedToggle={auth.isManager} baseFilters={base as any}
          searchPlaceholder="ابحث بالموقع أو الموظف أو الملاحظات…"
          filters={[
            { key: 'site_id', label: 'الموقع', options: sites.options },
            { key: 'status', label: 'الحالة', options: options('handover_status') },
            { key: 'handover_at__gte', label: 'من تاريخ', type: 'date' },
            { key: 'handover_at__lte', label: 'إلى تاريخ', type: 'date' },
          ]}
          onRowClick={(r: any) => nav(`/handover/${r.id}`)}
          columns={[
            { key: 'handover_at', header: 'وقت التسليم', sortKey: 'handover_at', mobile: 'title', render: (r: any) => <span className="font-medium">{fmtDateTime(r.handover_at)} <DemoBadge show={r.is_demo} /></span> },
            { key: 'site_name', header: 'الموقع', sortKey: 'site_name' },
            { key: 'shift_name', header: 'الوردية' },
            { key: 'outgoing_name', header: 'المسلّم' },
            { key: 'incoming_name', header: 'المستلم' },
            { key: 'status', header: 'الحالة', render: (r: any) => <HandoverStatus v={r.status} /> },
            { key: 'open_items', header: 'بنود مفتوحة', sortKey: 'open_items', render: (r: any) => (r.open_items ? <Badge tone="warning" className="num">{r.open_items}</Badge> : <span className="num text-muted">0</span>) },
          ]}
          empty={{ title: tab === 'mine' ? 'لا توجد تسليمات بانتظار استلامك' : 'لا توجد تقارير تسليم' }} />
      )}
      <NewHandoverModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
