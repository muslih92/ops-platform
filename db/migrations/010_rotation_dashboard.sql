-- =====================================================================
-- لوحة المؤشرات: ملخص المناوبات والطلبات والعمل الإضافي وأرصدة الإجازة
-- (يعرض فقط ما يحق للمستخدم رؤيته)
-- =====================================================================
create or replace function app.rotation_dashboard(p_site uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare yr int := extract(year from current_date)::int; m0 date := date_trunc('month', current_date)::date;
begin
  if app.uid() is null then raise exception 'غير مصرح' using errcode = '42501'; end if;
  return jsonb_build_object(
    'today', (select coalesce(jsonb_agg(x order by x->>'kind'), '[]') from (
        select jsonb_build_object('kind', r.shift_kind, 'group', min(r.group_code),
          'total', count(*) filter (where r.state <> 'covering'),
          'present', count(*) filter (where r.state not in ('absent','covering')),
          'absent', count(*) filter (where r.state = 'absent'),
          'covering', count(*) filter (where r.state = 'covering')) x
        from app.duty_roster(current_date) r
        where p_site is null or r.employee_id in (select id from employees where primary_site_id = p_site)
        group by r.shift_kind) q),
    'next_days', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'D', d, 'N', n) order by day), '[]') from (
        select day, max(group_code) filter (where actual = 'D') d, max(group_code) filter (where actual = 'N') n
        from app.rotation_calendar(current_date, current_date + 6) group by day) c),
    'pending', jsonb_build_object(
        'swaps', (select count(*) from shift_swaps where status = 'pending' and archived_at is null),
        'coverage', (select count(*) from coverage_requests r where status = 'pending' and archived_at is null
                       and app.can_see_employee(r.covering_employee_id) and (p_site is null or r.site_id = p_site)),
        'transfers', (select count(*) from group_transfers t where status = 'pending' and archived_at is null
                       and app.can_see_employee(t.employee_id) and (p_site is null or app.employee_site(t.employee_id) = p_site)),
        'overtime', (select count(*) from overtime_entries o where status = 'pending' and archived_at is null
                       and app.can_see_employee(o.employee_id) and (p_site is null or o.site_id = p_site))),
    'overtime_month', (select coalesce(jsonb_agg(x order by (x->>'hours')::numeric desc), '[]') from (
        select jsonb_build_object('cause', cause, 'hours', sum(hours), 'count', count(*)) x
        from overtime_entries o where status = 'approved' and archived_at is null and work_date >= m0
          and app.can_see_employee(o.employee_id) and (p_site is null or o.site_id = p_site)
        group by cause) q),
    'overtime_top', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('name', e.full_name, 'hours', sum(o.hours)) x
        from overtime_entries o join employees e on e.id = o.employee_id
        where o.status = 'approved' and o.archived_at is null and o.work_date >= m0
          and app.can_see_employee(o.employee_id) and (p_site is null or o.site_id = p_site)
        group by e.full_name order by sum(o.hours) desc limit 5) q),
    'leave', (select jsonb_build_object(
        'employees', count(*),
        'above_cap', count(*) filter (where above_cap > 0),
        'above_cap_days', coalesce(sum(above_cap), 0),
        'entered', count(*) filter (where has_record),
        'top', (select coalesce(jsonb_agg(jsonb_build_object('name', full_name, 'remaining', remaining, 'above', above_cap)), '[]') from (
                  select * from app.leave_balance_report(yr, p_site) where above_cap > 0 order by above_cap desc limit 5) t))
      from app.leave_balance_report(yr, p_site)),
    'year_end_alert', extract(month from current_date) >= 10
  );
end $$;
grant execute on function app.rotation_dashboard(uuid) to app_user;
