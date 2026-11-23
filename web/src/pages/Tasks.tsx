import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Repeat, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useOptions, useSites, useUsersDir } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { DataTable } from '@/components/DataTable';
import { FormModal, type FieldDef } from '@/components/EntityForm';
import { Badge, Button, DemoBadge, IconButton, Input, MultiCheck, PageHeader, Tabs } from '@/components/ui';
import { Priority, TaskStatus } from '@/components/StatusBadges';

export function taskFields(o: { sites: any[]; lines: any[]; emps: any[]; users: any[] }): FieldDef[] {
  return [
    { name: 'title', label: 'العنوان', required: true, maxLength: 200, wide: true },
    { name: 'type', label: 'نوع المهمة', type: 'select', required: true, options: options('task_type') },
    { name: 'priority', label: 'الأولوية', type: 'select', required: true, options: options('task_priority') },
    { name: 'site_id', label: 'الموقع', type: 'select', options: o.sites, required: true },
    { name: 'line_id', label: 'الخط', type: 'select', options: o.lines },
    { name: 'equipment', label: 'المعدة أو النظام', placeholder: 'مثال: المضخة رقم 2، صمام المدخل' },
    { name: 'owner_employee_id', label: 'الموظف المسؤول', type: 'select', options: o.emps },
    { name: 'due_at', label: 'موعد الاستحقاق', type: 'datetime' },
    { name: 'reviewer_user_id', label: 'المراجع / المعتمد', type: 'select', options: o.users, show: (v) => !!v.requires_review },
    { name: 'requires_review', label: 'تحتاج مراجعة', type: 'checkbox', hint: 'المهمة تحتاج إلى مراجعة واعتماد بعد الإكمال' },
    { name: 'recurrence', label: 'التكرار', type: 'select', options: options('recurrence_kind'), hint: 'تُنشأ نسخة جديدة تلقائيًا كل فترة' },
    { name: 'sap_notification_no', label: 'رقم بلاغ / أمر عمل SAP (اختياري)', hint: 'حفظ مرجعي فقط – لا توجد مزامنة فعلية ما لم يُهيأ التكامل' },
    { name: 'description', label: 'الوصف', type: 'textarea' },
  ];
}

export function ChecklistEditor({ value, onChange }: { value: { text: string; done: boolean }[]; onChange: (v: { text: string; done: boolean }[]) => void }) {
  const [txt, setTxt] = useState('');
  return (
    <div className="mt-4">
      <div className="label">خطوات التنفيذ / قائمة التحقق</div>
      <ul className="mb-2 space-y-1">
        {value.map((c, i) => (
          <li key={i} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
            <span className="flex-1">{c.text}</span>
            <IconButton type="button" label="حذف الخطوة" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconButton>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="أضف خطوة…" aria-label="خطوة جديدة"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (txt.trim()) { onChange([...value, { text: txt.trim(), done: false }]); setTxt(''); } } }} />
        <Button type="button" variant="secondary" onClick={() => { if (txt.trim()) { onChange([...value, { text: txt.trim(), done: false }]); setTxt(''); } }}>إضافة</Button>
      </div>
    </div>
  );
}

export function useTaskFormOptions() {
  const sites = useSites();
  const lines = useOptions('lines', { label: (r) => `${r.name} – ${r.site_name}` });
  const emps = useOptions('employee_directory', { label: (r) => `${r.full_name} – ${r.employee_number}`, sort: 'full_name' });
  const users = useUsersDir();
  return { sites: sites.options, lines: lines.options, emps: emps.options, users: users.options };
}

