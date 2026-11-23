import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, CheckCircle2, ClipboardPlus, Pencil, Plus, Printer, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useEmployeesDir, useList, useOne } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { Alert, Badge, Button, Card, DemoBadge, ErrorState, IconButton, KV, PageHeader, Spinner } from '@/components/ui';
import { FormModal } from '@/components/EntityForm';
import { Attachments } from '@/components/Attachments';
import { HandoverStatus } from './Handover';

export default function HandoverDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const auth = useAuth();
  const q = useOne('handover_reports', id);
  const items = useList('handover_items', { filters: { report_id: id }, pageSize: 200, sort: 'created_at' }, !!id);
  const emps = useEmployeesDir();
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toTask, setToTask] = useState<any>(null);
  const save = useAction((p: any) => api.update('handover_reports', id!, p), { success: 'تم الحفظ' });
  const confirm = useAction((side: 'outgoing' | 'incoming') => api.rpc('handover_confirm', { report_id: id, side }), { success: 'تم التأكيد' });
  const setItem = useAction(({ iid, status }: { iid: string; status: string }) => api.update('handover_items', iid, { status }), { success: 'تم تحديث البند' });
  const addItem = useAction((p: any) => api.create('handover_items', { ...p, report_id: id }), { success: 'تمت إضافة البند' });
  const convert = useAction((p: any) => api.rpc<string>('handover_item_to_task', { item_id: toTask.id, ...p }), { success: 'تم تحويل الملاحظة إلى مهمة', onSuccess: (tid) => nav(`/tasks/${tid}`) });

  if (q.isLoading) return <Spinner />;
  const r = q.data;
  if (q.isError || !r) return <ErrorState error={q.error || { message: 'غير موجود', status: 404 }} />;
  const myEmp = auth.me?.employee?.id;
  const manager = auth.isManager && (auth.isGlobal || auth.me?.supervisedSites.includes(r.site_id));
  const isOut = r.outgoing_employee_id === myEmp;
  const isIn = r.incoming_employee_id === myEmp;
  const editable = !r.archived_at && r.status === 'draft' && (isOut || manager || r.created_by === auth.me?.user.id);
  const rows = items.data?.rows ?? [];
  const canItems = !r.archived_at && !auth.isReportOnly;

  return (
    <div>
      <PageHeader title={`تسليم وردية – ${r.site_name}`} icon={<ArrowLeftRight className="h-6 w-6" />}
        description={`${fmtDateTime(r.handover_at)}${r.shift_name ? ' · ' + r.shift_name : ''}${r.line_name ? ' · ' + r.line_name : ''}`}
        actions={<>
          {!r.outgoing_confirmed_at && (isOut || manager) && <Button icon={<CheckCircle2 className="h-4 w-4" />} loading={confirm.isPending} onClick={() => confirm.mutate('outgoing')}>تأكيد التسليم</Button>}
          {r.outgoing_confirmed_at && !r.incoming_confirmed_at && (isIn || manager) && <Button variant="accent" icon={<CheckCircle2 className="h-4 w-4" />} loading={confirm.isPending} onClick={() => confirm.mutate('incoming')}>تأكيد الاستلام</Button>}
          {editable && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>تعديل</Button>}
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>طباعة</Button>
        </>} />
      <div className="mb-4 flex flex-wrap gap-2"><HandoverStatus v={r.status} /><DemoBadge show={r.is_demo} />{r.archived_at && <Badge tone="warning">مؤرشف</Badge>}</div>
      {r.status === 'submitted' && isIn && <Alert tone="info" className="mb-4" title="هذا التسليم بانتظار استلامك">راجع الملاحظات والبنود ثم أكد الاستلام.</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="بيانات التسليم">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <KV label="الموظف المسلّم">{r.outgoing_name}</KV>
              <KV label="الموظف المستلم">{r.incoming_name}</KV>
              <KV label="الموقع">{r.site_name}</KV>
              <KV label="تأكيد التسليم">{fmtDateTime(r.outgoing_confirmed_at)}</KV>
              <KV label="تأكيد الاستلام">{fmtDateTime(r.incoming_confirmed_at)}</KV>
              <KV label="عدد البنود"><span className="num">{r.items_count}</span></KV>
            </dl>
            {[['حالة الأنظمة', r.systems_status], ['ملاحظات عامة', r.general_notes], ['تعليمات للوردية التالية', r.next_shift_instructions]].map(([t, v]) => v ? (
              <div key={t} className="mt-4 border-t border-border pt-3"><div className="mb-1 text-xs font-semibold text-muted">{t}</div><p className="whitespace-pre-line text-sm">{v}</p></div>) : null)}
          </Card>

          <Card title="البنود والملاحظات" actions={canItems && (editable || manager || isOut || isIn) && <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>إضافة بند</Button>}>
            {rows.length === 0 ? <p className="text-sm text-muted">لا توجد بنود.</p> : (
              <ul className="divide-y divide-border">
                {rows.map((i: any) => (
                  <li key={i.id} className="flex flex-wrap items-start gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone="info">{label('handover_item_kind', i.kind)}</Badge>
                        <Badge tone={i.status === 'open' ? 'warning' : 'success'}>{label('open_closed', i.status)}</Badge>
                        {i.reference_no && <span className="text-xs text-muted">مرجع: <span className="ltr">{i.reference_no}</span></span>}
                      </div>
                      <p className="text-sm">{i.description}</p>
                      <div className="text-xs text-muted">{i.event_time ? `وقت الحدث ${fmtDateTime(i.event_time)}` : ''}{i.closed_at ? ` · أغلق ${fmtDateTime(i.closed_at)}` : ''}</div>
                      {i.linked_task_id && <Link className="text-xs text-accent underline" to={`/tasks/${i.linked_task_id}`}>المهمة المرتبطة ({label('task_status', i.task_status)})</Link>}
                    </div>
                    {canItems && (
                      <div className="flex gap-1">
                        {!i.linked_task_id && auth.can('tasks.create') && <Button size="sm" variant="ghost" icon={<ClipboardPlus className="h-4 w-4" />} onClick={() => setToTask(i)}>تحويل لمهمة</Button>}
                        {i.status === 'open'
                          ? <Button size="sm" variant="ghost" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setItem.mutate({ iid: i.id, status: 'closed' })}>إغلاق</Button>
                          : <IconButton label="إعادة فتح" onClick={() => setItem.mutate({ iid: i.id, status: 'open' })}><RotateCcw className="h-4 w-4" /></IconButton>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card><Attachments entityType="handover" entityId={r.id} canUpload={canItems} canArchive={manager} /></Card>
        </div>
      </div>

      <FormModal open={edit} onClose={() => setEdit(false)} title="تعديل التسليم" size="lg" initial={r}
        fields={[
          { name: 'handover_at', label: 'وقت التسليم', type: 'datetime', required: true },
          { name: 'incoming_employee_id', label: 'الموظف المستلم', type: 'select', options: emps.options },
          { name: 'systems_status', label: 'حالة الأنظمة', type: 'textarea', wide: true },
          { name: 'general_notes', label: 'ملاحظات عامة', type: 'textarea', wide: true },
          { name: 'next_shift_instructions', label: 'تعليمات للوردية التالية', type: 'textarea', wide: true },
        ]}
        onSubmit={(p) => save.mutateAsync(p)} />
      <FormModal open={adding} onClose={() => setAdding(false)} title="إضافة بند" initial={{ kind: 'followup' }}
        fields={[
          { name: 'kind', label: 'النوع', type: 'select', required: true, options: options('handover_item_kind') },
          { name: 'description', label: 'الوصف', type: 'textarea', required: true, maxLength: 2000 },
          { name: 'reference_no', label: 'رقم البلاغ / المرجع' },
          { name: 'event_time', label: 'وقت الحدث', type: 'datetime' },
        ]}
        onSubmit={(p) => addItem.mutateAsync(p)} />
      <FormModal open={!!toTask} onClose={() => setToTask(null)} title="تحويل الملاحظة إلى مهمة" submitLabel="إنشاء المهمة"
        initial={{ title: toTask?.description?.slice(0, 190), priority: 'normal' }}
        fields={[
          { name: 'title', label: 'عنوان المهمة', required: true, maxLength: 200 },
          { name: 'owner_employee_id', label: 'المسؤول', type: 'select', options: emps.options },
          { name: 'due_at', label: 'موعد الاستحقاق', type: 'datetime' },
          { name: 'priority', label: 'الأولوية', type: 'select', options: options('task_priority'), required: true },
        ]}
        onSubmit={(p) => convert.mutateAsync(p)} />
    </div>
  );
}
