import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, Paperclip, Pencil, Plus, UserCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useList, useOne, useOptions } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDate, fmtDateTime, todayISO } from '@/lib/format';
import { Alert, Badge, Button, Card, Checkbox, DemoBadge, EmptyState, ErrorState, IconButton, KV, Modal, PageHeader, Progress, Spinner, Tabs, Textarea } from '@/components/ui';
import { FormModal } from '@/components/EntityForm';
import { Attachments } from '@/components/Attachments';
import { Criticality, IdeaStatus, LeaveStatus, PlanStatus, Priority, SkillLevel, TaskStatus } from '@/components/StatusBadges';
import { employeeFields, useEmployeeFieldOptions } from './Employees';

type Tab = 'info' | 'skills' | 'strengths' | 'tasks' | 'development' | 'leaves' | 'reviews' | 'files';

export default function EmployeeProfile() {
  const { id } = useParams();
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('info');
  const q = useOne('employees', id);
  const e = q.data;
  const isSelf = auth.me?.employee?.id === id;
  const canEdit = auth.can('employees.manage') && auth.isManager;

  if (q.isLoading) return <Spinner />;
  if (q.isError || !e) return <ErrorState error={q.error || { message: 'غير موجود', status: 404 }} />;

  return (
    <div>
      <PageHeader title={e.full_name} icon={<UserCircle2 className="h-6 w-6" />}
        description={`${e.employee_number} · ${e.job_title || '—'} · ${e.site_name || 'بدون موقع'}${e.shift_name ? ' · ' + e.shift_name : ''}`}
        actions={<>{e.is_demo && <DemoBadge />}{e.archived_at && <Badge tone="warning">مؤرشف</Badge>}
          <Badge tone={e.status === 'active' ? 'success' : 'warning'}>{label('employee_status', e.status)}</Badge></>} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'info', label: 'البيانات' }, { value: 'skills', label: 'المهارات' }, { value: 'strengths', label: 'نقاط القوة والمبادرات' },
        { value: 'tasks', label: 'المهام' }, { value: 'development', label: 'التدريب والتطوير' }, { value: 'leaves', label: 'الإجازات' },
        { value: 'reviews', label: 'التقييمات' }, { value: 'files', label: 'المرفقات' },
      ]} />
      {tab === 'info' && <InfoTab e={e} canEdit={canEdit} />}
      {tab === 'skills' && <SkillsTab e={e} isSelf={isSelf} />}
      {tab === 'strengths' && <StrengthsTab e={e} isSelf={isSelf} canEdit={canEdit} />}
      {tab === 'tasks' && <TasksTab id={e.id} />}
      {tab === 'development' && <DevTab id={e.id} />}
      {tab === 'leaves' && <LeavesTab id={e.id} />}
      {tab === 'reviews' && <ReviewsTab id={e.id} />}
      {tab === 'files' && <Card><Attachments entityType="employee" entityId={e.id} canUpload={canEdit || isSelf} canArchive={canEdit} /></Card>}
    </div>
  );
}

