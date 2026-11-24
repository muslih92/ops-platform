import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileSpreadsheet, Plus, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, type ListParams } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useInvalidate, useOptions, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { exportCsv, exportXlsx, readSheet, type ExportCol } from '@/lib/export';
import { DataTable, type Column } from '@/components/DataTable';
import { FormModal, type FieldDef } from '@/components/EntityForm';
import { Alert, Badge, Button, DemoBadge, Modal, PageHeader } from '@/components/ui';

export function employeeFields(o: { groups: any[] }): FieldDef[] {
  return [
    { name: 'employee_number', label: 'الرقم الوظيفي', required: true, maxLength: 40 },
    { name: 'full_name', label: 'الاسم الكامل', required: true, maxLength: 150 },
    { name: 'job_title', label: 'المسمى الوظيفي', maxLength: 150 },
    { name: 'department', label: 'الإدارة / القسم', maxLength: 150, placeholder: 'مثل: التشغيل أو الصيانة' },
    { name: 'site', label: 'الموقع الأساسي', required: true, maxLength: 150, hint: 'اكتب اسم الموقع، ويُضاف تلقائيًا إن لم يكن موجودًا' },
    { name: 'line', label: 'الخط', maxLength: 150 },
    { name: 'shift', label: 'الوردية', maxLength: 100 },
    { name: 'group_id', label: 'مجموعة المناوبة (A/B/C/D)', type: 'select', options: o.groups, hint: 'للنقل لاحقًا استخدم «طلب نقل» في صفحة المناوبات' },
    { name: 'annual_leave_days', label: 'رصيد الإجازة السنوي (بالأيام)', type: 'number', required: true, min: 0, max: 60 },
    { name: 'manager', label: 'المدير المباشر', maxLength: 150, hint: 'إن طابق اسم أو رقم موظف مسجل يُربط به' },
    { name: 'hire_date', label: 'تاريخ التعيين', type: 'date' },
    { name: 'status', label: 'الحالة الوظيفية', type: 'select', options: options('employee_status'), required: true },
    { name: 'qualifications', label: 'المؤهلات', type: 'textarea' },
    { name: 'certifications', label: 'الشهادات والدورات', type: 'textarea' },
    { name: 'previous_experience', label: 'الخبرات السابقة', type: 'textarea' },
  ];
}

export function useEmployeeFieldOptions() {
  const groups = useOptions('shift_groups', { label: (r) => r.name, sort: 'code' });
  return { groups: groups.options };
}

/** Form values for an existing employee (typed names instead of ids). */
export const employeeToForm = (e: any) => ({ ...e, department: e.department_name, site: e.site_name, line: e.line_name, shift: e.shift_name, manager: e.manager_name });

/** Turn typed names into linked records (found by name or created) before saving. */
export async function employeePayload(p: Record<string, any>) {
  const { department, site, line, shift, manager, ...rest } = p;
  const refs = await api.rpc<Record<string, any>>('resolve_employee_refs', { refs: { department, site, line, shift, manager } });
  return { ...rest, ...refs };
}

const EXPORT_COLS: ExportCol<any>[] = [
  { header: 'الرقم الوظيفي', value: (r) => r.employee_number },
  { header: 'الاسم', value: (r) => r.full_name },
  { header: 'المسمى', value: (r) => r.job_title },
  { header: 'الإدارة', value: (r) => r.department_name },
  { header: 'الموقع', value: (r) => r.site_name },
  { header: 'الخط', value: (r) => r.line_name },
  { header: 'الوردية', value: (r) => r.shift_name },
  { header: 'المدير المباشر', value: (r) => r.manager_name },
  { header: 'تاريخ التعيين', value: (r) => r.hire_date },
  { header: 'الحالة', value: (r) => label('employee_status', r.status) },
  { header: 'بيانات تجريبية', value: (r) => (r.is_demo ? 'نعم' : '') },
];

