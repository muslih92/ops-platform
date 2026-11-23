import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Grid3x3 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useList, useOptions, useRpc, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDate, todayISO } from '@/lib/format';
import { CrudTable } from '@/components/CrudTable';
import { DataTable } from '@/components/DataTable';
import { FormModal } from '@/components/EntityForm';
import { Alert, Badge, Card, cx, DemoBadge, EmptyState, Field, PageHeader, Select, Spinner, Tabs } from '@/components/ui';
import { Criticality, SkillLevel } from '@/components/StatusBadges';

const levelCell = { 1: 'bg-danger-soft text-danger', 2: 'bg-warning-soft text-warning', 3: 'bg-info-soft text-info', 4: 'bg-success-soft text-success' } as Record<number, string>;

function useDefaultSite() {
  const auth = useAuth();
  const sites = useSites();
  const def = auth.me?.supervisedSites?.[0] || auth.me?.employee?.primary_site_id || sites.rows.find((s: any) => !['system', 'line'].includes(s.type))?.id || '';
  return { sites, def };
}

export function AssessModal({ open, onClose, employee, skill, existing }: { open: boolean; onClose: () => void; employee?: { id: string; full_name: string }; skill?: { id: string; name: string; reassess_months?: number }; existing?: any }) {
  const auth = useAuth();
  const save = useAction((p: any) => (existing?.id ? api.update('employee_skills', existing.id, p) : api.create('employee_skills', p)), { success: 'تم حفظ التقييم' });
  const next = skill?.reassess_months ? (() => { const d = new Date(); d.setMonth(d.getMonth() + skill.reassess_months!); return d.toISOString().slice(0, 10); })() : '';
  return (
    <FormModal open={open} onClose={onClose} title={`تقييم مهارة: ${skill?.name || ''}`} submitLabel="حفظ التقييم"
      initial={existing ? { ...existing, source: 'assessment' } : { level: '3', assessed_at: todayISO(), next_reassess_at: next, source: 'assessment' }}
      fields={[
        { name: 'level', label: 'المستوى', type: 'select', required: true, options: options('skill_level') },
        { name: 'assessed_at', label: 'تاريخ التقييم', type: 'date', required: true },
        { name: 'next_reassess_at', label: 'موعد إعادة التقييم', type: 'date' },
        { name: 'notes', label: 'ملاحظات المقيّم والدليل العملي', type: 'textarea' },
      ]}
      onSubmit={(p) => save.mutateAsync({ ...p, level: Number(p.level), employee_id: employee!.id, skill_id: skill!.id, source: 'assessment', assessor_id: auth.me?.user.id })}>
      {() => <p className="mt-3 text-xs text-muted">الموظف: {employee?.full_name}. حضور الدورة لا يعني اكتساب المهارة؛ اعتمد المستوى على أداء عملي موثق.</p>}
    </FormModal>
  );
}