function InfoTab({ e, canEdit }: { e: any; canEdit: boolean }) {
  const auth = useAuth();
  const [edit, setEdit] = useState(false);
  const [editPriv, setEditPriv] = useState(false);
  const fo = useEmployeeFieldOptions(e.primary_site_id);
  const priv = useList('employee_private', { filters: { employee_id: e.id } });
  const p = priv.data?.rows?.[0];
  const save = useAction((v: any) => api.update('employees', e.id, v), { success: 'تم حفظ بيانات الموظف' });
  const savePriv = useAction((v: any) => (p ? api.update('employee_private', e.id, v) : api.create('employee_private', { ...v, employee_id: e.id })), { success: 'تم حفظ بيانات الاتصال' });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="البيانات الوظيفية" className="lg:col-span-2" actions={canEdit && <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>تعديل</Button>}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KV label="الرقم الوظيفي"><span className="num">{e.employee_number}</span></KV>
          <KV label="المسمى الوظيفي">{e.job_title}</KV>
          <KV label="الإدارة / القسم">{e.department_name}</KV>
          <KV label="الموقع الأساسي">{e.site_name}</KV>
          <KV label="الخط">{e.line_name}</KV>
          <KV label="الوردية">{e.shift_name}</KV>
          <KV label="المدير المباشر">{e.manager_name}</KV>
          <KV label="تاريخ التعيين">{fmtDate(e.hire_date)}</KV>
          <KV label="الحالة">{label('employee_status', e.status)}</KV>
        </dl>
        <dl className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
          <KV label="المؤهلات"><span className="whitespace-pre-line font-normal">{e.qualifications || '—'}</span></KV>
          <KV label="الشهادات والدورات"><span className="whitespace-pre-line font-normal">{e.certifications || '—'}</span></KV>
          <KV label="الخبرات السابقة"><span className="whitespace-pre-line font-normal">{e.previous_experience || '—'}</span></KV>
        </dl>
      </Card>
      <Card title="بيانات الاتصال والملاحظات الإدارية" actions={canEdit && priv.isSuccess ? <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditPriv(true)}>تعديل</Button> : null}>
        {priv.isLoading ? <Spinner /> : !p && !canEdit ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Lock className="h-4 w-4" /> محجوبة حسب الصلاحية</div>
        ) : (
          <dl className="space-y-3">
            <KV label="رقم التواصل"><span className="ltr">{p?.phone || '—'}</span></KV>
            <KV label="البريد الإلكتروني"><span className="ltr">{p?.email || '—'}</span></KV>
            {(auth.can('employees.view_private')) && <KV label="ملاحظات إدارية"><span className="whitespace-pre-line font-normal">{p?.admin_notes || '—'}</span></KV>}
          </dl>
        )}
      </Card>
      <FormModal open={edit} onClose={() => setEdit(false)} title="تعديل بيانات الموظف" size="lg" fields={employeeFields(fo)} initial={e} onSubmit={(v) => save.mutateAsync(v)} />
      <FormModal open={editPriv} onClose={() => setEditPriv(false)} title="بيانات الاتصال" initial={p}
        fields={[{ name: 'phone', label: 'رقم التواصل', type: 'tel' }, { name: 'email', label: 'البريد الإلكتروني', type: 'email' }, { name: 'admin_notes', label: 'ملاحظات إدارية (لا تظهر للموظف إلا ضمن ملفه)', type: 'textarea' }]}
        onSubmit={(v) => savePriv.mutateAsync(v)} />
    </div>
  );
}

