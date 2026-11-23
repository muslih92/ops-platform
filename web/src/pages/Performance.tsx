import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Gauge, Plus, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useEmployeesDir, useList, useOne, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDate, fmtDateTime, todayISO } from '@/lib/format';
import { DataTable } from '@/components/DataTable';
import { FormModal } from '@/components/EntityForm';
import { Alert, Badge, Button, DemoBadge, Field, KV, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui';

const statusTone = { draft: 'neutral', submitted: 'warning', acknowledged: 'success' } as const;
const ReviewStatus = ({ v }: { v: string }) => <Badge tone={(statusTone as any)[v]}>{label('review_status', v)}</Badge>;

function ReviewDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const auth = useAuth();
  const q = useOne('reviews', id);
  const r = q.data;
  const criteria = useList('review_criteria', { filters: {}, pageSize: 100, sort: 'sort_order' });
  const levels = useList('rating_levels', { pageSize: 50, sort: 'sort_order' });
  const scores = useList('review_scores', { filters: { review_id: id }, pageSize: 100 });
  const ctx = useList('tasks', r ? { filters: { owner_employee_id: r.employee_id, created_at__gte: r.period_start, created_at__lte: `${r.period_end}T23:59:59+03:00` }, pageSize: 1000 } : {}, !!r && r.status === 'draft');
  const [form, setForm] = useState<Record<string, any>>({});
  const [sc, setSc] = useState<Record<string, { rating_level_id: string; comment: string; id?: string }>>({});
  const [ack, setAck] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (r) setForm({ overall_rating_level_id: r.overall_rating_level_id || '', external_delay_notes: r.external_delay_notes || '', supervisor_comment: r.supervisor_comment || '', next_development_step: r.next_development_step || '' }); }, [r?.id, r?.updated_at]); // eslint-disable-line
  useEffect(() => { const m: any = {}; for (const s of scores.data?.rows ?? []) m[s.criterion_id] = { rating_level_id: s.rating_level_id || '', comment: s.comment || '', id: s.id }; setSc(m); }, [scores.data]);
  const invalidate = useAction(async () => null);
  const ackM = useAction(() => api.rpc('review_acknowledge', { review_id: id, comment: ack || null }), { success: 'تم تأكيد الاطلاع' });
  if (!r) return <Modal open onClose={onClose} title="تقييم الأداء">{q.isError ? <Alert tone="danger">{(q.error as any)?.message}</Alert> : <Spinner />}</Modal>;

  const editable = r.status === 'draft' && auth.can('reviews.manage') && auth.isManager && !r.archived_at;
  const isSelf = r.employee_id === auth.me?.employee?.id;
  const lvlOpts = (levels.data?.rows ?? []).map((l: any) => ({ value: l.id, label: l.name }));
  const activeCriteria = (criteria.data?.rows ?? []).filter((c: any) => c.active || sc[c.id]);
  const tasks = ctx.data?.rows ?? [];

  const save = async (submit: boolean) => {
    setErr('');
    if (submit && !form.overall_rating_level_id) return setErr('حدد التقييم العام قبل الإرسال');
    setBusy(true);
    try {
      for (const c of activeCriteria) {
        const s = sc[c.id];
        if (!s) continue;
        const p = { rating_level_id: s.rating_level_id || null, comment: s.comment || null };
        if (s.id) await api.update('review_scores', s.id, p); else if (s.rating_level_id || s.comment) await api.create('review_scores', { review_id: id, criterion_id: c.id, ...p });
      }
      await api.update('reviews', id, { ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])), ...(submit ? { status: 'submitted' } : {}) });
      await invalidate.mutateAsync();
      if (submit) onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`تقييم أداء – ${r.employee_name}`} size="xl"
      footer={<>
        <Button variant="secondary" onClick={onClose}>إغلاق</Button>
        {editable && <><Button variant="secondary" loading={busy} onClick={() => save(false)}>حفظ المسودة</Button><Button icon={<Send className="h-4 w-4" />} loading={busy} onClick={() => save(true)}>إرسال للموظف</Button></>}
        {isSelf && r.status === 'submitted' && <Button loading={ackM.isPending} onClick={() => ackM.mutate()}>تأكيد الاطلاع</Button>}
      </>}>
      {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
      <div className="mb-3 flex flex-wrap gap-2"><ReviewStatus v={r.status} /><DemoBadge show={r.is_demo} /></div>
      <dl className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KV label="الفترة">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</KV><KV label="المقيّم">{r.reviewer_name}</KV>
        <KV label="أُرسل">{fmtDateTime(r.submitted_at)}</KV><KV label="اطلع الموظف">{fmtDateTime(r.acknowledged_at)}</KV>
      </dl>
      <Alert tone="info" className="mb-4">التقييم سري بين الموظف ومشرفه ولا يُنشأ عنه أي ترتيب علني. عدد المهام ليس مقياسًا للأداء، والتأخير الناتج عن انتظار جهة أخرى لا يُحتسب على الموظف.</Alert>
      {editable && tasks.length > 0 && (
        <div className="mb-4 rounded-md border border-border p-3 text-sm">
          <div className="mb-1 font-semibold">سياق للاسترشاد فقط (ليس معيارًا)</div>
          <div>مهام الفترة: {tasks.length} · مكتملة: {tasks.filter((t: any) => t.status === 'completed').length} · بانتظار جهة أخرى (لا تُحتسب): {tasks.filter((t: any) => t.status === 'waiting_other_party').length}</div>
        </div>
      )}
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr><th className="th">المعيار</th><th className="th w-48">المستوى</th><th className="th">ملاحظة</th></tr></thead>
        <tbody>{activeCriteria.map((c: any) => {
          const s = sc[c.id] || { rating_level_id: '', comment: '' };
          return (
            <tr key={c.id} className="border-t border-border align-top">
              <td className="td"><div className="font-medium">{c.name}</div>{c.description && <div className="text-xs text-muted">{c.description}</div>}</td>
              <td className="td">{editable ? <Select aria-label={c.name} value={s.rating_level_id} onChange={(e) => setSc({ ...sc, [c.id]: { ...s, rating_level_id: e.target.value } })} options={lvlOpts} placeholder="—" /> : (lvlOpts.find((l) => l.value === s.rating_level_id)?.label || '—')}</td>
              <td className="td">{editable ? <Textarea aria-label={`ملاحظة ${c.name}`} rows={1} value={s.comment} onChange={(e) => setSc({ ...sc, [c.id]: { ...s, comment: e.target.value } })} /> : s.comment || '—'}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="التقييم العام">{(fid) => editable ? <Select id={fid} value={form.overall_rating_level_id || ''} onChange={(e) => setForm({ ...form, overall_rating_level_id: e.target.value })} options={lvlOpts} placeholder="اختر" /> : <div className="text-sm font-semibold">{r.overall_rating_name || '—'}</div>}</Field>
        <Field label="تأخيرات بسبب جهات أخرى (للتوثيق ولا تُحتسب)">{(fid) => editable ? <Textarea id={fid} value={form.external_delay_notes || ''} onChange={(e) => setForm({ ...form, external_delay_notes: e.target.value })} /> : <p className="text-sm">{r.external_delay_notes || '—'}</p>}</Field>
        <Field label="تعليق المشرف">{(fid) => editable ? <Textarea id={fid} value={form.supervisor_comment || ''} onChange={(e) => setForm({ ...form, supervisor_comment: e.target.value })} /> : <p className="whitespace-pre-line text-sm">{r.supervisor_comment || '—'}</p>}</Field>
        <Field label="الخطوة التطويرية التالية">{(fid) => editable ? <Textarea id={fid} value={form.next_development_step || ''} onChange={(e) => setForm({ ...form, next_development_step: e.target.value })} /> : <p className="whitespace-pre-line text-sm">{r.next_development_step || '—'}</p>}</Field>
      </div>
      {(r.employee_comment || (isSelf && r.status === 'submitted')) && (
        <div className="mt-4">
          <Field label="تعليق الموظف">{(fid) => isSelf && r.status === 'submitted' ? <Textarea id={fid} value={ack} onChange={(e) => setAck(e.target.value)} placeholder="اختياري" /> : <p className="text-sm">{r.employee_comment}</p>}</Field>
        </div>
      )}
    </Modal>
  );
}

export default function Performance() {
  const auth = useAuth();
  const [sp, setSp] = useSearchParams();
  const sites = useSites();
  const emps = useEmployeesDir();
  const [creating, setCreating] = useState(false);
  const canManage = auth.can('reviews.manage') && auth.isManager;
  const openId = sp.get('id');
  const setOpen = (id: string | null) => { const n = new URLSearchParams(sp); if (id) n.set('id', id); else n.delete('id'); setSp(n, { replace: true }); };
  const create = useAction((p: any) => api.create<any>('reviews', { ...p, reviewer_id: auth.me?.user.id, status: 'draft' }), { success: 'تم إنشاء التقييم', onSuccess: (r: any) => setOpen(r.id) });
  const y = todayISO().slice(0, 4);
  return (
    <div>
      <PageHeader title="تقييم الأداء" icon={<Gauge className="h-6 w-6" />}
        description="تقييمات دورية بمعايير قابلة للتعديل، مرئية للموظف ومشرفه فقط. لا يوجد ترتيب علني للموظفين."
        actions={canManage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>تقييم جديد</Button>} />
      <DataTable resource="reviews" defaultSort="-period_end" archivedToggle={canManage} onRowClick={(r: any) => setOpen(r.id)}
        searchPlaceholder="ابحث باسم الموظف أو رقمه…"
        filters={[{ key: 'status', label: 'الحالة', options: options('review_status') }, ...(auth.isManager ? [{ key: 'site_id', label: 'الموقع', options: sites.options }] : [])]}
        columns={[
          { key: 'employee_name', header: 'الموظف', sortKey: 'employee_name', mobile: 'title', render: (r: any) => <div><div className="font-medium">{r.employee_name} <DemoBadge show={r.is_demo} /></div><div className="text-xs text-muted">{r.employee_number} · {r.site_name}</div></div> },
          { key: 'period_end', header: 'الفترة', sortKey: 'period_end', render: (r: any) => `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}` },
          { key: 'reviewer_name', header: 'المقيّم' },
          { key: 'status', header: 'الحالة', sortKey: 'status', render: (r: any) => <ReviewStatus v={r.status} /> },
        ]}
        empty={{ title: 'لا توجد تقييمات', description: canManage ? 'أنشئ تقييمًا لموظف ضمن نطاقك.' : 'تظهر هنا تقييماتك بعد إرسالها من المشرف.' }} />
      <FormModal open={creating} onClose={() => setCreating(false)} title="تقييم أداء جديد" submitLabel="إنشاء"
        initial={{ period_start: `${y}-01-01`, period_end: `${y}-12-31` }}
        fields={[
          { name: 'employee_id', label: 'الموظف', type: 'select', required: true, options: emps.options },
          { name: 'period_start', label: 'بداية الفترة', type: 'date', required: true },
          { name: 'period_end', label: 'نهاية الفترة', type: 'date', required: true },
        ]}
        onSubmit={(p) => create.mutateAsync(p)} />
      {openId && <ReviewDetail id={openId} onClose={() => setOpen(null)} />}
    </div>
  );
}
