import { api } from '@/lib/api';
import { toast } from 'sonner';
import { FormModal } from '@/components/EntityForm';

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <FormModal open={open} onClose={onClose} title="تغيير كلمة المرور" size="sm" submitLabel="تحديث كلمة المرور"
      fields={[
        { name: 'current_password', label: 'كلمة المرور الحالية', type: 'password', required: true },
        { name: 'new_password', label: 'كلمة المرور الجديدة', type: 'password', required: true, hint: '10 أحرف على الأقل وتحتوي على أحرف وأرقام' },
        { name: 'confirm', label: 'تأكيد كلمة المرور الجديدة', type: 'password', required: true },
      ]}
      extraValidate={(v) => (v.new_password && v.new_password !== v.confirm ? { confirm: 'كلمتا المرور غير متطابقتين' } : ({} as Record<string, string>))}
      onSubmit={async (p) => {
        await api.post('/api/auth/change-password', { current_password: p.current_password, new_password: p.new_password });
        toast.success('تم تحديث كلمة المرور. تم إنهاء الجلسات الأخرى.');
      }} />
  );
}
