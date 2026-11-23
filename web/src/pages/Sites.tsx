import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useOptions, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { CrudTable } from '@/components/CrudTable';
import { Badge, DemoBadge, PageHeader, Tabs } from '@/components/ui';

export default function Sites() {
  const auth = useAuth();
  const [tab, setTab] = useState<'sites' | 'lines'>('sites');
  const sites = useSites();
  const canWrite = auth.can('sites.manage');
  const allSites = useOptions('sites', { label: (r) => `${r.name} (${r.code})`, sort: 'code' });
  return (
    <div>
      <PageHeader title="المواقع والمحطات والخزانات وغرف التحكم" icon={<Building2 className="h-6 w-6" />}
        description="إدارة مرنة للمنظومات والخطوط والمحطات والخزانات وغرف التحكم دون الحاجة لتعديل الكود." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'sites', label: 'المواقع' }, { value: 'lines', label: 'الخطوط' }]} />
      {tab === 'sites' ? (
        <CrudTable resource="sites" title="موقع" createLabel="إضافة موقع" archiveNoun="الموقع" canWrite={canWrite} defaultSort="code"
          searchPlaceholder="ابحث بالاسم أو الرمز أو المنطقة…"
          columns={[
            { key: 'name', header: 'الاسم', sortKey: 'name', mobile: 'title', render: (r: any) => <span className="font-medium">{r.name} <DemoBadge show={r.is_demo} /></span> },
            { key: 'code', header: 'الرمز', sortKey: 'code', render: (r: any) => <span className="ltr num">{r.code}</span> },
            { key: 'type', header: 'النوع', sortKey: 'type', render: (r: any) => label('site_type', r.type) },
            { key: 'parent_name', header: 'يتبع' },
            { key: 'region', header: 'المنطقة' },
            { key: 'employees_count', header: 'الموظفون', sortKey: 'employees_count', render: (r: any) => <span className="num">{r.employees_count}</span> },
            { key: 'active', header: 'الحالة', render: (r: any) => (r.archived_at ? <Badge tone="warning">مؤرشف</Badge> : r.active ? <Badge tone="success">نشط</Badge> : <Badge>غير نشط</Badge>) },
          ]}
          filters={[{ key: 'type', label: 'النوع', options: options('site_type') }, { key: 'parent_site_id', label: 'يتبع', options: sites.options }]}
          newDefaults={{ active: true, type: 'pumping_station' }}
          fields={(row) => [
            { name: 'name', label: 'الاسم', required: true, maxLength: 150 },
            { name: 'code', label: 'الرمز', required: true, maxLength: 40, hint: 'رمز فريد مثل PS1 – يُستخدم في الاستيراد' },
            { name: 'type', label: 'النوع', type: 'select', required: true, options: options('site_type') },
            { name: 'parent_site_id', label: 'يتبع (منظومة/موقع أعلى)', type: 'select', options: allSites.options.filter((o) => o.value !== row?.id) },
            { name: 'region', label: 'المنطقة' },
            { name: 'active', label: 'الحالة', type: 'checkbox', hint: 'الموقع نشط ويظهر في التغطية' },
            { name: 'description', label: 'الوصف', type: 'textarea' },
          ]} />
      ) : (
        <CrudTable resource="lines" title="خط" createLabel="إضافة خط" archiveNoun="الخط" canWrite={canWrite} defaultSort="code"
          columns={[
            { key: 'name', header: 'الخط', sortKey: 'name', mobile: 'title', render: (r: any) => <span className="font-medium">{r.name} <DemoBadge show={r.is_demo} /></span> },
            { key: 'code', header: 'الرمز', sortKey: 'code' },
            { key: 'site_name', header: 'الموقع' },
            { key: 'description', header: 'الوصف' },
          ]}
          filters={[{ key: 'site_id', label: 'الموقع', options: sites.options }]}
          fields={[
            { name: 'name', label: 'اسم الخط', required: true },
            { name: 'code', label: 'الرمز', required: true },
            { name: 'site_id', label: 'الموقع', type: 'select', required: true, options: sites.options },
            { name: 'description', label: 'الوصف', type: 'textarea' },
          ]} />
      )}
    </div>
  );
}
