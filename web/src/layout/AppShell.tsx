import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Moon, Sun, X, Droplets, KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { label } from '@/lib/i18n';
import { cx, IconButton } from '@/components/ui';
import { NAV } from './nav';
import { ChangePasswordModal } from './ChangePassword';

export function useBranding() {
  return useQuery({ queryKey: ['branding'], queryFn: () => api.get('/api/public/branding'), staleTime: 5 * 60_000 });
}

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme') ? localStorage.getItem('theme') === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);
  return [dark, setDark] as const;
}

export function Logo({ size = 36 }: { size?: number }) {
  const b = useBranding();
  if (b.data?.logo_path) return <img src={`/api/public/logo?v=${encodeURIComponent(b.data.logo_path)}`} alt="شعار الجهة" style={{ height: size, width: size }} className="rounded-md bg-white object-contain p-0.5" />;
  return (
    <div className="flex items-center justify-center rounded-md bg-accent text-white" style={{ height: size, width: size }} aria-hidden>
      <Droplets className="h-5 w-5" />
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const b = useBranding();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-fg">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <Logo />
        <div className="min-w-0">
          <div className="text-sm font-bold leading-snug">{b.data?.platform_name || 'منظومة إدارة وتمكين فريق التشغيل'}</div>
          <div className="truncate text-xs text-sidebar-muted">{b.data?.org_name}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="القائمة الرئيسية">
        {NAV.map((g) => {
          const items = g.items.filter((i) => i.allow(auth));
          if (!items.length) return null;
          return (
            <div key={g.label} className="mb-3">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">{g.label}</div>
              {items.map((i) => {
                const badge = i.badge?.(auth);
                return (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={onNavigate}
                    className={({ isActive }) => cx('flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm transition-colors',
                      isActive ? 'bg-sidebar-active font-semibold text-white' : 'text-sidebar-fg/90 hover:bg-white/10')}>
                    {i.icon}<span className="flex-1">{i.label}</span>
                    {badge ? <span className="num rounded-full bg-danger px-1.5 text-xs text-white">{badge}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3 text-xs text-sidebar-muted">
        <div className="truncate font-medium text-sidebar-fg">{auth.me?.user.full_name}</div>
        <div className="truncate">{auth.me?.roles.map((r) => label('app_role', r)).join('، ')}</div>
      </div>
    </div>
  );
}

export function AppShell() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useTheme();
  const [pw, setPw] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const brand = useBranding();
  useEffect(() => { if (brand.data?.platform_name) document.title = brand.data.platform_name; }, [brand.data]);

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">تخطي إلى المحتوى</a>
      <aside className="no-print sticky top-0 hidden h-screen w-72 shrink-0 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="القائمة">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-[86%] max-w-xs shadow-xl">
            <Sidebar onNavigate={() => setOpen(false)} />
            <IconButton label="إغلاق القائمة" className="absolute end-2 top-3 text-white hover:bg-white/10" onClick={() => setOpen(false)}><X className="h-5 w-5" /></IconButton>
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-2 backdrop-blur sm:px-4">
          <IconButton label="فتح القائمة" className="lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></IconButton>
          <div className="min-w-0 flex-1 truncate text-sm text-muted">
            {auth.me?.employee ? `${auth.me.employee.full_name} · ${auth.me.employee.site_name || ''}` : auth.me?.user.full_name}
          </div>
          <Link to="/notifications" className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2" aria-label={`الإشعارات${auth.me?.unreadNotifications ? `، ${auth.me.unreadNotifications} غير مقروءة` : ''}`}>
            <Bell className="h-5 w-5" />
            {!!auth.me?.unreadNotifications && <span className="num absolute end-1.5 top-1.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] leading-[18px] text-white">{auth.me.unreadNotifications > 99 ? '99+' : auth.me.unreadNotifications}</span>}
          </Link>
          <IconButton label={dark ? 'الوضع الفاتح' : 'الوضع الداكن'} onClick={() => setDark(!dark)}>{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</IconButton>
          <IconButton label="تغيير كلمة المرور" onClick={() => setPw(true)}><KeyRound className="h-5 w-5" /></IconButton>
          <IconButton label="تسجيل الخروج" onClick={() => auth.logout()}><LogOut className="h-5 w-5 rtl:-scale-x-100" /></IconButton>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1500px] p-3 sm:p-5">
          <Outlet />
        </main>
      </div>
      <ChangePasswordModal open={pw} onClose={() => setPw(false)} />
    </div>
  );
}
