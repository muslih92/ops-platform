import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug, Settings as Cog, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useList } from '@/lib/hooks';
import { label } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { CrudTable } from '@/components/CrudTable';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner, Tabs, Textarea } from '@/components/ui';

function General() {
  const qc = useQueryClient();
  const q = useList('system_settings', { pageSize: 100 });
  const [v, setV] = useState<Record<string, any>>({});
  const logo = useRef<HTMLInputElement>(null);
  const [logoVer, setLogoVer] = useState(Date.now());
  useEffect(() => {
    if (!q.data) return;
    const s = Object.fromEntries(q.data.rows.map((r: any) => [r.key, r.value]));
    setV({ platform_name: s.platform_name || '', platform_name_en: s.platform_name_en || '', org_name: s.org_name || '', default_timezone: s.default_timezone || 'Asia/Riyadh',
      qualified_level: String(s.qualified_level ?? 3), ...(s.org_info || {}), has_logo: !!s.logo_path });
  }, [q.data]);
  const save = useAction(() => api.put('/api/settings', {
    platform_name: v.platform_name, platform_name_en: v.platform_name_en, org_name: v.org_name, default_timezone: v.default_timezone,
    org_info: { address: v.address || '', phone: v.phone || '', email: v.email || '', website: v.website || '' },
  }), { success: 'تم حفظ الإعدادات', onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }) });
  const up = useAction((f: File) => api.uploadLogo(f), { success: 'تم تحديث الشعار', onSuccess: () => { setLogoVer(Date.now()); qc.invalidateQueries({ queryKey: ['branding'] }); } });
  if (q.isLoading) return <Spinner />;
  const set = (k: string) => (e: any) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="هوية المنصة والجهة" className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم المنصة" required>{(id) => <Input id={id} value={v.platform_name || ''} onChange={set('platform_name')} />}</Field>
          <Field label="الاسم بالإنجليزية (للاستخدام المستقبلي)">{(id) => <Input id={id} dir="ltr" value={v.platform_name_en || ''} onChange={set('platform_name_en')} />}</Field>
          <Field label="اسم الجهة">{(id) => <Input id={id} value={v.org_name || ''} onChange={set('org_name')} />}</Field>
          <Field label="المنطقة الزمنية">{(id) => <Select id={id} value={v.default_timezone || 'Asia/Riyadh'} onChange={set('default_timezone')} options={[{ value: 'Asia/Riyadh', label: 'الرياض (Asia/Riyadh)' }]} />}</Field>
          <Field label="العنوان" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={v.address || ''} onChange={set('address')} />}</Field>
          <Field label="الهاتف">{(id) => <Input id={id} dir="ltr" value={v.phone || ''} onChange={set('phone')} />}</Field>
          <Field label="البريد">{(id) => <Input id={id} dir="ltr" value={v.email || ''} onChange={set('email')} />}</Field>
          <Field label="الموقع الإلكتروني">{(id) => <Input id={id} dir="ltr" value={v.website || ''} onChange={set('website')} />}</Field>
          <Field label="اللغة">{(id) => <Select id={id} value="ar" onChange={() => {}} options={[{ value: 'ar', label: 'العربية (الإنجليزية خيار مستقبلي)' }]} />}</Field>
        </div>
        <div className="mt-4"><Button loading={save.isPending} onClick={() => save.mutate()}>حفظ الإعدادات</Button></div>
      </Card>
      <Card title="الشعار">
        <div className="mb-3 flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-surface-2">
          {v.has_logo || up.isSuccess ? <img src={`/api/public/logo?v=${logoVer}`} alt="الشعار الحالي" className="max-h-24 max-w-full object-contain" /> : <span className="text-sm text-muted">لا يوجد شعار</span>}
        </div>
        <input ref={logo} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ''; }} />
        <Button variant="secondary" icon={<Upload className="h-4 w-4" />} loading={up.isPending} onClick={() => logo.current?.click()}>رفع شعار</Button>
        <p className="mt-2 text-xs text-muted">PNG أو JPG أو SVG أو WebP، حتى 2 ميجابايت.</p>
      </Card>
    </div>
  );
}

