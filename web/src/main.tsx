import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { AppShell, useTheme } from './layout/AppShell';
import { PermissionDenied, Spinner } from './components/ui';
import Login from './pages/Login';
import PendingActivation from './pages/PendingActivation';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employees = lazy(() => import('./pages/Employees'));
const EmployeeProfile = lazy(() => import('./pages/EmployeeProfile'));
const Sites = lazy(() => import('./pages/Sites'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Rotation = lazy(() => import('./pages/Rotation'));
const Tasks = lazy(() => import('./pages/Tasks'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const Handover = lazy(() => import('./pages/Handover'));
const HandoverDetail = lazy(() => import('./pages/HandoverDetail'));
const Leaves = lazy(() => import('./pages/Leaves'));
const Skills = lazy(() => import('./pages/Skills'));
const Development = lazy(() => import('./pages/Development'));
const Initiatives = lazy(() => import('./pages/Initiatives'));
const Performance = lazy(() => import('./pages/Performance'));
const Reports = lazy(() => import('./pages/Reports'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Audit = lazy(() => import('./pages/Audit'));

const qc = new QueryClient({
  defaultOptions: { queries: { retry: (n, e: any) => n < 1 && ![401, 403, 404].includes(e?.status), refetchOnWindowFocus: false, staleTime: 15_000 } },
});

function Guard({ allow, children }: { allow: (a: ReturnType<typeof useAuth>) => boolean; children: React.ReactNode }) {
  const a = useAuth();
  return allow(a) ? <>{children}</> : <PermissionDenied />;
}

function MyProfile() {
  const a = useAuth();
  if (!a.me?.employee) return <PermissionDenied message="حسابك غير مرتبط بملف موظف. اطلب من مدير النظام ربطه." />;
  return <Navigate to={`/employees/${a.me.employee.id}`} replace />;
}

function Root() {
  useTheme();
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!me) return <Login />;
  if (me.roles.length === 0) return <PendingActivation />;
  const operational = (a: ReturnType<typeof useAuth>) => !a.isReportOnly;
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Guard allow={(a) => a.isManager}><Employees /></Guard>} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="me" element={<MyProfile />} />
          <Route path="sites" element={<Guard allow={(a) => a.isManager}><Sites /></Guard>} />
          <Route path="shifts" element={<Guard allow={operational}><Shifts /></Guard>} />
          <Route path="rotation" element={<Guard allow={operational}><Rotation /></Guard>} />
          <Route path="tasks" element={<Guard allow={operational}><Tasks /></Guard>} />
          <Route path="tasks/:id" element={<Guard allow={operational}><TaskDetail /></Guard>} />
          <Route path="handover" element={<Guard allow={operational}><Handover /></Guard>} />
          <Route path="handover/:id" element={<Guard allow={operational}><HandoverDetail /></Guard>} />
          <Route path="leaves" element={<Guard allow={operational}><Leaves /></Guard>} />
          <Route path="skills" element={<Guard allow={operational}><Skills /></Guard>} />
          <Route path="development" element={<Guard allow={operational}><Development /></Guard>} />
          <Route path="initiatives" element={<Guard allow={operational}><Initiatives /></Guard>} />
          <Route path="performance" element={<Guard allow={(a) => a.can('reviews.manage') || !!a.me?.employee || a.hasRole('operations_manager', 'system_admin')}><Performance /></Guard>} />
          <Route path="reports" element={<Guard allow={(a) => a.can('reports.view')}><Reports /></Guard>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="users" element={<Guard allow={(a) => a.can('users.manage')}><Users /></Guard>} />
          <Route path="settings" element={<Guard allow={(a) => a.can('settings.manage') || a.can('integrations.manage')}><Settings /></Guard>} />
          <Route path="audit" element={<Guard allow={(a) => a.can('audit.view')}><Audit /></Guard>} />
          <Route path="*" element={<div className="card p-8 text-center"><h1 className="text-lg font-semibold">الصفحة غير موجودة</h1></div>} />
        </Route>
      </Routes>
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <Root />
          <Toaster position="top-center" dir="rtl" richColors closeButton toastOptions={{ style: { fontFamily: 'inherit' } }} />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
