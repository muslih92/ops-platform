import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Alert, Button, Field, Input } from '@/components/ui';
import { Logo, useBranding } from '@/layout/AppShell';

export default function Login() {
  const qc = useQueryClient();
  const b = useBranding();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setup = b.data?.setup_required && b.data?.setup_via_signup;
  const setupConsole = b.data?.setup_required && !b.data?.setup_via_signup;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password || (mode === 'signup' && !fullName)) { setError('يرجى تعبئة جميع الحقول'); return; }
    setLoading(true);
    try {
      if (mode === 'login') await api.post('/api/auth/login', { email, password });
      else await api.post('/api/auth/signup', { email, password, full_name: fullName });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['branding'] });
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-3 text-xl font-bold sm:text-2xl">{b.data?.platform_name || 'منظومة إدارة وتمكين فريق التشغيل'}</h1>
          <p className="mt-1 text-sm text-muted ltr">{b.data?.platform_name_en}</p>
          {b.data?.org_name && <p className="mt-1 text-sm text-muted">{b.data.org_name}</p>}
        </div>
        <div className="card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}</h2>
          {setup && (
            <Alert tone="info" title="الإعداد الأول للمنصة" className="mb-4">
              لا يوجد مدير نظام بعد. أول حساب يُنشأ سيحصل تلقائيًا على دور <b>مدير النظام</b>، وكل حساب بعده يبقى بانتظار التفعيل حتى يمنحه المدير دورًا.
              {mode === 'login' && <button className="ms-1 font-semibold text-accent underline" onClick={() => setMode('signup')}>إنشاء حساب المدير</button>}
            </Alert>
          )}
          {setupConsole && (
            <Alert tone="info" title="الإعداد الأول للمنصة" className="mb-4">
              لا يوجد مدير نظام بعد. يُنشأ المدير الأول من طرفية الخادم (حاوية التطبيق) بالأمر:
              <code dir="ltr" className="mt-1 block break-all text-xs">node server/scripts/create-admin.js email@example.com "الاسم"</code>
              ثم سجّل الدخول هنا بالبريد وكلمة المرور.
            </Alert>
          )}
          {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <Field label="الاسم الكامل" required>{(id) => <Input id={id} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />}</Field>
            )}
            <Field label="البريد الإلكتروني" required>{(id) => <Input id={id} type="email" dir="ltr" className="text-end" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />}</Field>
            <Field label="كلمة المرور" required hint={mode === 'signup' ? '10 أحرف على الأقل وتحتوي على أحرف وأرقام' : undefined}>
              {(id) => <Input id={id} type="password" dir="ltr" className="text-end" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
            </Field>
            <Button type="submit" className="w-full" loading={loading}>{mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</Button>
          </form>
          {b.data?.signup_enabled && (
            <p className="mt-4 text-center text-sm text-muted">
              {mode === 'login' ? 'ليس لديك حساب؟ ' : 'لديك حساب؟ '}
              <button className="font-semibold text-accent hover:underline" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}>
                {mode === 'login' ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
              </button>
            </p>
          )}
          {mode === 'signup' && !setup && (
            <p className="mt-3 rounded-md bg-surface-2 p-2 text-xs text-muted">بعد إنشاء الحساب سيبقى بانتظار التفعيل حتى يمنحك مدير النظام الدور والصلاحيات المناسبة.</p>
          )}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <ShieldCheck className="h-4 w-4" aria-hidden /> المنصة للإدارة والتوثيق والمتابعة فقط، ولا تنفذ أي أوامر تشغيل للمعدات.
        </p>
      </div>
    </div>
  );
}

export function Pending() {
  return null;
}