export default function Employees() {
  const auth = useAuth();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [params, setParams] = useState<ListParams>({});
  const sites = useSites();
  const shiftsOpt = useOptions('shifts', { label: (r) => `${r.name} – ${r.site_name || 'عام'}`, sort: 'site_name' });
  const skills = useOptions('skills', { sort: 'domain_order' });
  const [skillFilter, setSkillFilter] = useState('');
  const skillEmp = useOptions('employee_skills', { value: 'employee_id', filters: { skill_id: skillFilter, level: '3,4' }, enabled: !!skillFilter });
  const fo = useEmployeeFieldOptions();
  const canWrite = auth.can('employees.manage');
  const create = useAction(async (p: any) => api.create('employees', await employeePayload(p)), { success: 'تمت إضافة الموظف', onSuccess: (r: any) => nav(`/employees/${r.id}`) });

  const cols: Column<any>[] = [
    { key: 'full_name', header: 'الاسم', sortKey: 'full_name', mobile: 'title', render: (r) => <span className="font-medium">{r.full_name} <DemoBadge show={r.is_demo} /></span> },
    { key: 'employee_number', header: 'الرقم الوظيفي', sortKey: 'employee_number', render: (r) => <span className="num">{r.employee_number}</span> },
    { key: 'job_title', header: 'المسمى' },
    { key: 'site_name', header: 'الموقع', sortKey: 'site_name' },
    { key: 'shift_name', header: 'الوردية', sortKey: 'shift_name' },
    { key: 'group_code', header: 'المجموعة', sortKey: 'group_code', render: (r) => r.group_code || '—' },
    { key: 'status', header: 'الحالة', sortKey: 'status', render: (r) => <Badge tone={r.status === 'active' ? 'success' : r.status === 'on_leave' ? 'warning' : 'neutral'}>{label('employee_status', r.status)}</Badge> },
  ];

  const doExport = async (kind: 'xlsx' | 'csv') => {
    const all = await api.list('employees', { ...params, page: 1, pageSize: 10000, export: true });
    const meta = { title: 'قائمة الموظفين', filters: describe(params, sites.options), preparedBy: auth.me!.user.full_name };
    if (kind === 'xlsx') await exportXlsx('employees', EXPORT_COLS, all.rows, meta);
    else exportCsv('employees', EXPORT_COLS, all.rows, meta);
  };

  const skillIds = skillFilter ? [...new Set(skillEmp.rows.map((r: any) => r.employee_id))] : null;

  return (
    <div>
      <PageHeader title="الموظفون" icon={<Users className="h-6 w-6" />} description="بيانات الموظفين ومواقعهم ووردياتهم. البحث بالاسم أو الرقم الوظيفي أو الموقع، والفلترة حسب المهارة."
        actions={<>
          <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => doExport('xlsx').catch((e) => toast.error(e.message))}>تصدير Excel</Button>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => doExport('csv').catch((e) => toast.error(e.message))}>CSV</Button>
          {canWrite && <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>استيراد</Button>}
          {canWrite && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>إضافة موظف</Button>}
        </>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="skill-f" className="text-sm text-muted">موظفون مؤهلون في مهارة:</label>
        <select id="skill-f" className="input w-auto max-w-full" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>
          <option value="">— بدون —</option>
          {skills.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {skillFilter && <span className="text-xs text-muted">يعرض من مستواه 3 أو 4 (ينفذ باستقلالية فأعلى)</span>}
      </div>
      <DataTable resource="employees" columns={cols} defaultSort="employee_number" archivedToggle
        searchPlaceholder="ابحث بالاسم أو الرقم الوظيفي أو الموقع…"
        baseFilters={skillIds ? { id: skillIds.length ? skillIds.join(',') + (skillIds.length === 1 ? ',' : '') : '00000000-0000-0000-0000-000000000000' } : undefined}
        onParamsChange={setParams}
        filters={[
          { key: 'primary_site_id', label: 'الموقع', options: sites.options },
          { key: 'shift_id', label: 'الوردية', options: shiftsOpt.options },
          { key: 'group_id', label: 'المجموعة', options: fo.groups },
          { key: 'status', label: 'الحالة', options: options('employee_status') },
          { key: 'is_demo', label: 'بيانات تجريبية', type: 'bool' },
        ]}
        onRowClick={(r) => nav(`/employees/${r.id}`)}
        empty={{ title: 'لا يوجد موظفون بعد', description: 'أضف موظفًا أو استورد قائمة من ملف Excel/CSV.', action: canWrite ? <Button onClick={() => setCreating(true)}>إضافة موظف</Button> : undefined }} />

      <FormModal open={creating} onClose={() => setCreating(false)} title="إضافة موظف" size="lg"
        fields={employeeFields(fo)} initial={{ status: 'active', annual_leave_days: 30 }}
        onSubmit={(p) => create.mutateAsync(p)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function describe(p: ListParams, sites: { value: string; label: string }[]) {
  const parts: string[] = [];
  if (p.search) parts.push(`بحث: ${p.search}`);
  const f = p.filters || {};
  if (f.primary_site_id) parts.push(`الموقع: ${sites.find((s) => s.value === f.primary_site_id)?.label}`);
  if (f.status) parts.push(`الحالة: ${label('employee_status', String(f.status))}`);
  if (p.archived) parts.push('المؤرشف');
  return parts.join('، ');
}

const IMPORT_COLUMNS: { key: string; label: string; aliases: string[]; required?: boolean }[] = [
  { key: 'employee_number', label: 'الرقم الوظيفي', aliases: ['employee_number', 'الرقم الوظيفي', 'رقم الموظف'], required: true },
  { key: 'full_name', label: 'الاسم الكامل', aliases: ['full_name', 'الاسم', 'الاسم الكامل'], required: true },
  { key: 'job_title', label: 'المسمى الوظيفي', aliases: ['job_title', 'المسمى', 'المسمى الوظيفي'] },
  { key: 'department', label: 'الإدارة', aliases: ['department', 'الإدارة', 'القسم'] },
  { key: 'site_code', label: 'رمز الموقع', aliases: ['site_code', 'رمز الموقع', 'الموقع'] },
  { key: 'shift_code', label: 'رمز الوردية', aliases: ['shift_code', 'رمز الوردية', 'الوردية'] },
  { key: 'hire_date', label: 'تاريخ التعيين', aliases: ['hire_date', 'تاريخ التعيين'] },
  { key: 'phone', label: 'الجوال', aliases: ['phone', 'الجوال', 'رقم التواصل'] },
  { key: 'email', label: 'البريد', aliases: ['email', 'البريد', 'البريد الإلكتروني'] },
];

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setRows([]); setMapping({}); setProblems([]); setResult(null); };
  const onFile = async (f: File) => {
    reset();
    try {
      const sheet = await readSheet(f);
      if (sheet.length < 2) { setProblems(['الملف فارغ أو لا يحتوي على صفوف بيانات']); return; }
      const headers = sheet[0].map((h) => h.trim());
      const map: Record<string, number> = {};
      const probs: string[] = [];
      for (const c of IMPORT_COLUMNS) {
        const idx = headers.findIndex((h) => c.aliases.some((a) => a.toLowerCase() === h.toLowerCase()));
        if (idx >= 0) map[c.key] = idx;
        else if (c.required) probs.push(`العمود المطلوب «${c.label}» غير موجود`);
      }
      const unknown = headers.filter((h) => h && !IMPORT_COLUMNS.some((c) => c.aliases.some((a) => a.toLowerCase() === h.toLowerCase())));
      if (unknown.length) probs.push(`أعمدة غير معروفة سيتم تجاهلها: ${unknown.join('، ')}`);
      const data = sheet.slice(1).map((r) => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, (r[i] || '').trim()])));
      const seen = new Set<string>();
      data.forEach((r, i) => {
        if (!r.employee_number || !r.full_name) probs.push(`السطر ${i + 2}: الرقم الوظيفي والاسم مطلوبان`);
        if (r.employee_number && seen.has(r.employee_number)) probs.push(`السطر ${i + 2}: رقم وظيفي مكرر في الملف`);
        seen.add(r.employee_number);
        if (r.hire_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.hire_date)) probs.push(`السطر ${i + 2}: تاريخ التعيين يجب أن يكون YYYY-MM-DD`);
      });
      setMapping(map); setRows(data); setProblems(probs);
    } catch (e: any) {
      setProblems(['تعذر قراءة الملف: ' + e.message]);
    }
  };
  const blocking = problems.some((p) => !p.startsWith('أعمدة غير معروفة'));
  const doImport = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/import/employees', { rows });
      setResult(r);
      invalidate();
      toast.success(`تمت إضافة ${r.inserted} وتحديث ${r.updated}`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const template = () => exportCsv('employees-template', IMPORT_COLUMNS.map((c) => ({ header: c.aliases[0], value: () => '' })), []);

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="استيراد الموظفين من Excel أو CSV" size="lg"
      footer={<>
        <Button variant="secondary" onClick={() => { reset(); onClose(); }}>إغلاق</Button>
        <Button disabled={!rows.length || blocking || !!result} loading={busy} onClick={doImport}>استيراد {rows.length ? `(${rows.length})` : ''}</Button>
      </>}>
      <div className="space-y-3">
        <Alert tone="info">
          الأعمدة المدعومة: {IMPORT_COLUMNS.map((c) => c.label + (c.required ? ' *' : '')).join('، ')}. تُطابق المواقع برمزها (مثل PS1) والورديات برمزها.
          الموظف الموجود برقمه الوظيفي يتم تحديثه. <button className="font-semibold text-accent underline" onClick={template}>تنزيل قالب CSV</button>
        </Alert>
        <input type="file" accept=".csv,.xlsx" aria-label="اختر ملف" className="input" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {problems.length > 0 && (
          <Alert tone={blocking ? 'danger' : 'warning'} title={blocking ? 'يجب تصحيح الملف قبل الاستيراد' : 'تنبيهات'}>
            <ul className="list-disc ps-5">{problems.slice(0, 15).map((p, i) => <li key={i}>{p}</li>)}</ul>
            {problems.length > 15 && <div>و{problems.length - 15} مشكلة أخرى…</div>}
          </Alert>
        )}
        {rows.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">معاينة أول 10 صفوف من {rows.length}</h3>
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2"><tr>{IMPORT_COLUMNS.filter((c) => mapping[c.key] !== undefined).map((c) => <th key={c.key} className="th">{c.label}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 10).map((r, i) => <tr key={i} className="border-t border-border">{IMPORT_COLUMNS.filter((c) => mapping[c.key] !== undefined).map((c) => <td key={c.key} className="td">{r[c.key]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
        {result && (
          <Alert tone={result.errors.length ? 'warning' : 'success'} title={`تمت إضافة ${result.inserted} وتحديث ${result.updated}`}>
            {result.errors.length > 0 && <ul className="list-disc ps-5">{result.errors.slice(0, 20).map((e: any, i: number) => <li key={i}>السطر {e.line}: {e.error}</li>)}</ul>}
          </Alert>
        )}
      </div>
    </Modal>
  );
}

export { fmtDate };
