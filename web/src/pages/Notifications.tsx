import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import { DataTable } from '@/components/DataTable';
import { Alert, Badge, Button, PageHeader, Tabs } from '@/components/ui';

const TYPES: Record<string, string> = {
  task_assigned: 'إسناد مهمة', task_status: 'حالة مهمة', task_comment: 'تعليق', task_attachment: 'مرفق', task_due: 'موعد مهمة', task_overdue: 'مهمة متأخرة', task_review: 'مراجعة مهمة',
  handover: 'تسليم وردية', handover_open: 'ملاحظات مفتوحة', leave_status: 'حالة إجازة', leave_review: 'مراجعة إجازة', coverage_low: 'تغطية منخفضة',
  plan_late: 'خطة متأخرة', reassess_due: 'إعادة تقييم', review: 'تقييم أداء', idea: 'مبادرة', enrollment: 'ترشيح لدورة', skill_gap: 'فجوة مهارة',
};

export default function Notifications() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const readAll = useAction(() => api.post('/api/notifications/read-all'), { success: 'تم تعليم الكل كمقروء' });
  const markRead = useAction((id: string) => api.update('notifications', id, { read_at: new Date().toISOString() }));
  return (
    <div>
      <PageHeader title="الإشعارات" icon={<Bell className="h-6 w-6" />} description="تنبيهات داخل المنصة. البريد الإلكتروني وWhatsApp خيارات مستقبلية لا تعمل قبل إعدادها واعتمادها."
        actions={<Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} loading={readAll.isPending} onClick={() => readAll.mutate()}>تعليم الكل كمقروء</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'unread', label: 'غير المقروءة' }, { value: 'all', label: 'الكل' }]} />
      <DataTable resource="notifications" defaultSort="-created_at" baseFilters={tab === 'unread' ? { unread: true } : undefined}
        searchPlaceholder="ابحث في الإشعارات…"
        filters={[{ key: 'type', label: 'النوع', options: Object.entries(TYPES).map(([value, label]) => ({ value, label })) }]}
        onRowClick={(r: any) => { if (!r.read_at) markRead.mutate(r.id); if (r.link) nav(r.link); }}
        columns={[
          { key: 'title', header: 'الإشعار', mobile: 'title', render: (r: any) => (
            <div className="flex items-start gap-2">
              {!r.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="غير مقروء" />}
              <div><div className={r.read_at ? '' : 'font-semibold'}>{r.title}</div>{r.body && <div className="text-xs text-muted">{r.body}</div>}</div>
            </div>) },
          { key: 'type', header: 'النوع', render: (r: any) => <Badge>{TYPES[r.type] || r.type}</Badge> },
          { key: 'created_at', header: 'الوقت', sortKey: 'created_at', render: (r: any) => fmtDateTime(r.created_at) },
        ]}
        empty={{ title: tab === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات' }} />
      <Alert tone="info" className="mt-4">تُولَّد التذكيرات (المهام المستحقة والمتأخرة، الخطط المتأخرة، إعادة تقييم المهارات) تلقائيًا كل 15 دقيقة من الخادم.</Alert>
    </div>
  );
}
