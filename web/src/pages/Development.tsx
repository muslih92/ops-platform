import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardPlus, GraduationCap, MessageSquare, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useEmployeesDir, useList, useOptions, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { CrudTable } from '@/components/CrudTable';
import { FormModal } from '@/components/EntityForm';
import { Alert, Badge, Button, DemoBadge, Field, IconButton, Modal, PageHeader, Progress, Select, Spinner, Tabs, Textarea } from '@/components/ui';
import { PlanStatus, SkillLevel } from '@/components/StatusBadges';
import { NewTaskModal } from './Tasks';

function Plans({ employee }: { employee?: string | null }) {
  const auth = useAuth();
  const sites = useSites();
  const emps = useEmployeesDir();
  const skills = useOptions('skills', { sort: 'name' });
  const courses = useOptions('training_courses', { sort: '-start_date' });
  const canWrite = auth.can('training.manage') && auth.isManager;
  const [taskFor, setTaskFor] = useState<any>(null);
  const [commentFor, setCommentFor] = useState<any>(null);
  const [comment, setComment] = useState('');
  const late = useList('development_plans', { filters: { is_late: true, ...(employee ? { employee_id: employee } : {}) }, pageSize: 1 });
  const saveComment = useAction(() => api.rpc('plan_employee_comment', { plan_id: commentFor.id, comment }), { success: 'تم حفظ تعليقك', onSuccess: () => setCommentFor(null) });
  const myEmp = auth.me?.employee?.id;
  return (
    <>
      {(late.data?.total ?? 0) > 0 && <Alert tone="warning" className="mb-3" title={`${late.data!.total} خطة تطوير متأخرة`}>تجاوزت تاريخ الانتهاء دون اكتمال. راجعها مع الموظف وحدّث الحالة أو التاريخ.</Alert>}
      <CrudTable resource="development_plans" title="خطة تطوير" createLabel="خطة جديدة" archiveNoun="الخطة" canWrite={canWrite} defaultSort="end_date"
        baseFilters={employee ? { employee_id: employee } : undefined} modalSize="lg"
        searchPlaceholder="ابحث باسم الموظف أو الهدف أو المهارة…"
        filters={[
          { key: 'status', label: 'الحالة', options: options('plan_status') },
          { key: 'method', label: 'الطريقة', options: options('plan_method') },
          { key: 'site_id', label: 'الموقع', options: sites.options },
          { key: 'is_late', label: 'متأخرة', type: 'bool' },
        ]}
        newDefaults={{ status: 'planned', method: 'on_job', progress: 0, employee_id: employee || undefined }}
        columns={[
          { key: 'employee_name', header: 'الموظف', sortKey: 'employee_name', mobile: 'title', render: (r: any) => <div><Link className="font-medium hover:underline" to={`/employees/${r.employee_id}`}>{r.employee_name}</Link> <DemoBadge show={r.is_demo} /><div className="text-xs text-muted">{r.site_name}</div></div> },
          { key: 'goal', header: 'الهدف', render: (r: any) => <div className="min-w-[200px]"><div>{r.goal}</div><div className="text-xs text-muted">{r.target_skill_name || ''} · {label('plan_method', r.method)}{r.mentor_name ? ` · الموجّه: ${r.mentor_name}` : ''}</div></div> },
          { key: 'end_date', header: 'الفترة', sortKey: 'end_date', render: (r: any) => <span className={r.is_late ? 'font-semibold text-danger' : ''}>{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</span> },
          { key: 'progress', header: 'التقدم', sortKey: 'progress', render: (r: any) => <div className="w-28"><Progress value={r.progress} /><span className="text-xs num">{r.progress}%</span></div> },
          { key: 'level', header: 'المستوى قبل/بعد', render: (r: any) => <span className="flex gap-1"><SkillLevel v={r.level_before} compact /><SkillLevel v={r.level_after} compact /></span> },
          { key: 'status', header: 'الحالة', sortKey: 'status', render: (r: any) => <div className="flex flex-wrap gap-1"><PlanStatus v={r.status} />{r.is_late && <Badge tone="danger">متأخرة</Badge>}</div> },
        ]}
        extraRowActions={(r: any) => (<>
          {canWrite && !r.archived_at && auth.can('tasks.create') && <IconButton label="إنشاء مهمة مرتبطة بالخطة" onClick={() => setTaskFor(r)}><ClipboardPlus className="h-4 w-4" /></IconButton>}
          {r.employee_id === myEmp && <IconButton label="إضافة تعليقي" onClick={() => { setCommentFor(r); setComment(r.employee_comment || ''); }}><MessageSquare className="h-4 w-4" /></IconButton>}
        </>)}
        fields={[
          { name: 'employee_id', label: 'الموظف', type: 'select', required: true, options: emps.options },
          { name: 'goal', label: 'هدف التطوير', required: true, maxLength: 500 },
          { name: 'target_skill_id', label: 'المهارة المستهدفة', type: 'select', options: skills.options },
          { name: 'method', label: 'طريقة التطوير', type: 'select', required: true, options: options('plan_method') },
          { name: 'mentor_employee_id', label: 'الموظف الموجّه (المتمكن)', type: 'select', options: emps.options, show: (v) => ['mentoring', 'on_job', 'task_participation'].includes(v.method) },
          { name: 'course_id', label: 'الدورة', type: 'select', options: courses.options, show: (v) => v.method === 'course' },
          { name: 'start_date', label: 'تاريخ البدء', type: 'date' },
          { name: 'end_date', label: 'تاريخ الانتهاء المستهدف', type: 'date' },
          { name: 'status', label: 'الحالة', type: 'select', required: true, options: options('plan_status') },
          { name: 'progress', label: 'نسبة التقدم %', type: 'number', min: 0, max: 100 },
          { name: 'level_before', label: 'المستوى قبل', type: 'select', options: options('skill_level') },
          { name: 'level_after', label: 'المستوى بعد التقييم العملي', type: 'select', options: options('skill_level') },
          { name: 'practical_result', label: 'نتيجة التقييم العملي', type: 'textarea', hint: 'إتمام الدورة وحده لا يرفع المستوى؛ وثّق الأداء العملي' },
          { name: 'supervisor_comment', label: 'تعليق المشرف', type: 'textarea' },
        ]}
        toPayload={(p) => ({ ...p, level_before: p.level_before ? Number(p.level_before) : null, level_after: p.level_after ? Number(p.level_after) : null })} />
      <NewTaskModal open={!!taskFor} onClose={() => setTaskFor(null)} defaults={taskFor ? { development_plan_id: taskFor.id, type: 'training', owner_employee_id: taskFor.employee_id, title: `تطبيق عملي: ${taskFor.goal}`.slice(0, 200) } : undefined} />
      <Modal open={!!commentFor} onClose={() => setCommentFor(null)} title="تعليقي على خطة التطوير" size="sm"
        footer={<><Button variant="secondary" onClick={() => setCommentFor(null)}>إلغاء</Button><Button loading={saveComment.isPending} onClick={() => saveComment.mutate()}>حفظ</Button></>}>
        <Field label="التعليق">{(id) => <Textarea id={id} value={comment} onChange={(e) => setComment(e.target.value)} rows={4} />}</Field>
      </Modal>
    </>
  );
}

function Enrollments({ course, onClose }: { course: any; onClose: () => void }) {
  const auth = useAuth();
  const emps = useEmployeesDir();
  const [emp, setEmp] = useState('');
  const q = useList('training_enrollments', { filters: { course_id: course.id }, pageSize: 200, sort: 'employee_name' });
  const canWrite = auth.can('training.manage');
  const add = useAction(() => api.create('training_enrollments', { course_id: course.id, employee_id: emp, status: 'nominated' }), { success: 'تم ترشيح الموظف', onSuccess: () => setEmp('') });
  const upd = useAction(({ id, p }: { id: string; p: any }) => api.update('training_enrollments', id, p), { success: 'تم التحديث' });
  const rows = q.data?.rows ?? [];
  return (
    <Modal open onClose={onClose} title={`المرشحون – ${course.name}`} size="lg">
      <Alert tone="info" className="mb-3">حضور الدورة لا يعني اكتساب المهارة. يُحدَّث مستوى المهارة فقط بعد تقييم عملي من المشرف في مصفوفة المهارات.</Alert>
      {canWrite && (
        <div className="mb-3 flex gap-2">
          <Select aria-label="ترشيح موظف" value={emp} onChange={(e) => setEmp(e.target.value)} options={emps.options.filter((o) => !rows.some((r: any) => r.employee_id === o.value))} placeholder="اختر موظفًا للترشيح" />
          <Button disabled={!emp} loading={add.isPending} onClick={() => add.mutate()}>ترشيح</Button>
        </div>
      )}
      {q.isLoading ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-muted">لا يوجد مرشحون.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr><th className="th">الموظف</th><th className="th">الموقع</th><th className="th">الحالة</th><th className="th">النتيجة</th></tr></thead>
          <tbody>{rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border">
              <td className="td">{r.employee_name}<div className="text-xs text-muted">{r.employee_number}</div></td>
              <td className="td">{r.site_name}</td>
              <td className="td">{canWrite ? <Select aria-label="الحالة" value={r.status} onChange={(e) => upd.mutate({ id: r.id, p: { status: e.target.value } })} options={options('enrollment_status')} /> : label('enrollment_status', r.status)}</td>
              <td className="td">{canWrite ? <input className="input" defaultValue={r.result || ''} aria-label="النتيجة" placeholder="مثال: اجتاز الاختبار النظري" onBlur={(e) => e.target.value !== (r.result || '') && upd.mutate({ id: r.id, p: { result: e.target.value || null } })} /> : r.result || '—'}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </Modal>
  );
}

function Courses() {
  const auth = useAuth();
  const skills = useOptions('skills', { sort: 'name' });
  const [course, setCourse] = useState<any>(null);
  return (
    <>
      <CrudTable resource="training_courses" title="دورة" createLabel="إضافة دورة" archiveNoun="الدورة" canWrite={auth.can('training.manage')} defaultSort="-start_date"
        searchPlaceholder="ابحث باسم الدورة أو الجهة أو المكان…"
        columns={[
          { key: 'name', header: 'الدورة', sortKey: 'name', mobile: 'title', render: (r: any) => <span className="font-medium">{r.name} <DemoBadge show={r.is_demo} /></span> },
          { key: 'provider', header: 'الجهة' },
          { key: 'start_date', header: 'التاريخ', sortKey: 'start_date', render: (r: any) => `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` },
          { key: 'skill_names', header: 'المهارات المرتبطة', render: (r: any) => (r.skill_names || []).join('، ') || '—' },
          { key: 'enrolled_count', header: 'المرشحون', render: (r: any) => <span className="num">{r.enrolled_count}</span> },
        ]}
        extraRowActions={(r: any) => <IconButton label="المرشحون والحضور" onClick={() => setCourse(r)}><Users className="h-4 w-4" /></IconButton>}
        fields={[
          { name: 'name', label: 'اسم الدورة', required: true, maxLength: 200 },
          { name: 'provider', label: 'الجهة المقدمة' },
          { name: 'start_date', label: 'تاريخ البدء', type: 'date' },
          { name: 'end_date', label: 'تاريخ الانتهاء', type: 'date' },
          { name: 'location', label: 'المكان' },
          { name: 'skill_ids', label: 'المهارات المرتبطة', type: 'multiselect', options: skills.options, wide: true },
          { name: 'description', label: 'الوصف', type: 'textarea' },
        ]} />
      {course && <Enrollments course={course} onClose={() => setCourse(null)} />}
    </>
  );
}

type Tab = 'plans' | 'courses';
export default function Development() {
  const [sp] = useSearchParams();
  const employee = sp.get('employee');
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'plans');
  return (
    <div>
      <PageHeader title="التطوير والتدريب" icon={<GraduationCap className="h-6 w-6" />}
        description="خطط تطوير فردية مرتبطة بالمهارات، والدورات والترشيحات، مع التمييز بين الحضور والتمكن العملي." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'plans', label: 'خطط التطوير' }, { value: 'courses', label: 'الدورات والترشيحات' }]} />
      {employee && tab === 'plans' && <Alert tone="info" className="mb-3">معروض لموظف محدد. <Link to="/development" className="underline">عرض الكل</Link></Alert>}
      {tab === 'plans' ? <Plans employee={employee} /> : <Courses />}
    </div>
  );
}