function Integrations() {
  const auth = useAuth();
  const canManage = auth.can('integrations.manage');
  const q = useList('integration_configs', { pageSize: 10, sort: 'kind' });
  const env = useQuery({ queryKey: ['integration-env'], queryFn: () => api.get<Record<string, { required: string[]; present: string[] }>>('/api/integrations/env'), enabled: canManage });
  const test = useAction((kind: string) => api.post(`/api/integrations/${kind}/test`), { success: 'تم تحديث حالة التكامل' });
  const tone = { not_configured: 'neutral', configured: 'info', connected: 'success', last_failed: 'danger' } as const;
  const notes: Record<string, string> = {
    sap_pm: 'ربط مستقبلي لقراءة البلاغات وأوامر العمل. حاليًا تُحفظ أرقام البلاغات يدويًا كمراجع فقط.',
    scada: 'قراءة فقط للإنذارات والأحداث مستقبلًا. لا يوجد في المنصة أي أمر تشغيل للمضخات أو الصمامات أو SCADA.',
    email: 'إرسال الإشعارات بالبريد خيار مستقبلي؛ الإشعارات حاليًا داخل المنصة فقط.',
    whatsapp: 'إرسال الإشعارات عبر WhatsApp خيار مستقبلي يتطلب اعتمادًا رسميًا ومزود خدمة.',
  };
  if (q.isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <Alert tone="warning" title="عرض صادق لحالة التكاملات">لا تُخزَّن أي مفاتيح أو كلمات مرور في الواجهة أو قاعدة البيانات؛ تُضبط كمتغيرات بيئة على الخادم فقط. زر الاختبار يتحقق من إمكانية الوصول ولا يُفعّل أي مزامنة. لا يوجد أي أمر تحكم تشغيلي في المنصة.</Alert>
      <div className="grid gap-4 md:grid-cols-2">
        {(q.data?.rows ?? []).map((c: any) => {
          const e = env.data?.[c.kind];
          return (
            <Card key={c.id} title={<span className="inline-flex items-center gap-2"><Plug className="h-4 w-4" />{label('integration_kind', c.kind)}</span>} actions={<Badge tone={(tone as any)[c.status]}>{label('integration_status', c.status)}</Badge>}>
              <p className="mb-3 text-sm text-muted">{notes[c.kind]}</p>
              <dl className="mb-3 space-y-1 text-sm">
                <div>آخر فحص: {fmtDateTime(c.last_checked_at)}</div>
                {c.last_error && <div className="text-danger">{c.last_error}</div>}
                {e && <div>متغيرات الخادم المطلوبة: {e.required.map((x) => <code key={x} className={`mx-0.5 rounded px-1 text-xs ltr ${e.present.includes(x) ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted'}`}>{x}</code>)}</div>}
              </dl>
              {canManage && <Button size="sm" variant="secondary" loading={test.isPending && test.variables === c.kind} onClick={() => test.mutate(c.kind)}>اختبار الاتصال</Button>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

type Tab = 'general' | 'departments' | 'leave_types' | 'skill_domains' | 'criteria' | 'levels' | 'integrations';
export default function Settings() {
  const auth = useAuth();
  const s = auth.can('settings.manage');
  const [tab, setTab] = useState<Tab>(s ? 'general' : 'integrations');
  const tabs = [
    ...(s ? [{ value: 'general' as Tab, label: 'عام' }, { value: 'departments' as Tab, label: 'الإدارات' }, { value: 'leave_types' as Tab, label: 'أنواع الإجازات' }, { value: 'skill_domains' as Tab, label: 'مجالات المهارات' }, { value: 'criteria' as Tab, label: 'معايير التقييم' }, { value: 'levels' as Tab, label: 'مستويات التقييم' }] : []),
    { value: 'integrations' as Tab, label: 'التكاملات' },
  ];
  return (
    <div>
      <PageHeader title="الإعدادات" icon={<Cog className="h-6 w-6" />} description="هوية المنصة وقوائم الاختيار وحالة التكاملات. المواقع والورديات تُدار من صفحاتها." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'general' && <General />}
      {tab === 'departments' && (
        <CrudTable resource="departments" title="إدارة" createLabel="إضافة إدارة" archiveNoun="الإدارة" canWrite={s} defaultSort="name"
          columns={[{ key: 'name', header: 'الاسم', sortKey: 'name', mobile: 'title' }, { key: 'code', header: 'الرمز' }, { key: 'description', header: 'الوصف' }]}
          fields={[{ name: 'name', label: 'الاسم', required: true }, { name: 'code', label: 'الرمز' }, { name: 'description', label: 'الوصف', type: 'textarea' }]} />
      )}
      {tab === 'leave_types' && (
        <CrudTable resource="leave_types" title="نوع إجازة" createLabel="إضافة نوع" archiveNoun="نوع الإجازة" canWrite={s} defaultSort="name" newDefaults={{ color: '#0e7490' }}
          columns={[{ key: 'name', header: 'النوع', sortKey: 'name', mobile: 'title', render: (r: any) => <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} />{r.name}</span> }, { key: 'code', header: 'الرمز' }, { key: 'max_days_per_year', header: 'الحد السنوي', render: (r: any) => r.max_days_per_year ?? '—' }, { key: 'requires_attachment', header: 'مرفق مطلوب', render: (r: any) => (r.requires_attachment ? 'نعم' : 'لا') }]}
          fields={[{ name: 'name', label: 'الاسم', required: true }, { name: 'code', label: 'الرمز' }, { name: 'max_days_per_year', label: 'الحد السنوي (أيام)', type: 'number', min: 0 }, { name: 'requires_attachment', label: 'المرفق', type: 'checkbox', hint: 'يتطلب مرفقًا (مثل تقرير طبي)' }, { name: 'color', label: 'اللون', type: 'color' }]} />
      )}
      {tab === 'skill_domains' && (
        <CrudTable resource="skill_domains" title="مجال" createLabel="إضافة مجال" archiveNoun="المجال" canWrite={auth.can('skills.manage')} defaultSort="sort_order"
          columns={[{ key: 'name', header: 'المجال', sortKey: 'name', mobile: 'title' }, { key: 'sort_order', header: 'الترتيب', sortKey: 'sort_order' }, { key: 'description', header: 'الوصف' }]}
          fields={[{ name: 'name', label: 'الاسم', required: true }, { name: 'sort_order', label: 'الترتيب', type: 'number' }, { name: 'description', label: 'الوصف', type: 'textarea' }]} />
      )}
      {tab === 'criteria' && (
        <CrudTable resource="review_criteria" title="معيار" createLabel="إضافة معيار" archiveNoun="المعيار" canWrite={s} defaultSort="sort_order" newDefaults={{ active: true }}
          columns={[{ key: 'name', header: 'المعيار', sortKey: 'name', mobile: 'title' }, { key: 'description', header: 'الوصف' }, { key: 'sort_order', header: 'الترتيب', sortKey: 'sort_order' }, { key: 'active', header: 'الحالة', render: (r: any) => (r.active ? <Badge tone="success">مفعّل</Badge> : <Badge>موقوف</Badge>) }]}
          fields={[{ name: 'name', label: 'الاسم', required: true }, { name: 'description', label: 'الوصف', type: 'textarea' }, { name: 'sort_order', label: 'الترتيب', type: 'number' }, { name: 'active', label: 'الحالة', type: 'checkbox', hint: 'يظهر في التقييمات الجديدة' }]} />
      )}
      {tab === 'levels' && (
        <CrudTable resource="rating_levels" title="مستوى" createLabel="إضافة مستوى" archiveNoun="المستوى" canWrite={s} defaultSort="sort_order" newDefaults={{ color: '#0e7490' }}
          columns={[{ key: 'name', header: 'المستوى', mobile: 'title', render: (r: any) => <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} />{r.name}</span> }, { key: 'value', header: 'القيمة' }, { key: 'sort_order', header: 'الترتيب', sortKey: 'sort_order' }]}
          fields={[{ name: 'name', label: 'الاسم', required: true }, { name: 'value', label: 'القيمة', type: 'number', required: true }, { name: 'sort_order', label: 'الترتيب', type: 'number' }, { name: 'color', label: 'اللون', type: 'color' }]} />
      )}
      {tab === 'integrations' && <Integrations />}
    </div>
  );
}
