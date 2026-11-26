import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Moon, Sun, Timer, Wallet, CheckCircle2, ClipboardList, Clock, GaugeCircle, GraduationCap, Hourglass, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useOptions, useRpc, useSites } from '@/lib/hooks';
import { fmtDate, fmtDateTime, fmtTime, fmtWeekday, todayISO } from '@/lib/format';
import { label } from '@/lib/i18n';
import { Alert, Badge, Card, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, StatCard } from '@/components/ui';
import { HBarChart, ORDINAL_BLUE, SERIES } from '@/components/Charts';

const covTone: Record<string, any> = { below: 'danger', at_min: 'warning', ok: 'success', no_rule: 'neutral' };
const covLabel: Record<string, string> = { below: 'أقل من الحد الأدنى', at_min: 'عند الحد الأدنى', ok: 'تغطية جيدة', no_rule: 'بدون قاعدة' };

export default function Dashboard() {
  const auth = useAuth();
  const nav = useNavigate();
  const [site, setSite] = useState('');
  const [shift, setShift] = useState('');
  const [from, setFrom] = useState(todayISO(-30));
  const [to, setTo] = useState(todayISO());
  const sites = useSites();
  const shifts = useOptions('shifts', { label: (r) => `${r.name} – ${r.site_name || 'عام'}`, filters: site ? { site_id: site } : undefined, sort: 'site_name' });
  const args = useMemo(() => ({ site_id: site || null, shift_id: shift || null, from, to }), [site, shift, from, to]);
  const q = useRpc<any>('dashboard', args);
  const d = q.data;
  const personal = !auth.isManager && !auth.isGlobal;

  return (
    <div>
      <PageHeader title="لوحة المؤشرات" icon={<GaugeCircle className="h-6 w-6" />}
        description={personal ? 'ملخص مهامك وإجازاتك وتطورك' : 'نظرة موحدة على الفريق والتغطية والمهارات والمهام وفق صلاحياتك'} />

      {!personal && (
        <div className="card no-print mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="label text-xs" htmlFor="d-site">الموقع</label>
            <Select id="d-site" value={site} onChange={(e) => { setSite(e.target.value); setShift(''); }} options={sites.options} placeholder="كل المواقع المصرح بها" /></div>
          <div><label className="label text-xs" htmlFor="d-shift">الوردية</label>
            <Select id="d-shift" value={shift} onChange={(e) => setShift(e.target.value)} options={shifts.options} placeholder="كل الورديات" /></div>
          <div><label className="label text-xs" htmlFor="d-from">من تاريخ</label><Input id="d-from" type="date" dir="ltr" className="text-end" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label text-xs" htmlFor="d-to">إلى تاريخ</label><Input id="d-to" type="date" dir="ltr" className="text-end" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      )}

      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {!personal && <StatCard label="الموظفون النشطون" value={d.active_employees} icon={<Users className="h-5 w-5" />} onClick={() => nav('/employees')} />}
            <StatCard label="مهام جديدة ومسندة" value={d.tasks.new} icon={<ClipboardList className="h-5 w-5" />} tone="info" onClick={() => nav('/tasks?status=new,assigned')} />
            <StatCard label="قيد التنفيذ" value={d.tasks.in_progress} icon={<Clock className="h-5 w-5" />} onClick={() => nav('/tasks?status=in_progress')} />
            <StatCard label="مهام متأخرة" value={d.tasks.overdue} icon={<AlertTriangle className="h-5 w-5" />} tone={d.tasks.overdue ? 'danger' : 'success'} onClick={() => nav('/tasks?overdue=true')} />
            <StatCard label="بانتظار جهة أخرى" value={d.tasks.waiting} icon={<Hourglass className="h-5 w-5" />} tone="warning" hint="لا تُحتسب تأخيرًا على الموظف" onClick={() => nav('/tasks?status=waiting_other_party')} />
            <StatCard label="مكتملة خلال الفترة" value={d.tasks.completed} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
            <StatCard label={personal ? 'طلباتي بانتظار القرار' : 'إجازات بانتظار المراجعة'} value={d.leaves_pending} icon={<CalendarDays className="h-5 w-5" />} tone={d.leaves_pending ? 'warning' : 'neutral'} hint={`في إجازة اليوم: ${d.leaves_current}`} onClick={() => nav('/leaves')} />
            <StatCard label="ملاحظات تسليم مفتوحة" value={d.handover_open} icon={<ShieldAlert className="h-5 w-5" />} tone={d.handover_open ? 'warning' : 'neutral'} onClick={() => nav('/handover')} />
          </div>

          <RotationPanel site={site || null} personal={personal} />

          {!personal && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="تغطية المواقع والورديات اليوم" actions={<Link to="/shifts" className="text-sm text-accent hover:underline">التفاصيل</Link>} bodyClass="p-0">
                {d.coverage.length === 0 ? <EmptyState title="لا توجد ورديات تعمل اليوم ضمن المواقع المصرح بها" /> : (
                  <div className="max-h-[360px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-surface-2"><tr><th className="th">الموقع / الوردية</th><th className="th">المتاح / المسند</th><th className="th">الحد الأدنى</th><th className="th">الحالة</th></tr></thead>
                      <tbody>
                        {d.coverage.map((c: any) => (
                          <tr key={c.site_id + c.shift_id} className="border-t border-border">
                            <td className="td"><div className="font-medium">{c.site_name}</div><div className="text-xs text-muted">{c.shift_name} · <span className="ltr">{fmtTime(c.start_time)}–{fmtTime(c.end_time)}</span></div></td>
                            <td className="td num">{c.available} / {c.assigned}{c.absent ? <span className="text-xs text-muted"> (غياب {c.absent})</span> : null}</td>
                            <td className="td num">{c.min_staff || '—'}</td>
                            <td className="td"><Badge tone={covTone[c.status]}>{c.status === 'below' && <AlertTriangle className="h-3 w-3" />}{covLabel[c.status]}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card title="مهارات أساسية بلا بديل مؤهل" actions={<Link to="/skills?tab=gaps" className="text-sm text-accent hover:underline">مصفوفة المهارات</Link>} bodyClass="p-0">
                {d.skill_gaps.length === 0 ? <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="لا توجد فجوات حرجة" description="كل مهارة أساسية لديها مؤهلان على الأقل في كل موقع." /> : (
                  <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
                    {d.skill_gaps.map((g: any) => (
                      <li key={g.site_id + g.skill_id} className="flex items-start gap-3 px-4 py-2.5">
                        <AlertTriangle className={g.available === 0 ? 'mt-0.5 h-4 w-4 text-danger' : 'mt-0.5 h-4 w-4 text-warning'} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{g.skill_name}</div>
                          <div className="text-xs text-muted">{g.site_name} · {g.domain_name}</div>
                        </div>
                        <Badge tone={g.available === 0 ? 'danger' : 'warning'}>{g.available === 0 ? 'لا يوجد مؤهل متاح' : 'مؤهل واحد فقط'}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {!personal && (
            <div className="grid gap-4 xl:grid-cols-3">
              <Card title="توزيع الموظفين حسب الموقع">
                {d.by_site.length ? <HBarChart data={d.by_site} categoryKey="name" series={[{ key: 'count', name: 'عدد الموظفين', color: SERIES[0] }]} /> : <EmptyState title="لا يوجد موظفون" />}
              </Card>
              <Card title="المهام حسب الموقع">
                {d.tasks_by_site.length ? <HBarChart data={d.tasks_by_site} categoryKey="name" stacked series={[
                  { key: 'open', name: 'مفتوحة', color: SERIES[0] }, { key: 'overdue', name: 'متأخرة', color: SERIES[1] }, { key: 'completed', name: 'مكتملة', color: SERIES[2] }]} /> : <EmptyState title="لا توجد مهام" />}
              </Card>
              <Card title="مستويات المهارات حسب المجال">
                {d.skills_by_level.length ? <HBarChart data={d.skills_by_level} categoryKey="domain" stacked series={[1, 2, 3, 4].map((l, i) => ({ key: `l${l}`, name: `${l} – ${label('skill_level', l)}`, color: ORDINAL_BLUE[i] }))} /> : <EmptyState title="لا توجد تقييمات" />}
              </Card>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="التدريب والتطوير" actions={<Link to="/development" className="text-sm text-accent hover:underline">عرض</Link>}>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-surface-2 p-2"><div className="num text-xl font-bold">{d.training.plans_active}</div><div className="text-xs text-muted">خطط جارية</div></div>
                <div className="rounded-md bg-danger-soft p-2"><div className="num text-xl font-bold text-danger">{d.training.plans_overdue}</div><div className="text-xs text-muted">خطط متأخرة</div></div>
                <div className="rounded-md bg-surface-2 p-2"><div className="num text-xl font-bold">{d.reassess_due}</div><div className="text-xs text-muted">إعادة تقييم قريبة</div></div>
              </div>
              <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold"><GraduationCap className="h-4 w-4" /> الدورات القادمة</h3>
              {d.upcoming_courses.length === 0 ? <p className="text-sm text-muted">لا توجد دورات قادمة.</p> : (
                <ul className="space-y-1">{d.upcoming_courses.map((c: any) => <li key={c.id} className="flex justify-between gap-2 text-sm"><span className="truncate">{c.name}</span><span className="shrink-0 text-muted">{fmtDate(c.start_date)}</span></li>)}</ul>
              )}
            </Card>
            <Card title="ملاحظات وردية تحتاج متابعة" actions={<Link to="/handover" className="text-sm text-accent hover:underline">عرض</Link>} bodyClass="p-0">
              {d.handover_open_items.length === 0 ? <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="لا توجد ملاحظات مفتوحة" /> : (
                <ul className="divide-y divide-border">
                  {d.handover_open_items.map((i: any) => (
                    <li key={i.id}><Link to={`/handover/${i.report_id}`} className="block px-4 py-2.5 hover:bg-surface-2">
                      <div className="text-sm font-medium">{i.description}</div>
                      <div className="text-xs text-muted">{label('handover_item_kind', i.kind)} · {i.site} · {fmtDateTime(i.at)}</div>
                    </Link></li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="آخر التحديثات" bodyClass="p-0">
              {d.recent_activity.length === 0 ? <EmptyState title="لا توجد أنشطة بعد" /> : (
                <ul className="divide-y divide-border">
                  {d.recent_activity.map((a: any) => (
                    <li key={a.id}><Link to={`/tasks/${a.task_id}`} className="block px-4 py-2.5 hover:bg-surface-2">
                      <div className="truncate text-sm font-medium">{a.title}</div>
                      <div className="text-xs text-muted">{eventText(a)} · {a.actor || 'النظام'} · {fmtDateTime(a.at)}</div>
                    </Link></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          {auth.isReportOnly && <Alert tone="info">دورك «قارئ التقارير»: يمكنك الاطلاع على المؤشرات والتقارير فقط دون أي تعديل.</Alert>}
        </div>
      )}
    </div>
  );
}

export function eventText(e: { event_type: string; to_status?: string; note?: string }) {
  switch (e.event_type) {
    case 'created': return 'أُنشئت المهمة';
    case 'status_changed': return `تغيرت الحالة إلى «${label('task_status', e.to_status)}»`;
    case 'comment': return 'تعليق جديد';
    case 'attachment': return `مرفق: ${e.note || ''}`;
    case 'reassigned': return 'أعيد الإسناد';
    case 'assignee_added': return `أضيف مشارك: ${e.note || ''}`;
    case 'assignee_removed': return `أزيل مشارك: ${e.note || ''}`;
    case 'reviewed': return 'تم اعتماد المهمة';
    case 'edited': return 'تعديل بيانات المهمة';
    case 'archived': return 'أُرشفت المهمة';
    default: return e.event_type;
  }
}

const DAYS = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
const shortDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`; };

/** Rotation groups, pending requests, overtime and leave balances (rules section). */
function RotationPanel({ site, personal }: { site: string | null; personal: boolean }) {
  const nav = useNavigate();
  const q = useRpc<any>('rotation_dashboard', { site_id: site });
  const r = q.data;
  if (!r) return <Skeleton className="h-40" />;
  const pend = r.pending;
  const pendTotal = pend.swaps + pend.coverage + pend.transfers + pend.overtime;
  const otTotal = r.overtime_month.reduce((a: number, x: any) => a + Number(x.hours), 0);
  const shiftCard = (k: 'D' | 'N') => {
    const t = r.today.find((x: any) => x.kind === k);
    return (
      <div className={`rounded-lg border p-3 ${k === 'D' ? 'border-warning/40 bg-warning-soft' : 'border-accent/40 bg-accent/10'}`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">{k === 'D' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}الوردية {k === 'D' ? 'النهارية' : 'الليلية'} اليوم</div>
        <div className="mt-1 text-2xl font-bold text-fg">المجموعة {t?.group ?? '—'}</div>
        <div className="mt-1 text-xs text-muted">حاضر <b className="num text-fg">{t?.present ?? 0}</b> من <span className="num">{t?.total ?? 0}</span>
          {t?.absent ? <> · إجازة <b className="num text-danger">{t.absent}</b></> : null}{t?.covering ? <> · تغطية <b className="num">{t.covering}</b></> : null}</div>
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="المناوبات اليوم" actions={<Link to="/rotation" className="text-sm text-accent hover:underline">الجدول</Link>}>
          <div className="grid grid-cols-2 gap-2">{shiftCard('D')}{shiftCard('N')}</div>
          <div className="mt-3 grid grid-cols-8 gap-1 text-center text-xs">
            <div />{r.next_days.map((x: any) => <div key={x.day} className="text-muted" title={fmtDate(x.day)}>{shortDay(x.day)}</div>)}
            <div className="flex justify-center"><Sun className="h-3.5 w-3.5" /></div>{r.next_days.map((x: any) => <div key={x.day} className="rounded bg-warning-soft py-1 font-semibold text-warning">{x.D}</div>)}
            <div className="flex justify-center"><Moon className="h-3.5 w-3.5" /></div>{r.next_days.map((x: any) => <div key={x.day} className="rounded bg-accent/10 py-1 font-semibold text-accent">{x.N}</div>)}
          </div>
        </Card>
        <Card title="طلبات بانتظار الاعتماد" actions={<Link to="/rotation?tab=swaps" className="text-sm text-accent hover:underline">عرض</Link>}>
          {pendTotal === 0 ? <EmptyState title="لا توجد طلبات معلقة" /> : (
            <div className="grid grid-cols-2 gap-2">
              {[['swaps', 'تبديل ورديات'], ['coverage', 'تغطية'], ['transfers', 'نقل موظفين'], ['overtime', 'عمل إضافي']].map(([k, l]) => (
                <button key={k} onClick={() => nav(`/rotation?tab=${k}`)} className="rounded-lg border border-border p-3 text-start hover:bg-surface-2">
                  <div className={`num text-2xl font-bold ${pend[k] ? 'text-warning' : 'text-muted'}`}>{pend[k]}</div><div className="text-xs text-muted">{l}</div>
                </button>))}
            </div>)}
        </Card>
        <Card title="العمل الإضافي هذا الشهر" actions={<Link to="/rotation?tab=overtime" className="text-sm text-accent hover:underline">السجل</Link>}>
          <div className="mb-2 flex items-center gap-2"><Timer className="h-5 w-5 text-muted" /><span className="num text-2xl font-bold">{otTotal}</span><span className="text-sm text-muted">ساعة معتمدة</span></div>
          {r.overtime_month.length === 0 ? <EmptyState title="لا يوجد عمل إضافي معتمد هذا الشهر" /> : (
            <ul className="space-y-2">{r.overtime_month.map((x: any) => (
              <li key={x.cause} className="text-sm">
                <div className="flex justify-between"><span>{label('overtime_cause', x.cause)}</span><span className="num font-semibold">{Number(x.hours)} ساعة</span></div>
                <div className="mt-1 h-2 rounded bg-surface-2"><div className="h-2 rounded" style={{ width: `${(Number(x.hours) / otTotal) * 100}%`, background: SERIES[1] }} /></div>
              </li>))}</ul>)}
          {!personal && r.overtime_top.length > 0 && <div className="mt-2 text-xs text-muted">الأعلى: {r.overtime_top.slice(0, 3).map((x: any) => `${x.name} (${x.hours})`).join('، ')}</div>}
        </Card>
      </div>
      <Card title={personal ? 'رصيد إجازتي السنوية' : 'أرصدة الإجازة السنوية وحد الترحيل (10 أيام)'} actions={<Link to="/leaves?tab=balances" className="text-sm text-accent hover:underline">التفاصيل</Link>}>
        {r.leave.above_cap > 0 && r.year_end_alert && <Alert tone="danger" className="mb-3" title="اقتربت نهاية السنة">{personal ? 'رصيدك يتجاوز 10 أيام، وما زاد لن يُرحَّل. خطط لإجازتك.' : `${r.leave.above_cap} موظف رصيدهم أكثر من 10 أيام، والزائد لن يُرحَّل.`}</Alert>}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid grid-cols-2 gap-2 md:col-span-1">
            <StatCard label="فوق حد الترحيل" value={r.leave.above_cap} icon={<Wallet className="h-5 w-5" />} tone={r.leave.above_cap ? 'danger' : 'success'} onClick={() => nav('/leaves?tab=balances')} />
            <StatCard label="أيام لن تُرحَّل" value={Number(r.leave.above_cap_days)} tone={r.leave.above_cap_days ? 'warning' : 'neutral'} hint={`أرصدة مُدخلة: ${r.leave.entered} من ${r.leave.employees}`} />
          </div>
          <div className="md:col-span-2">
            {r.leave.top.length === 0 ? <EmptyState title={personal ? 'رصيدك ضمن حد الترحيل' : 'لا أحد فوق حد الترحيل'} /> : (
              <ul className="divide-y divide-border rounded-lg border border-border">{r.leave.top.map((x: any) => (
                <li key={x.name} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="flex-1 font-medium">{x.name}</span>
                  <span className="text-xs text-muted">المتبقي <b className="num text-fg">{Number(x.remaining)}</b></span>
                  <Badge tone="danger">+{Number(x.above)} فوق الحد</Badge></li>))}</ul>)}
          </div>
        </div>
      </Card>
    </div>
  );
}
