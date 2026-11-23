import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Archive, CheckCheck, ClipboardList, Link2, MessageSquare, Pencil, Plus, Send, UserMinus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useList, useOne, useOptions } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DemoBadge, EmptyState, ErrorState, Field, IconButton, KV, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { FormModal } from '@/components/EntityForm';
import { Attachments } from '@/components/Attachments';
import { Priority, TaskStatus } from '@/components/StatusBadges';
import { eventText } from './Dashboard';
import { taskFields, useTaskFormOptions } from './Tasks';

export default function TaskDetail() {
  const { id } = useParams();
  const auth = useAuth();
  const q = useOne('tasks', id);
  const t = q.data;
  const [edit, setEdit] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const o = useTaskFormOptions();
  const save = useAction((p: any) => api.update('tasks', id!, p), { success: 'تم تحديث المهمة' });
  const archive = useAction(() => api.archive('tasks', id!), { success: 'تمت أرشفة المهمة', onSuccess: () => setArchiveOpen(false) });

  if (q.isLoading) return <Spinner />;
  if (q.isError || !t) return <ErrorState error={q.error || { message: 'غير موجودة', status: 404 }} />;
  const me = auth.me!;
  const isManager = auth.can('tasks.manage') && auth.isManager;
  const isWorker = t.owner_employee_id === me.employee?.id || (t.assignee_ids || []).includes(me.employee?.id);
  const isReviewer = t.reviewer_user_id === me.user.id;
  const canProgress = (isManager || isWorker) && !t.archived_at;
  const closed = ['completed', 'cancelled'].includes(t.status);

  const toggleCheck = (i: number, done: boolean) => save.mutate({ checklist: t.checklist.map((c: any, j: number) => (j === i ? { ...c, done } : c)) });

  return (
    <div>
      <PageHeader title={t.title} icon={<ClipboardList className="h-6 w-6" />}
        description={`${label('task_type', t.type)} · ${t.site_name || 'بدون موقع'}${t.line_name ? ' · ' + t.line_name : ''}`}
        actions={<>
          {canProgress && <Button icon={<Send className="h-4 w-4" />} onClick={() => setStatusOpen(true)}>تحديث الحالة</Button>}
          {isReviewer && t.requires_review && t.status === 'completed' && !t.reviewed_at && (
            <Button variant="accent" icon={<CheckCheck className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate({ reviewed_at: new Date().toISOString() })}>اعتماد المهمة</Button>)}
          {isManager && !t.archived_at && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>تعديل</Button>}
          {isManager && !t.archived_at && <Button variant="secondary" icon={<Archive className="h-4 w-4" />} onClick={() => setArchiveOpen(true)}>أرشفة</Button>}
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TaskStatus v={t.status} /><Priority v={t.priority} />
        {t.is_overdue && <Badge tone="danger">متأخرة</Badge>}
        {t.recurrence !== 'none' && <Badge tone="accent">متكررة: {label('recurrence_kind', t.recurrence)}</Badge>}
        {t.recurrence_parent_id && <Link to={`/tasks/${t.recurrence_parent_id}`} className="text-xs text-accent underline">من مهمة متكررة</Link>}
        {t.requires_review && <Badge tone={t.reviewed_at ? 'success' : 'warning'}>{t.reviewed_at ? 'معتمدة' : 'تحتاج مراجعة'}</Badge>}
        {t.archived_at && <Badge tone="warning">مؤرشفة</Badge>}
        <DemoBadge show={t.is_demo} />
      </div>
      {t.status === 'waiting_other_party' && <Alert tone="warning" title="بانتظار جهة أخرى" className="mb-4">{t.blocked_reason} — هذا التأخير موثق ولا يُحتسب على الموظف.</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="التفاصيل">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <KV label="المسؤول">{t.owner_name}</KV>
              <KV label="المشرف">{t.supervisor_name}</KV>
              <KV label="المراجع">{t.reviewer_name}</KV>
              <KV label="تاريخ الإنشاء">{fmtDateTime(t.created_at)}</KV>
              <KV label="أنشأها">{t.created_by_name}</KV>
              <KV label="الاستحقاق"><span className={t.is_overdue ? 'text-danger' : ''}>{fmtDateTime(t.due_at)}</span></KV>
              <KV label="المعدة / النظام">{t.equipment}</KV>
              <KV label="تاريخ الإغلاق">{fmtDateTime(t.closed_at)}</KV>
              <KV label="أغلقها">{t.closed_by_name}</KV>
              {t.sap_notification_no && <KV label="بلاغ / أمر عمل SAP"><span className="ltr">{t.sap_notification_no}</span></KV>}
            </dl>
            {t.description && <p className="mt-4 whitespace-pre-line border-t border-border pt-4 text-sm leading-relaxed">{t.description}</p>}
          </Card>

          <Card title="قائمة التحقق">
            {(t.checklist || []).length === 0 ? <p className="text-sm text-muted">لا توجد خطوات محددة.</p> : (
              <>
                <ul>{t.checklist.map((c: any, i: number) => (
                  <li key={i}><Checkbox label={<span className={c.done ? 'text-muted line-through' : ''}>{c.text}</span>} checked={!!c.done} disabled={!canProgress || closed || save.isPending} onChange={(v) => toggleCheck(i, v)} /></li>))}</ul>
                <p className="mt-1 text-xs text-muted num">{t.checklist.filter((c: any) => c.done).length} من {t.checklist.length} مكتملة</p>
              </>
            )}
          </Card>

          <Comments taskId={t.id} canComment={!auth.isReportOnly && !t.archived_at} />
          <Card><Attachments entityType="task" entityId={t.id} canUpload={!auth.isReportOnly && !t.archived_at} canArchive={isManager} /></Card>
        </div>
        <div className="space-y-4">
          <Assignees task={t} canEdit={isManager && !t.archived_at} />
          <Links task={t} canAdd={!auth.isReportOnly && !t.archived_at} />
          <Timeline taskId={t.id} />
        </div>
      </div>

      <FormModal open={edit} onClose={() => setEdit(false)} title="تعديل المهمة" size="lg" fields={taskFields(o)} initial={t} onSubmit={(p) => save.mutateAsync(p)} />
      <StatusModal open={statusOpen} onClose={() => setStatusOpen(false)} task={t} isManager={isManager} onSave={(p) => save.mutateAsync(p)} />
      <ConfirmDialog open={archiveOpen} onClose={() => setArchiveOpen(false)} onConfirm={() => archive.mutate()} loading={archive.isPending} danger confirmLabel="أرشفة"
        title="أرشفة المهمة" message="ستُنقل المهمة إلى الأرشيف مع الاحتفاظ بكامل سجلها ومرفقاتها. يمكن استعادتها لاحقًا." />
    </div>
  );
}

function StatusModal({ open, onClose, task, isManager, onSave }: { open: boolean; onClose: () => void; task: any; isManager: boolean; onSave: (p: any) => Promise<unknown> }) {
  const [status, setStatus] = useState(task.status);
  const [reason, setReason] = useState(task.blocked_reason || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const opts = options('task_status').filter((o) => isManager || o.value !== 'cancelled');
  const submit = async () => {
    if (status === 'waiting_other_party' && !reason.trim()) { setErr('اذكر الجهة الأخرى وسبب الانتظار'); return; }
    setBusy(true);
    try { await onSave({ status, blocked_reason: reason || null }); onClose(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="تحديث حالة المهمة" size="sm" footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={submit}>حفظ</Button></>}>
      <div className="space-y-3">
        {err && <Alert tone="danger">{err}</Alert>}
        <Field label="الحالة" required>{(id) => <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)} options={opts} />}</Field>
        {(status === 'waiting_other_party' || task.blocked_reason) && (
          <Field label="سبب التعثر أو الانتظار" required={status === 'waiting_other_party'} hint="مثال: بانتظار قطعة غيار من قسم الصيانة">
            {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        )}
      </div>
    </Modal>
  );
}

function Comments({ taskId, canComment }: { taskId: string; canComment: boolean }) {
  const [body, setBody] = useState('');
  const q = useList('task_comments', { filters: { task_id: taskId }, pageSize: 200, sort: 'created_at' });
  const add = useAction(() => api.create('task_comments', { task_id: taskId, body }), { success: 'تمت إضافة التعليق', onSuccess: () => setBody('') });
  const rows = q.data?.rows ?? [];
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /> الملاحظات والتعليقات</span>}>
      {rows.length === 0 ? <p className="mb-3 text-sm text-muted">لا توجد تعليقات بعد.</p> : (
        <ul className="mb-3 space-y-3">{rows.map((c: any) => (
          <li key={c.id} className="rounded-md bg-surface-2 p-3"><div className="mb-1 text-xs text-muted"><b className="text-fg">{c.author_name}</b> · {fmtDateTime(c.created_at)}</div>
            <p className="whitespace-pre-line text-sm">{c.body}</p></li>))}</ul>
      )}
      {canComment && (
        <div className="space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="اكتب ملاحظة أو تحديثًا…" aria-label="تعليق جديد" maxLength={4000} />
          <Button size="sm" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate()}>إضافة تعليق</Button>
        </div>
      )}
    </Card>
  );
}