export function NewTaskModal({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: Record<string, any> }) {
  const nav = useNavigate();
  const o = useTaskFormOptions();
  const [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const create = useAction((p: any) => api.rpc<string>('create_task', p), { success: 'تم إنشاء المهمة', onSuccess: (id) => nav(`/tasks/${id}`) });
  return (
    <FormModal open={open} onClose={() => { onClose(); setChecklist([]); setAssignees([]); }} title="مهمة جديدة" size="lg" submitLabel="إنشاء المهمة"
      fields={taskFields(o)} initial={{ type: 'operational', priority: 'normal', recurrence: 'none', ...defaults }}
      onSubmit={(p) => create.mutateAsync({ task: { ...p, checklist, ...(defaults?.initiative_id ? { initiative_id: defaults.initiative_id } : {}), ...(defaults?.development_plan_id ? { development_plan_id: defaults.development_plan_id } : {}) }, assignees })}>
      {(v) => (
        <>
          <ChecklistEditor value={checklist} onChange={setChecklist} />
          <div className="mt-4">
            <div className="label">الموظفون المشاركون</div>
            <MultiCheck options={o.emps.filter((e) => e.value !== v.owner_employee_id)} value={assignees} onChange={setAssignees} />
          </div>
        </>
      )}
    </FormModal>
  );
}

type View = 'all' | 'mine' | 'overdue' | 'waiting' | 'recurring';

export default function Tasks() {
  const auth = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<View>(sp.get('overdue') ? 'overdue' : auth.isManager ? 'all' : 'mine');
  const sites = useSites();
  const emp = auth.me?.employee?.id;
  const base = useMemo(() => {
    if (view === 'mine') return { owner_employee_id: emp || '00000000-0000-0000-0000-000000000000' };
    if (view === 'overdue') return { is_overdue: true };
    if (view === 'waiting') return { status: 'waiting_other_party' };
    if (view === 'recurring') return { recurrence: 'daily,weekly,monthly' };
    return undefined;
  }, [view, emp]);
  const initial = sp.get('status') ? { status: sp.get('status')! } : undefined;

  return (
    <div>
      <PageHeader title="المهام" icon={<ClipboardList className="h-6 w-6" />}
        description="توزيع الأعمال ومتابعة إنجازها. النظام للإدارة والتوثيق فقط ولا ينفذ أوامر تشغيل فعلية للمعدات أو SCADA."
        actions={auth.can('tasks.create') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>مهمة جديدة</Button>} />
      <Tabs<View> value={view} onChange={setView} tabs={[
        ...(auth.isManager ? [{ value: 'all' as View, label: 'كل المهام' }] : []),
        ...(emp ? [{ value: 'mine' as View, label: 'مهامي' }] : []),
        { value: 'overdue', label: 'المتأخرة' }, { value: 'waiting', label: 'بانتظار جهة أخرى' }, { value: 'recurring', label: 'المتكررة' },
      ]} />
      <DataTable resource="tasks" defaultSort="-created_at" archivedToggle={auth.isManager} baseFilters={base} initialFilters={initial}
        searchPlaceholder="ابحث في العنوان أو الوصف أو المسؤول أو المعدة…"
        filters={[
          { key: 'status', label: 'الحالة', options: options('task_status') },
          { key: 'priority', label: 'الأولوية', options: options('task_priority') },
          { key: 'type', label: 'النوع', options: options('task_type') },
          { key: 'site_id', label: 'الموقع', options: sites.options },
          { key: 'due_at__gte', label: 'الاستحقاق من', type: 'date' },
          { key: 'due_at__lte', label: 'الاستحقاق إلى', type: 'date' },
        ]}
        onRowClick={(r: any) => nav(`/tasks/${r.id}`)}
        columns={[
          { key: 'title', header: 'المهمة', sortKey: 'title', mobile: 'title', render: (r: any) => (
            <div className="min-w-[200px]"><div className="font-medium">{r.title} <DemoBadge show={r.is_demo} /></div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted">{label('task_type', r.type)}{r.recurrence !== 'none' && <Badge tone="accent"><Repeat className="h-3 w-3" />{label('recurrence_kind', r.recurrence)}</Badge>}{r.equipment && <span>· {r.equipment}</span>}</div></div>) },
          { key: 'site_name', header: 'الموقع', sortKey: 'site_name' },
          { key: 'owner_name', header: 'المسؤول' },
          { key: 'priority', header: 'الأولوية', sortKey: 'priority', render: (r: any) => <Priority v={r.priority} /> },
          { key: 'status', header: 'الحالة', sortKey: 'status', render: (r: any) => <div className="flex flex-wrap gap-1"><TaskStatus v={r.status} />{r.is_overdue && <Badge tone="danger">متأخرة</Badge>}</div> },
          { key: 'due_at', header: 'الاستحقاق', sortKey: 'due_at', render: (r: any) => <span className={r.is_overdue ? 'font-medium text-danger' : ''}>{fmtDateTime(r.due_at)}</span> },
        ]}
        empty={{ title: view === 'mine' ? 'لا توجد مهام مسندة إليك' : 'لا توجد مهام', description: 'تظهر هنا المهام حسب صلاحيتك ومواقعك.' }} />
      <NewTaskModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
