import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, KeyRound, Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useEmployeesDir, useList, useSites } from '@/lib/hooks';
import { label, options } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { DataTable } from '@/components/DataTable';
import { FormModal } from '@/components/EntityForm';
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, IconButton, MultiCheck, Modal, PageHeader, Spinner, Tabs } from '@/components/ui';

function AccessModal({ user, onClose }: { user: any; onClose: () => void }) {
  const auth = useAuth();
  const sites = useSites();
  const [roles, setRoles] = useState<string[]>(user.roles || []);
  const [siteIds, setSiteIds] = useState<string[]>(user.site_ids || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const done = useAction(async () => null, { success: 'تم تحديث الصلاحيات' });
  const save = async () => {
    setErr(''); setBusy(true);
    try {
      const was: string[] = user.roles || [];
      for (const r of roles.filter((x) => !was.includes(x))) await api.create('user_roles', { user_id: user.id, role: r });
      for (const r of was.filter((x) => !roles.includes(x))) await api.remove('user_roles', { user_id: user.id, role: r });
      const wasS: string[] = user.site_ids || [];
      const keepSites = roles.includes('site_supervisor') ? siteIds : [];
      for (const s of keepSites.filter((x) => !wasS.includes(x))) await api.create('supervisor_sites', { user_id: user.id, site_id: s });
      for (const s of wasS.filter((x) => !keepSites.includes(x))) await api.remove('supervisor_sites', { user_id: user.id, site_id: s });
      await done.mutateAsync();
      if (user.id === auth.me?.user.id) await auth.refresh();
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`الأدوار والنطاق – ${user.full_name}`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ</Button></>}>
      {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
      <div className="label">الأدوار</div>
      <MultiCheck options={options('app_role')} value={roles} onChange={setRoles} />
      {user.id === auth.me?.user.id && <p className="mt-1 text-xs text-muted">لا يمكنك إزالة دور مدير النظام عن حسابك.</p>}
      {roles.includes('site_supervisor') && (
        <div className="mt-4">
          <div className="label">المواقع التي يشرف عليها (تشمل المواقع التابعة لها)</div>
          <MultiCheck options={sites.options} value={siteIds} onChange={setSiteIds} />
        </div>
      )}
      {roles.length === 0 && <Alert tone="warning" className="mt-3">بدون أدوار لن يرى المستخدم أي بيانات وسيظهر له "بانتظار التفعيل".</Alert>}
    </Modal>
  );
}

function UsersTab() {
  const emps = useEmployeesDir();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const [pw, setPw] = useState<any>(null);
  const [arch, setArch] = useState<any>(null);
  const create = useAction((p: any) => api.post('/api/admin/users', p), { success: 'تم إنشاء المستخدم' });
  const update = useAction((p: any) => api.update('users', editing.id, p), { success: 'تم الحفظ' });
  const reset = useAction((p: any) => api.post(`/api/admin/users/${pw.id}/password`, p), { success: 'تم تعيين كلمة المرور وإنهاء جلسات المستخدم' });
  const archive = useAction(({ u, restore }: { u: any; restore?: boolean }) => (restore ? api.restore('users', u.id) : api.archive('users', u.id)), { success: 'تم التحديث', onSuccess: () => setArch(null) });
  const pwHint = 'عشرة أحرف على الأقل وتحتوي على حروف وأرقام';
  return (
    <>
      <DataTable resource="users" defaultSort="full_name" archivedToggle searchPlaceholder="ابحث بالاسم أو البريد أو الموظف المرتبط…"
        filters={[{ key: 'is_active', label: 'نشط', type: 'bool' }]}
        toolbar={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>مستخدم جديد</Button>}
        columns={[
          { key: 'full_name', header: 'المستخدم', sortKey: 'full_name', mobile: 'title', render: (r: any) => <div><div className="font-medium">{r.full_name}</div><div className="ltr text-xs text-muted">{r.email}</div></div> },
          { key: 'roles', header: 'الأدوار', render: (r: any) => <div className="flex flex-wrap gap-1">{(r.roles || []).length ? r.roles.map((x: string) => <Badge key={x} tone={x === 'system_admin' ? 'danger' : 'info'}>{label('app_role', x)}</Badge>) : <Badge tone="warning">بانتظار التفعيل</Badge>}</div> },
          { key: 'employee_name', header: 'الموظف المرتبط', render: (r: any) => (r.employee_name ? `${r.employee_name} (${r.employee_number})` : '—') },
          { key: 'is_active', header: 'الحالة', render: (r: any) => (r.archived_at ? <Badge tone="warning">مؤرشف</Badge> : r.is_active ? <Badge tone="success">نشط</Badge> : <Badge>معطل</Badge>) },
          { key: 'last_login_at', header: 'آخر دخول', sortKey: 'last_login_at', render: (r: any) => fmtDateTime(r.last_login_at) },
        ]}
        rowActions={(r: any) => (<>
          {!r.archived_at && <IconButton label="الأدوار والمواقع" onClick={() => setAccess(r)}><ShieldCheck className="h-4 w-4" /></IconButton>}
          {!r.archived_at && <IconButton label="تعديل" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></IconButton>}
          {!r.archived_at && <IconButton label="إعادة تعيين كلمة المرور" onClick={() => setPw(r)}><KeyRound className="h-4 w-4" /></IconButton>}
          {!r.archived_at ? <IconButton label="أرشفة" onClick={() => setArch(r)}><Archive className="h-4 w-4" /></IconButton> : <IconButton label="استعادة" onClick={() => archive.mutate({ u: r, restore: true })}><ArchiveRestore className="h-4 w-4" /></IconButton>}
        </>)} />
      <FormModal open={creating} onClose={() => setCreating(false)} title="مستخدم جديد" submitLabel="إنشاء" initial={{ roles: ['employee'] }}
        fields={[
          { name: 'full_name', label: 'الاسم', required: true },
          { name: 'email', label: 'البريد الإلكتروني (اسم الدخول)', type: 'email', required: true },
          { name: 'password', label: 'كلمة المرور المؤقتة', type: 'password', required: true, hint: pwHint },
          { name: 'employee_id', label: 'ربط بملف موظف', type: 'select', options: emps.options },
          { name: 'roles', label: 'الأدوار', type: 'multiselect', options: options('app_role'), wide: true },
        ]}
        onSubmit={(p) => create.mutateAsync(p)}>
        {() => <p className="mt-2 text-xs text-muted">لإسناد مواقع لمشرف، استخدم زر "الأدوار والمواقع" بعد الإنشاء. أبلغ المستخدم بكلمة المرور بطريقة آمنة واطلب منه تغييرها.</p>}
      </FormModal>
      <FormModal open={!!editing} onClose={() => setEditing(null)} title="تعديل المستخدم" initial={editing}
        fields={[
          { name: 'full_name', label: 'الاسم', required: true },
          { name: 'employee_id', label: 'ربط بملف موظف', type: 'select', options: emps.options },
          { name: 'is_active', label: 'الحساب', type: 'checkbox', hint: 'الحساب نشط ويمكنه الدخول' },
        ]}
        onSubmit={(p) => update.mutateAsync(p)} />
      <FormModal open={!!pw} onClose={() => setPw(null)} title={`كلمة مرور جديدة – ${pw?.full_name || ''}`} submitLabel="تعيين"
        fields={[{ name: 'password', label: 'كلمة المرور الجديدة', type: 'password', required: true, hint: pwHint }]}
        onSubmit={(p) => reset.mutateAsync(p)} />
      {access && <AccessModal user={access} onClose={() => setAccess(null)} />}
      <ConfirmDialog open={!!arch} onClose={() => setArch(null)} danger confirmLabel="أرشفة" loading={archive.isPending} onConfirm={() => archive.mutate({ u: arch })}
        title="أرشفة المستخدم" message="سيُمنع المستخدم من الدخول ويُحتفظ بسجله وتاريخه. يمكن استعادته لاحقًا." />
    </>
  );
}

function PermissionMatrix() {
  const roles = useList('roles', { pageSize: 20, sort: 'key' });
  const perms = useList('permissions', { pageSize: 200, sort: 'category' });
  const rp = useList('role_permissions', { pageSize: 1000 });
  const toggle = useAction(({ role_id, permission_id, on }: { role_id: string; permission_id: string; on: boolean }) =>
    on ? api.create('role_permissions', { role_id, permission_id }) : api.remove('role_permissions', { role_id, permission_id }), { success: 'تم تحديث الصلاحية' });
  const set = useMemo(() => new Set((rp.data?.rows ?? []).map((x: any) => `${x.role_id}:${x.permission_id}`)), [rp.data]);
  if (roles.isLoading || perms.isLoading || rp.isLoading) return <Spinner />;
  const rs = roles.data?.rows ?? [];
  const ps = perms.data?.rows ?? [];
  let lastCat = '';
  return (
    <Card>
      <Alert tone="info" className="mb-3">الصلاحيات تُطبَّق في قاعدة البيانات (RLS) وليس في الواجهة فقط. نطاق المشرف يقتصر على مواقعه. صلاحيات مدير النظام ثابتة لمنع فقدان الوصول.</Alert>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr><th className="th">الصلاحية</th>{rs.map((r: any) => <th key={r.id} className="th text-center">{label('app_role', r.key)}</th>)}</tr></thead>
        <tbody>{ps.map((p: any) => {
          const head = p.category !== lastCat; lastCat = p.category;
          return [
            head && <tr key={`c-${p.category}`}><td colSpan={rs.length + 1} className="bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">{p.category}</td></tr>,
            <tr key={p.id} className="border-t border-border">
              <td className="td">{p.name}<div className="ltr text-xs text-muted">{p.key}</div></td>
              {rs.map((r: any) => {
                const on = set.has(`${r.id}:${p.id}`);
                return <td key={r.id} className="td text-center"><div className="inline-flex"><Checkbox label={<span className="sr-only">{`${p.name} – ${label('app_role', r.key)}`}</span>} checked={on} disabled={r.key === 'system_admin' || toggle.isPending} onChange={(v) => toggle.mutate({ role_id: r.id, permission_id: p.id, on: v })} /></div></td>;
              })}
            </tr>,
          ];
        })}</tbody>
      </table></div>
    </Card>
  );
}

export default function Users() {
  const [tab, setTab] = useState<'users' | 'matrix'>('users');
  return (
    <div>
      <PageHeader title="المستخدمون والصلاحيات" icon={<ShieldCheck className="h-6 w-6" />} description="إدارة الحسابات والأدوار الخمسة ونطاق المواقع لكل مشرف، ومصفوفة صلاحيات الأدوار." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'users', label: 'المستخدمون' }, { value: 'matrix', label: 'مصفوفة الصلاحيات' }]} />
      {tab === 'users' ? <UsersTab /> : <PermissionMatrix />}
    </div>
  );
}
