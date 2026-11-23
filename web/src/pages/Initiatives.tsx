import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardPlus, Eye, Lightbulb, Plus, UserMinus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useEmployeesDir, useList, useOne, useOptions, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { CrudTable } from '@/components/CrudTable';
import { FormModal } from '@/components/EntityForm';
import { Attachments } from '@/components/Attachments';
import { Badge, Button, DemoBadge, IconButton, Input, KV, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { IdeaStatus, TaskStatus } from '@/components/StatusBadges';
import { NewTaskModal } from './Tasks';

function IdeaDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const auth = useAuth();
  const q = useOne('ideas', id);
  const r = q.data;
  const emps = useEmployeesDir();
  const parts = useList('idea_participants', { filters: { idea_id: id }, pageSize: 100 });
  const tasks = useList('tasks', { filters: { initiative_id: id }, pageSize: 50, sort: '-created_at' });
  const [emp, setEmp] = useState('');
  const [role, setRole] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const canManage = auth.can('ideas.manage') && auth.isManager;
  const add = useAction(() => api.create('idea_participants', { idea_id: id, employee_id: emp, role: role || null }), { success: 'تمت إضافة المشارك', onSuccess: () => { setEmp(''); setRole(''); } });
  const rm = useAction((e: string) => api.remove('idea_participants', { idea_id: id, employee_id: e }), { success: 'تمت الإزالة' });
  const empName = (eid: string) => emps.rows.find((e: any) => e.id === eid)?.full_name || '—';
  return (
    <Modal open onClose={onClose} title={r ? r.title : 'المبادرة'} size="lg">
      {!r ? <Spinner /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2"><IdeaStatus v={r.status} /><Badge tone="info">{label('idea_kind', r.kind)}</Badge><DemoBadge show={r.is_demo} /></div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KV label="مقدمها">{r.submitted_by_name}</KV><KV label="المسؤول">{r.owner_name}</KV><KV label="الموقع">{r.site_name || 'عام'}</KV>
            <KV label="تاريخ التقديم">{fmtDate(r.created_at)}</KV>
            {r.linked_plan_id && <KV label="خطة تطوير مرتبطة">{r.linked_plan_goal}</KV>}
          </dl>
          {[['المشكلة أو الفرصة', r.problem], ['المقترح', r.proposal], ['النتيجة والأثر', r.outcome]].map(([t, v]) => v ? <div key={t}><div className="text-xs font-semibold text-muted">{t}</div><p className="whitespace-pre-line text-sm">{v}</p></div> : null)}
          <div>
            <h3 className="mb-2 text-sm font-semibold">المشاركون</h3>
            <ul className="mb-2 divide-y divide-border">{(parts.data?.rows ?? []).map((p: any) => (
              <li key={p.employee_id} className="flex items-center justify-between py-1 text-sm"><span>{empName(p.employee_id)} {p.role && <span className="text-xs text-muted">· {p.role}</span>}</span>
                {canManage && <IconButton label="إزالة" onClick={() => rm.mutate(p.employee_id)}><UserMinus className="h-4 w-4" /></IconButton>}</li>))}
              {(parts.data?.rows ?? []).length === 0 && <li className="text-sm text-muted">لا يوجد مشاركون.</li>}
            </ul>
            {canManage && <div className="flex flex-wrap gap-2"><div className="min-w-[200px] flex-1"><Select aria-label="موظف" value={emp} onChange={(e) => setEmp(e.target.value)} options={emps.options} placeholder="اختر موظفًا" /></div><div className="w-40"><Input aria-label="الدور" placeholder="الدور" value={role} onChange={(e) => setRole(e.target.value)} /></div><Button variant="secondary" disabled={!emp} onClick={() => add.mutate()} icon={<Plus className="h-4 w-4" />}>إضافة</Button></div>}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">المهام المرتبطة</h3>
              {canManage && auth.can('tasks.create') && <Button size="sm" variant="secondary" icon={<ClipboardPlus className="h-4 w-4" />} onClick={() => setTaskOpen(true)}>إنشاء مهمة</Button>}</div>
            <ul className="space-y-1 text-sm">{(tasks.data?.rows ?? []).map((t: any) => <li key={t.id}><Link className="text-accent hover:underline" to={`/tasks/${t.id}`}>{t.title}</Link> <TaskStatus v={t.status} /></li>)}
              {(tasks.data?.rows ?? []).length === 0 && <li className="text-muted">لا توجد مهام.</li>}</ul>
          </div>
          <Attachments entityType="idea" entityId={r.id} canUpload={!auth.isReportOnly} />
          <p className="text-xs text-muted">آخر تحديث: {fmtDateTime(r.updated_at)}</p>
        </div>
      )}
      <NewTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} defaults={r ? { initiative_id: r.id, type: 'improvement', site_id: r.site_id || undefined, owner_employee_id: r.owner_employee_id || undefined, title: r.title } : undefined} />
    </Modal>
  );
}