function Assignees({ task, canEdit }: { task: any; canEdit: boolean }) {
  const [emp, setEmp] = useState('');
  const q = useList('task_assignees', { filters: { task_id: task.id }, pageSize: 100 });
  const emps = useOptions('employee_directory', { label: (r) => `${r.full_name} – ${r.employee_number}`, sort: 'full_name', enabled: canEdit });
  const add = useAction(() => api.create('task_assignees', { task_id: task.id, employee_id: emp }), { success: 'تمت إضافة المشارك', onSuccess: () => setEmp('') });
  const rm = useAction((e: string) => api.remove('task_assignees', { task_id: task.id, employee_id: e }), { success: 'تمت الإزالة' });
  const rows = q.data?.rows ?? [];
  return (
    <Card title="الموظفون المشاركون">
      {rows.length === 0 ? <p className="text-sm text-muted">لا يوجد مشاركون.</p> : (
        <ul className="mb-2 divide-y divide-border">{rows.map((a: any) => (
          <li key={a.employee_id} className="flex items-center justify-between gap-2 py-1 text-sm"><span>{a.employee_name}</span>
            {canEdit && <IconButton label="إزالة" onClick={() => rm.mutate(a.employee_id)}><UserMinus className="h-4 w-4" /></IconButton>}</li>))}</ul>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <Select value={emp} onChange={(e) => setEmp(e.target.value)} options={emps.options.filter((o) => o.value !== task.owner_employee_id && !rows.some((r: any) => r.employee_id === o.value))} placeholder="اختر موظفًا" aria-label="إضافة مشارك" />
          <Button variant="secondary" disabled={!emp} loading={add.isPending} onClick={() => add.mutate()} icon={<Plus className="h-4 w-4" />}>إضافة</Button>
        </div>
      )}
    </Card>
  );
}

