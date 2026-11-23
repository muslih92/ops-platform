import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { Logo } from '@/layout/AppShell';

export default function PendingActivation() {
  const auth = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 text-center">
        <div className="mb-3 flex justify-center"><Logo size={48} /></div>
        <div className="mx-auto mb-3 w-fit rounded-full bg-warning-soft p-3 text-warning"><Clock className="h-6 w-6" /></div>
        <h1 className="text-lg font-bold">حسابك بانتظار التفعيل من مدير النظام</h1>
        <p className="mt-2 text-sm text-muted">
          تم إنشاء حساب <b className="ltr">{auth.me?.user.email}</b> بنجاح، لكن لم يُمنح أي دور بعد. سيتمكن مدير النظام من ربط حسابك بملفك الوظيفي ومنحك الدور المناسب.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => auth.refresh()}>تحقق مرة أخرى</Button>
          <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={() => auth.logout()}>تسجيل الخروج</Button>
        </div>
      </div>
    </div>
  );
}