export default function Initiatives() {
  const auth = useAuth();
  const [sp, setSp] = useSearchParams();
  const sites = useSites();
  const emps = useEmployeesDir();
  const plans = useOptions('development_plans', { label: (r) => `${r.employee_name}: ${r.goal}`, enabled: auth.isManager });
  const [proposing, setProposing] = useState(false);
  const openId = sp.get('id');
  const setOpen = (id: string | null) => { const n = new URLSearchParams(sp); if (id) n.set('id', id); else n.delete('id'); setSp(n, { replace: true }); };
  const canManage = auth.can('ideas.manage') && auth.isManager;
  const myEmp = auth.me?.employee?.id;
  const submit = useAction((p: any) => api.create<any>('ideas', { ...p, submitted_by_employee_id: myEmp, status: 'submitted' }), { success: 'تم تقديم المقترح، شكرًا لمبادرتك', onSuccess: (r: any) => setOpen(r.id) });
  return (
    <div>
      <PageHeader title="المبادرات والتحسينات" icon={<Lightbulb className="h-6 w-6" />}
        description="أفكار التحسين والمبادرات والمهارات الإضافية التي يقدمها الفريق، ومتابعة تنفيذها وأثرها."
        actions={myEmp && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setProposing(true)}>قدّم فكرة أو مبادرة</Button>} />
      <CrudTable resource="ideas" title="مبادرة" createLabel="إضافة مبادرة" archiveNoun="المبادرة" canWrite={canManage} defaultSort="-created_at" modalSize="lg"
        searchPlaceholder="ابحث بالعنوان أو المشكلة أو المقترح أو مقدمها…"
        filters={[{ key: 'status', label: 'الحالة', options: options('idea_status') }, { key: 'kind', label: 'النوع', options: options('idea_kind') }, { key: 'site_id', label: 'الموقع', options: sites.options }]}
        newDefaults={{ status: 'approved', kind: 'initiative' }}
        onRowClick={(r: any) => setOpen(r.id)}
        extraRowActions={(r: any) => <IconButton label="عرض التفاصيل" onClick={() => setOpen(r.id)}><Eye className="h-4 w-4" /></IconButton>}
        columns={[
          { key: 'title', header: 'العنوان', sortKey: 'title', mobile: 'title', render: (r: any) => <div className="min-w-[200px]"><div className="font-medium">{r.title} <DemoBadge show={r.is_demo} /></div><div className="text-xs text-muted">{label('idea_kind', r.kind)}</div></div> },
          { key: 'submitted_by_name', header: 'مقدمها' },
          { key: 'site_name', header: 'الموقع', render: (r: any) => r.site_name || 'عام' },
          { key: 'owner_name', header: 'المسؤول' },
          { key: 'status', header: 'الحالة', sortKey: 'status', render: (r: any) => <IdeaStatus v={r.status} /> },
          { key: 'created_at', header: 'التاريخ', sortKey: 'created_at', render: (r: any) => fmtDate(r.created_at) },
        ]}
        fields={[
          { name: 'title', label: 'العنوان', required: true, maxLength: 200, wide: true },
          { name: 'kind', label: 'النوع', type: 'select', required: true, options: options('idea_kind') },
          { name: 'status', label: 'الحالة', type: 'select', required: true, options: options('idea_status') },
          { name: 'submitted_by_employee_id', label: 'مقدمها', type: 'select', options: emps.options },
          { name: 'owner_employee_id', label: 'المسؤول عن التنفيذ', type: 'select', options: emps.options },
          { name: 'site_id', label: 'الموقع', type: 'select', options: sites.options },
          { name: 'linked_plan_id', label: 'ربط بخطة تطوير', type: 'select', options: plans.options },
          { name: 'problem', label: 'المشكلة أو الفرصة', type: 'textarea' },
          { name: 'proposal', label: 'المقترح', type: 'textarea' },
          { name: 'outcome', label: 'النتيجة والأثر', type: 'textarea' },
        ]} />
      <FormModal open={proposing} onClose={() => setProposing(false)} title="تقديم فكرة أو مبادرة" submitLabel="تقديم" initial={{ kind: 'idea', site_id: auth.me?.employee?.primary_site_id }}
        fields={[
          { name: 'title', label: 'العنوان', required: true, maxLength: 200 },
          { name: 'kind', label: 'النوع', type: 'select', required: true, options: options('idea_kind') },
          { name: 'site_id', label: 'الموقع', type: 'select', options: sites.options },
          { name: 'problem', label: 'المشكلة أو الفرصة', type: 'textarea' },
          { name: 'proposal', label: 'المقترح', type: 'textarea', required: true },
        ]}
        onSubmit={(p) => submit.mutateAsync(p)} />
      {openId && <IdeaDetail id={openId} onClose={() => setOpen(null)} />}
    </div>
  );
}