function Links({ task, canAdd }: { task: any; canAdd: boolean }) {
  const [open, setOpen] = useState(false);
  const q = useList('integration_records', { filters: { entity_type: 'task', entity_id: task.id }, pageSize: 50 });
  const add = useAction((p: any) => api.create('integration_records', { ...p, entity_type: 'task', entity_id: task.id }), { success: 'تم حفظ المرجع' });
  const rows = q.data?.rows ?? [];
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Link2 className="h-4 w-4" /> مراجع SAP / SCADA</span>} actions={canAdd && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>إضافة مرجع</Button>}>
      {rows.length === 0 ? <p className="text-sm text-muted">لا توجد مراجع مرتبطة.</p> : (
        <ul className="space-y-2">{rows.map((r: any) => (
          <li key={r.id} className="text-sm"><Badge tone="info">{label('integration_kind', r.kind)}</Badge> <span className="ltr font-medium">{r.external_ref}</span>
            {r.external_url && <a href={r.external_url} target="_blank" rel="noreferrer noopener" className="ms-1 text-accent underline">فتح</a>}
            <div className="text-xs text-muted">{r.source || ''} {r.event_time ? '· ' + fmtDateTime(r.event_time) : ''} · حالة المزامنة: {r.sync_status === 'manual' ? 'إدخال يدوي' : r.sync_status}</div></li>))}</ul>
      )}
      <FormModal open={open} onClose={() => setOpen(false)} title="إضافة مرجع خارجي" initial={{ kind: 'sap_pm' }}
        fields={[
          { name: 'kind', label: 'النظام', type: 'select', required: true, options: options('integration_kind').filter((o) => ['sap_pm', 'scada'].includes(o.value)) },
          { name: 'external_ref', label: 'رقم البلاغ / أمر العمل / الإنذار', required: true, maxLength: 100 },
          { name: 'external_url', label: 'الرابط (اختياري)', placeholder: 'https://' },
          { name: 'event_time', label: 'وقت الحدث', type: 'datetime' },
          { name: 'source', label: 'المصدر', placeholder: 'مثال: SCADA غرفة التحكم' },
          { name: 'notes', label: 'ملاحظات', type: 'textarea' },
        ]}
        onSubmit={(p) => add.mutateAsync(p)}>
        {() => <Alert tone="info" className="mt-3">يُحفظ المرجع يدويًا للتوثيق فقط. لا يوجد اتصال فعلي بـ SAP أو SCADA ما لم يُهيأ التكامل ويُعتمد.</Alert>}
      </FormModal>
    </Card>
  );
}

function Timeline({ taskId }: { taskId: string }) {
  const q = useList('task_events', { filters: { task_id: taskId }, pageSize: 200, sort: '-created_at' });
  const rows = q.data?.rows ?? [];
  return (
    <Card title="السجل الزمني">
      {rows.length === 0 ? <EmptyState title="لا توجد أحداث" /> : (
        <ol className="relative space-y-3 border-s border-border ps-4">
          {rows.map((e: any) => (
            <li key={e.id} className="relative">
              <span className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
              <div className="text-sm">{eventText(e)}</div>
              {e.event_type === 'status_changed' && e.note && <div className="text-xs text-warning">{e.note}</div>}
              <div className="text-xs text-muted">{e.actor_name || 'النظام'} · {fmtDateTime(e.created_at)}</div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
