import {
  Bell, BookOpenCheck, Building2, CalendarClock, CalendarDays, ClipboardCheck, ClipboardList, FileBarChart, GaugeCircle, GraduationCap,
  History, Lightbulb, Settings, ShieldCheck, Star, UserCircle2, Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { useAuth } from '@/lib/auth';

type A = ReturnType<typeof useAuth>;
export type NavItem = { to: string; label: string; icon: ReactNode; allow: (a: A) => boolean; badge?: (a: A) => number | undefined };
export type NavGroup = { label: string; items: NavItem[] };

const ic = 'h-5 w-5 shrink-0';
const operational = (a: A) => !a.isReportOnly;

export const NAV: NavGroup[] = [
  { label: 'الرئيسية', items: [
    { to: '/', label: 'لوحة المؤشرات', icon: <GaugeCircle className={ic} />, allow: () => true },
  ] },
  { label: 'الفريق', items: [
    { to: '/employees', label: 'الموظفون', icon: <Users className={ic} />, allow: (a) => a.isManager },
    { to: '/me', label: 'ملفي الشخصي', icon: <UserCircle2 className={ic} />, allow: (a) => !!a.me?.employee },
    { to: '/sites', label: 'المواقع والمحطات والخزانات', icon: <Building2 className={ic} />, allow: (a) => a.isManager },
    { to: '/shifts', label: 'الورديات والتغطية', icon: <CalendarClock className={ic} />, allow: operational },
  ] },
  { label: 'التشغيل', items: [
    { to: '/tasks', label: 'المهام', icon: <ClipboardList className={ic} />, allow: operational },
    { to: '/handover', label: 'تسليم واستلام الوردية', icon: <ClipboardCheck className={ic} />, allow: operational },
    { to: '/leaves', label: 'الإجازات', icon: <CalendarDays className={ic} />, allow: operational },
  ] },
  { label: 'التمكين', items: [
    { to: '/skills', label: 'مصفوفة المهارات', icon: <BookOpenCheck className={ic} />, allow: operational },
    { to: '/development', label: 'خطط التطوير والتدريب', icon: <GraduationCap className={ic} />, allow: operational },
    { to: '/initiatives', label: 'المبادرات والتحسينات', icon: <Lightbulb className={ic} />, allow: operational },
    { to: '/performance', label: 'تقييم الأداء', icon: <Star className={ic} />, allow: (a) => a.can('reviews.manage') || !!a.me?.employee || a.hasRole('operations_manager', 'system_admin') },
  ] },
  { label: 'المتابعة', items: [
    { to: '/reports', label: 'التقارير', icon: <FileBarChart className={ic} />, allow: (a) => a.can('reports.view') },
    { to: '/notifications', label: 'الإشعارات', icon: <Bell className={ic} />, allow: () => true, badge: (a) => a.me?.unreadNotifications || undefined },
  ] },
  { label: 'الإدارة', items: [
    { to: '/users', label: 'المستخدمون والصلاحيات', icon: <ShieldCheck className={ic} />, allow: (a) => a.can('users.manage') },
    { to: '/settings', label: 'الإعدادات والتكاملات', icon: <Settings className={ic} />, allow: (a) => a.can('settings.manage') || a.can('integrations.manage') },
    { to: '/audit', label: 'سجل التدقيق', icon: <History className={ic} />, allow: (a) => a.can('audit.view') },
  ] },
];