function Matrix() {
  const auth = useAuth();
  const { sites, def } = useDefaultSite();
  const [site, setSite] = useState('');
  const [domain, setDomain] = useState('');
  useEffect(() => { if (!site && def) setSite(def); }, [def]); // eslint-disable-line
  const domains = useOptions('skill_domains', { sort: 'sort_order' });
  const cov = useRpc<any[]>('skill_coverage', { site_id: site }, !!site);
  const emps = useList('employee_directory', { filters: { primary_site_id: site, status: 'active,on_leave' }, pageSize: 200, sort: 'full_name' }, !!site);
  const es = useList('employee_skills', { filters: { site_id: site }, pageSize: 1000 }, !!site);
  const skillRows = useList('skills', { pageSize: 500 });
  const [cell, setCell] = useState<null | { e: any; k: any; x?: any }>(null);
  const skillCols = useMemo(() => (cov.data ?? []).filter((r: any) => !domain || (skillRows.data?.rows ?? []).find((k: any) => k.id === r.skill_id)?.domain_id === domain), [cov.data, domain, skillRows.data]);
  const map = useMemo(() => { const m = new Map<string, any>(); for (const x of es.data?.rows ?? []) m.set(`${x.employee_id}:${x.skill_id}`, x); return m; }, [es.data]);
  const canAssess = auth.can('skills.assess') && auth.isManager;
  const employees = emps.data?.rows ?? [];
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="الموقع">{(id) => <Select id={id} value={site} onChange={(e) => setSite(e.target.value)} options={sites.options} placeholder="اختر الموقع" />}</Field>
        <Field label="المجال">{(id) => <Select id={id} value={domain} onChange={(e) => setDomain(e.target.value)} options={domains.options} placeholder="كل المجالات" />}</Field>
        <div className="flex flex-wrap gap-1 text-xs">{[1, 2, 3, 4].map((l) => <SkillLevel key={l} v={l} />)}<Badge>— غير مقيّم</Badge></div>
      </div>
      {!site ? <EmptyState title="اختر موقعًا لعرض المصفوفة" /> : cov.isLoading || emps.isLoading ? <Spinner /> : employees.length === 0 || skillCols.length === 0 ? <EmptyState title="لا توجد بيانات" description="لا يوجد موظفون أو مهارات منطبقة على هذا الموقع." /> : (
        <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: '70vh' }}>
          <table className="text-xs">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <th className="th sticky start-0 z-20 min-w-[170px] bg-surface">الموظف</th>
                {skillCols.map((k: any) => (
                  <th key={k.skill_id} className="th min-w-[86px] align-bottom" title={k.domain_name}>
                    <div className="leading-tight">{k.skill_name}</div>
                    {k.is_core && <Badge tone="danger" className="mt-0.5">أساسية</Badge>}
                    <div className={cx('mt-0.5 num', k.is_core && k.qualified <= 1 ? 'font-bold text-danger' : 'text-muted')}>مؤهل: {k.qualified}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((e: any) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="td sticky start-0 bg-surface"><Link to={`/employees/${e.id}`} className="font-medium hover:underline">{e.full_name}</Link><div className="text-muted">{e.employee_number}</div></td>
                  {skillCols.map((k: any) => {
                    const x = map.get(`${e.id}:${k.skill_id}`);
                    const self = x?.source === 'self_reported';
                    return (
                      <td key={k.skill_id} className="p-0.5 text-center">
                        <button type="button" disabled={!canAssess} onClick={() => setCell({ e, k: { id: k.skill_id, name: k.skill_name, reassess_months: (skillRows.data?.rows ?? []).find((s: any) => s.id === k.skill_id)?.reassess_months }, x })}
                          className={cx('h-9 w-full rounded num font-semibold', x ? levelCell[x.level] : 'bg-surface-2 text-muted', self && 'border border-dashed border-warning', canAssess && 'hover:ring-2 hover:ring-accent')}
                          title={x ? `${label('skill_level', x.level)}${self ? ' (إفادة ذاتية غير معتمدة)' : ''}${x.next_reassess_at ? ` · إعادة التقييم ${fmtDate(x.next_reassess_at)}` : ''}` : 'غير مقيّم'}
                          aria-label={`${e.full_name} – ${k.skill_name}: ${x ? label('skill_level', x.level) : 'غير مقيّم'}`}>
                          {x ? x.level : '—'}{self && '*'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">* إفادة ذاتية من الموظف ولا تُحتسب ضمن المؤهلين حتى يعتمدها المشرف. "مؤهل" = مستوى 3 أو 4 بتقييم مشرف.</p>
      {cell && <AssessModal open onClose={() => setCell(null)} employee={cell.e} skill={cell.k} existing={cell.x} />}
    </Card>
  );
}

function Gaps() {
  const { sites } = useDefaultSite();
  const [site, setSite] = useState('');
  const [onlyRisk, setOnlyRisk] = useState(true);
  const q = useRpc<any[]>('skill_coverage', { site_id: site || null });
  const rows = (q.data ?? []).filter((r: any) => !onlyRisk || (r.is_core || ['high', 'critical'].includes(r.criticality)) && r.qualified <= 1);
  const noSub = (q.data ?? []).filter((r: any) => r.is_core && r.qualified <= 1);
  return (
    <div className="space-y-4">
      {noSub.length > 0 && <Alert tone="danger" title={`${noSub.length} مهارة أساسية بلا بديل مؤهل`}>مهارات أساسية لا يملكها بمستوى مؤهل سوى موظف واحد أو لا أحد في الموقع. خطط لتأهيل بديل عبر خطة تطوير.</Alert>}
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="الموقع">{(id) => <Select id={id} value={site} onChange={(e) => setSite(e.target.value)} options={sites.options} placeholder="كل المواقع" />}</Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} /> المهارات المعرضة للخطر فقط</label>
        </div>
        {q.isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="لا توجد فجوات" description="كل المهارات الأساسية لديها أكثر من موظف مؤهل." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr><th className="th">الموقع</th><th className="th">المهارة</th><th className="th">المجال</th><th className="th">الأهمية</th><th className="th">المؤهلون</th><th className="th">المتاحون اليوم</th><th className="th">متمكنون (مدربون)</th><th className="th">الوضع</th></tr></thead>
            <tbody>{rows.map((r: any) => (
              <tr key={r.site_id + r.skill_id} className="border-t border-border">
                <td className="td">{r.site_name}</td><td className="td font-medium">{r.skill_name} {r.is_core && <Badge tone="danger">أساسية</Badge>}</td><td className="td">{r.domain_name}</td>
                <td className="td"><Criticality v={r.criticality} /></td><td className="td num">{r.qualified}</td><td className="td num">{r.available}</td><td className="td num">{r.expert}</td>
                <td className="td">{r.qualified === 0 ? <Badge tone="danger"><AlertTriangle className="h-3 w-3" /> لا يوجد مؤهل</Badge> : r.qualified === 1 ? <Badge tone="warning">لا يوجد بديل</Badge> : r.available === 0 ? <Badge tone="warning">غير متاح اليوم</Badge> : <Badge tone="success">مغطاة</Badge>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

function Reassess() {
  const sites = useSites();
  return (
    <DataTable resource="employee_skills" defaultSort="next_reassess_at" baseFilters={{ next_reassess_at__lte: todayISO(30) }}
      searchPlaceholder="ابحث باسم الموظف أو المهارة…" filters={[{ key: 'site_id', label: 'الموقع', options: sites.options }]}
      columns={[
        { key: 'employee_name', header: 'الموظف', mobile: 'title', render: (r: any) => <Link className="font-medium hover:underline" to={`/employees/${r.employee_id}`}>{r.employee_name}</Link> },
        { key: 'skill_name', header: 'المهارة', sortKey: 'skill_name' },
        { key: 'site_name', header: 'الموقع' },
        { key: 'level', header: 'المستوى', render: (r: any) => <SkillLevel v={r.level} /> },
        { key: 'next_reassess_at', header: 'إعادة التقييم', sortKey: 'next_reassess_at', render: (r: any) => <span className={r.next_reassess_at < todayISO() ? 'font-semibold text-danger' : ''}>{fmtDate(r.next_reassess_at)}</span> },
      ]}
      empty={{ title: 'لا توجد مهارات مستحقة لإعادة التقييم خلال 30 يومًا' }} />
  );
}

function Library() {
  const auth = useAuth();
  const domains = useOptions('skill_domains', { sort: 'sort_order' });
  const allSites = useSites();
  return (
    <CrudTable resource="skills" title="مهارة" createLabel="إضافة مهارة" archiveNoun="المهارة" canWrite={auth.can('skills.manage')} defaultSort="domain_order"
      searchPlaceholder="ابحث باسم المهارة أو المجال…"
      filters={[{ key: 'domain_id', label: 'المجال', options: domains.options }, { key: 'criticality', label: 'الأهمية', options: options('skill_criticality') }, { key: 'is_core', label: 'أساسية', type: 'bool' }]}
      newDefaults={{ criticality: 'medium', reassess_months: 12 }}
      columns={[
        { key: 'name', header: 'المهارة', sortKey: 'name', mobile: 'title', render: (r: any) => <span className="font-medium">{r.name} {r.is_core && <Badge tone="danger">أساسية</Badge>} <DemoBadge show={r.is_demo} /></span> },
        { key: 'domain_name', header: 'المجال', sortKey: 'domain_order' },
        { key: 'criticality', header: 'الأهمية', sortKey: 'criticality', render: (r: any) => <Criticality v={r.criticality} /> },
        { key: 'applicable_site_types', header: 'تنطبق على', render: (r: any) => (r.applicable_site_types?.length ? r.applicable_site_types.map((t: string) => label('site_type', t)).join('، ') : r.applicable_site_ids?.length ? `${r.applicable_site_ids.length} موقع` : 'كل المواقع') },
        { key: 'reassess_months', header: 'إعادة التقييم', render: (r: any) => (r.reassess_months ? <span className="num">كل {r.reassess_months} شهر</span> : '—') },
      ]}
      fields={[
        { name: 'name', label: 'اسم المهارة', required: true, maxLength: 200 },
        { name: 'domain_id', label: 'المجال', type: 'select', required: true, options: domains.options },
        { name: 'criticality', label: 'الأهمية', type: 'select', required: true, options: options('skill_criticality') },
        { name: 'is_core', label: 'مهارة أساسية', type: 'checkbox', hint: 'يُنبَّه عند عدم وجود بديل مؤهل لها' },
        { name: 'applicable_site_types', label: 'أنواع المواقع المنطبقة (فارغ = الكل)', type: 'multiselect', options: options('site_type'), wide: true },
        { name: 'applicable_site_ids', label: 'أو مواقع محددة', type: 'multiselect', options: allSites.options, wide: true },
        { name: 'reassess_months', label: 'إعادة التقييم كل (شهر)', type: 'number', min: 1, max: 60 },
        { name: 'training_requirements', label: 'متطلبات التدريب', type: 'textarea' },
        { name: 'proof_requirements', label: 'متطلبات الإثبات العملي', type: 'textarea' },
      ]} />
  );
}

type Tab = 'matrix' | 'gaps' | 'reassess' | 'library';
export default function Skills() {
  const auth = useAuth();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || (auth.isManager ? 'matrix' : 'library'));
  return (
    <div>
      <PageHeader title="مصفوفة المهارات" icon={<Grid3x3 className="h-6 w-6" />}
        description="مستويات المهارات لكل موظف وموقع، والمهارات الأساسية التي لا يتوفر لها بديل مؤهل." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        ...(auth.isManager ? [{ value: 'matrix' as Tab, label: 'المصفوفة' }, { value: 'gaps' as Tab, label: 'الفجوات والبدلاء' }, { value: 'reassess' as Tab, label: 'إعادة التقييم المستحقة' }] : []),
        { value: 'library', label: 'مكتبة المهارات' },
      ]} />
      {tab === 'matrix' && <Matrix />}
      {tab === 'gaps' && <Gaps />}
      {tab === 'reassess' && <Reassess />}
      {tab === 'library' && <Library />}
    </div>
  );
}