function SkillsTab({ e, isSelf }: { e: any; isSelf: boolean }) {
  const auth = useAuth();
  const [editing, setEditing] = useState<any>(null);
  const [selfOpen, setSelfOpen] = useState(false);
  const [filesFor, setFilesFor] = useState<any>(null);
  const q = useList('employee_skills', { filters: { employee_id: e.id }, pageSize: 200, sort: 'skill_name' });
  const skills = useOptions('skills', { label: (r) => `${r.name} (${r.domain_name})`, sort: 'domain_order' });
  const canAssess = auth.can('skills.assess') && !isSelf;
  const save = useAction((v: any) => (editing?.id ? api.update('employee_skills', editing.id, v) : api.create('employee_skills', v)), { success: 'تم حفظ التقييم' });
  const rows = q.data?.rows ?? [];
  const assessFields = [
    { name: 'skill_id', label: 'المهارة', type: 'select' as const, options: skills.options, required: true, disabled: !!editing?.id },
    { name: 'level', label: 'مستوى الكفاءة', type: 'select' as const, required: true, options: [1, 2, 3, 4].map((l) => ({ value: String(l), label: `${l} – ${label('skill_level', l)}` })) },
    { name: 'assessed_at', label: 'تاريخ التقييم', type: 'date' as const, required: true },
    { name: 'next_reassess_at', label: 'موعد إعادة التقييم', type: 'date' as const },
    { name: 'notes', label: 'ملاحظات المقيّم', type: 'textarea' as const },
  ];
  return (
    <Card title="مصفوفة مهارات الموظف" bodyClass="p-0" actions={<>
      {canAssess && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ assessed_at: todayISO() })}>تقييم مهارة</Button>}
      {isSelf && <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setSelfOpen(true)}>إضافة مهارة إضافية لدي</Button>}
    </>}>
      {q.isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="لا توجد مهارات مسجلة" description="يسجل المشرف مستوى المهارة وتاريخ التقييم والملاحظات." /> : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-2/60"><tr><th className="th">المهارة</th><th className="th">المستوى</th><th className="th">المقيّم / التاريخ</th><th className="th">إعادة التقييم</th><th className="th">ملاحظات</th><th className="th"></th></tr></thead>
            <tbody>
              {rows.map((s: any) => {
                const due = s.next_reassess_at && s.next_reassess_at <= todayISO(30);
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="td"><div className="font-medium">{s.skill_name}</div><div className="flex flex-wrap items-center gap-1 text-xs text-muted">{s.domain_name} {s.is_core && <Badge tone="accent">أساسية</Badge>} <Criticality v={s.criticality} /></div></td>
                    <td className="td"><SkillLevel v={s.level} />{s.source === 'self_reported' && <div className="mt-1"><Badge tone="warning">إفادة ذاتية – غير معتمدة</Badge></div>}</td>
                    <td className="td text-sm">{s.assessor_name || '—'}<div className="text-xs text-muted">{fmtDate(s.assessed_at)}</div></td>
                    <td className="td">{s.next_reassess_at ? <Badge tone={due ? 'warning' : 'neutral'}>{fmtDate(s.next_reassess_at)}</Badge> : '—'}</td>
                    <td className="td max-w-xs text-sm text-muted">{s.notes || '—'}</td>
                    <td className="td whitespace-nowrap">
                      <IconButton label="مرفقات داعمة" onClick={() => setFilesFor(s)}><Paperclip className="h-4 w-4" /></IconButton>
                      {canAssess && <IconButton label="تحديث التقييم" onClick={() => setEditing({ ...s, assessed_at: todayISO() })}><Pencil className="h-4 w-4" /></IconButton>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <FormModal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'تحديث تقييم المهارة' : 'تقييم مهارة'} fields={assessFields} initial={editing}
        onSubmit={(v) => save.mutateAsync({ ...v, level: Number(v.level), employee_id: e.id, assessor_id: auth.me!.user.id, source: 'assessment' })} />
      <FormModal open={selfOpen} onClose={() => setSelfOpen(false)} title="إضافة مهارة إضافية (إفادة ذاتية)"
        fields={[assessFields[0], { ...assessFields[1], label: 'تقديرك لمستواك' }, { name: 'notes', label: 'كيف اكتسبت المهارة؟', type: 'textarea' }]}
        onSubmit={(v) => save.mutateAsync({ ...v, level: Number(v.level), employee_id: e.id, source: 'self_reported' })}>
        {() => <Alert tone="info" className="mt-3">تظهر المهارة كإفادة ذاتية ولا تُحتسب ضمن البدلاء المؤهلين حتى يقيّمها المشرف.</Alert>}
      </FormModal>
      <Modal open={!!filesFor} onClose={() => setFilesFor(null)} title={`مرفقات: ${filesFor?.skill_name || ''}`}>
        {filesFor && <Attachments entityType="employee_skill" entityId={filesFor.id} canUpload={canAssess || isSelf} />}
      </Modal>
    </Card>
  );
}

const CAPS = options('capabilities');
function StrengthsTab({ e, isSelf, canEdit }: { e: any; isSelf: boolean; canEdit: boolean }) {
  const auth = useAuth();
  const [form, setForm] = useState({ strengths: e.strengths || '', interests: e.interests || '', desired_skills: e.desired_skills || '', specialization_wishes: e.specialization_wishes || '', capabilities: (e.capabilities || []) as string[] });
  const [rec, setRec] = useState(e.supervisor_recommendation || '');
  const ideas = useList('ideas', { filters: { submitted_by_employee_id: e.id }, pageSize: 50 });
  const owned = useList('ideas', { filters: { owner_employee_id: e.id }, pageSize: 50 });
  const saveSelf = useAction(() => api.rpc('update_my_profile', { profile: form }), { success: 'تم حفظ بياناتك' });
  const saveMgr = useAction(() => api.update('employees', e.id, form), { success: 'تم الحفظ' });
  const saveRec = useAction(() => api.rpc('set_recommendation', { employee_id: e.id, text: rec }), { success: 'تم حفظ التوصية' });
  const editable = isSelf || canEdit;
  const canRecommend = (auth.can('skills.assess') || auth.can('employees.manage')) && auth.isManager && !isSelf;
  const allIdeas = [...(ideas.data?.rows ?? []), ...(owned.data?.rows ?? []).filter((x: any) => !(ideas.data?.rows ?? []).some((y: any) => y.id === x.id))];
  const field = (k: keyof typeof form, l: string, hint?: string) => (
    <div>
      <label className="label" htmlFor={`st-${k}`}>{l}</label>
      <Textarea id={`st-${k}`} disabled={!editable} value={form[k] as string} onChange={(ev) => setForm({ ...form, [k]: ev.target.value })} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="نقاط القوة والاهتمامات">
        <div className="space-y-4">
          {field('strengths', 'نقاط القوة والمهارات الإضافية')}
          {field('interests', 'الاهتمامات')}
          {field('specialization_wishes', 'المجالات التي يرغب في التخصص فيها')}
          {field('desired_skills', 'المهارات التي يرغب في تعلمها')}
          <div>
            <div className="label">القدرات</div>
            <div className="flex flex-wrap gap-x-4">{CAPS.map((c) => <Checkbox key={c.value} label={c.label} disabled={!editable} checked={form.capabilities.includes(c.value)} onChange={(v) => setForm({ ...form, capabilities: v ? [...form.capabilities, c.value] : form.capabilities.filter((x) => x !== c.value) })} />)}</div>
          </div>
          {editable && <Button loading={saveSelf.isPending || saveMgr.isPending} onClick={() => (isSelf ? saveSelf.mutate() : saveMgr.mutate())}>حفظ</Button>}
        </div>
      </Card>
      <div className="space-y-4">
        <Card title="توصية المشرف بفرص مناسبة لتفعيل قدراته">
          {canRecommend ? (
            <div className="space-y-2">
              <Textarea value={rec} onChange={(ev) => setRec(ev.target.value)} placeholder="مثال: إشراكه في إعداد التقرير الشهري، أو تكليفه بتدريب الموظفين الجدد على SCADA" aria-label="توصية المشرف" />
              <Button size="sm" loading={saveRec.isPending} onClick={() => saveRec.mutate()}>حفظ التوصية</Button>
            </div>
          ) : <p className="whitespace-pre-line text-sm">{e.supervisor_recommendation || 'لا توجد توصية بعد.'}</p>}
        </Card>
        <Card title="أفكار التحسين والمبادرات" actions={<Link to="/initiatives" className="text-sm text-accent hover:underline">سجل المبادرات</Link>} bodyClass="p-0">
          {allIdeas.length === 0 ? <EmptyState title="لا توجد مبادرات مسجلة" /> : (
            <ul className="divide-y divide-border">{allIdeas.map((i: any) => (
              <li key={i.id} className="px-4 py-2.5"><Link to={`/initiatives?id=${i.id}`} className="flex items-center justify-between gap-2 hover:text-accent">
                <span className="text-sm font-medium">{i.title}</span><IdeaStatus v={i.status} /></Link>
                {i.outcome && <div className="text-xs text-muted">النتيجة: {i.outcome}</div>}</li>))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function TasksTab({ id }: { id: string }) {
  const q = useList('tasks', { filters: { owner_employee_id: id }, pageSize: 50, sort: '-created_at' });
  const rows = q.data?.rows ?? [];
  return (
    <Card title="سجل المهام" bodyClass="p-0">
      {q.isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="لا توجد مهام مسندة" /> : (
        <ul className="divide-y divide-border">{rows.map((t: any) => (
          <li key={t.id}><Link to={`/tasks/${t.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-surface-2">
            <span className="flex-1 text-sm font-medium">{t.title}</span><Priority v={t.priority} /><TaskStatus v={t.status} />
            {t.is_overdue && <Badge tone="danger">متأخرة</Badge>}<span className="text-xs text-muted">{fmtDateTime(t.due_at)}</span></Link></li>))}
        </ul>
      )}
      <Alert tone="info" className="m-3">لا يُستخدم عدد المهام وحده مقياسًا للأداء، والتأخير بسبب انتظار جهة أخرى موثق ولا يُحتسب على الموظف.</Alert>
    </Card>
  );
}

function DevTab({ id }: { id: string }) {
  const plans = useList('development_plans', { filters: { employee_id: id }, pageSize: 50 });
  const enr = useList('training_enrollments', { filters: { employee_id: id }, pageSize: 50 });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="خطط التطوير الفردية" actions={<Link to={`/development?employee=${id}`} className="text-sm text-accent hover:underline">إدارة الخطط</Link>} bodyClass="p-0">
        {(plans.data?.rows ?? []).length === 0 ? <EmptyState title="لا توجد خطط تطوير" /> : (
          <ul className="divide-y divide-border">{plans.data!.rows.map((p: any) => (
            <li key={p.id} className="space-y-1 px-4 py-3">
              <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{p.goal}</span><PlanStatus v={p.is_late && p.status !== 'completed' ? 'overdue' : p.status} /></div>
              <div className="text-xs text-muted">{p.target_skill_name} · {label('plan_method', p.method)} · {fmtDate(p.start_date)} – {fmtDate(p.end_date)}</div>
              <Progress value={p.progress} />
              {(p.level_before || p.level_after) && <div className="text-xs">المستوى: قبل <SkillLevel v={p.level_before} compact /> بعد <SkillLevel v={p.level_after} compact /></div>}
            </li>))}</ul>
        )}
      </Card>
      <Card title="الدورات" bodyClass="p-0">
        {(enr.data?.rows ?? []).length === 0 ? <EmptyState title="لا توجد دورات" /> : (
          <ul className="divide-y divide-border">{enr.data!.rows.map((x: any) => (
            <li key={x.id} className="px-4 py-2.5"><div className="flex justify-between gap-2"><span className="text-sm font-medium">{x.course_name}</span><Badge>{label('enrollment_status', x.status)}</Badge></div>
              <div className="text-xs text-muted">{x.provider} · {fmtDate(x.start_date)}{x.result ? ` · النتيجة: ${x.result}` : ''}</div></li>))}</ul>
        )}
        <p className="m-3 text-xs text-muted">حضور الدورة لا يعني اكتساب المهارة؛ تُعتمد المهارة بعد التقييم العملي فقط.</p>
      </Card>
    </div>
  );
}

function LeavesTab({ id }: { id: string }) {
  const q = useList('leave_requests', { filters: { employee_id: id }, pageSize: 50, sort: '-created_at' });
  return (
    <Card title="سجل الإجازات" bodyClass="p-0">
      {(q.data?.rows ?? []).length === 0 ? <EmptyState title="لا توجد طلبات إجازة" /> : (
        <ul className="divide-y divide-border">{q.data!.rows.map((l: any) => (
          <li key={l.id}><Link to={`/leaves?id=${l.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-surface-2">
            <span className="flex-1 text-sm font-medium">{l.leave_type_name}</span><span className="text-xs text-muted">{fmtDate(l.start_date)} – {fmtDate(l.end_date)} ({l.days} يوم)</span><LeaveStatus v={l.status} /></Link></li>))}</ul>
      )}
    </Card>
  );
}

function ReviewsTab({ id }: { id: string }) {
  const q = useList('reviews', { filters: { employee_id: id }, pageSize: 50 });
  return (
    <Card title="التقييمات الدورية" bodyClass="p-0">
      {(q.data?.rows ?? []).length === 0 ? <EmptyState title="لا توجد تقييمات متاحة" description="تظهر التقييمات للموظف بعد إرسالها من المشرف." /> : (
        <ul className="divide-y divide-border">{q.data!.rows.map((r: any) => (
          <li key={r.id}><Link to={`/performance?id=${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-surface-2">
            <span className="flex-1 text-sm font-medium">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</span>
            {r.overall_rating_name && <Badge tone="accent">{r.overall_rating_name}</Badge>}<Badge>{label('review_status', r.status)}</Badge></Link></li>))}</ul>
      )}
    </Card>
  );
}
