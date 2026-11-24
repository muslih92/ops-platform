-- =====================================================================
-- نموذج الموظف بالكتابة الحرة: الإدارة والموقع والخط والوردية تُكتب نصًا
-- ويُربط النص بسجل موجود بنفس الاسم أو يُنشأ تلقائيًا. المدير المباشر
-- يُربط بموظف بنفس الاسم أو الرقم، وإلا يُحفظ كنص. رصيد الإجازة رقم حر.
-- لا يغيّر أي بيانات موجودة.
-- =====================================================================

alter table employees add column manager_text text check (manager_text is null or length(manager_text) <= 150);

-- leave entitlement: any number of days the administrator types (was 30 or 33 only)
alter table employees drop constraint if exists employees_annual_leave_days_check;
alter table employees add constraint employees_annual_leave_days_check check (annual_leave_days between 0 and 60);
alter table leave_balances drop constraint if exists leave_balances_entitlement_check;
alter table leave_balances add constraint leave_balances_entitlement_check check (entitlement between 0 and 60);

-- Resolve typed names to records (find by name/code, or create).
create or replace function app.resolve_employee_refs(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  dep text := nullif(trim(p->>'department'), '');
  sit text := nullif(trim(p->>'site'), '');
  lin text := nullif(trim(p->>'line'), '');
  shf text := nullif(trim(p->>'shift'), '');
  mgr text := nullif(trim(p->>'manager'), '');
  v_dep uuid; v_site uuid; v_line uuid; v_shift uuid; v_mgr uuid; v_code text; n int := 1;
  rot jsonb := (select value from system_settings where key = 'rotation');
begin
  if not app.has_perm('employees.manage') then
    raise exception 'ليست لديك صلاحية إدارة بيانات الموظفين' using errcode = '42501';
  end if;

  if dep is not null then
    if length(dep) < 2 then raise exception 'اسم الإدارة/القسم قصير جدًا'; end if;
    select id into v_dep from departments where archived_at is null and lower(name) = lower(dep) limit 1;
    if v_dep is null then insert into departments(name) values (dep) returning id into v_dep; end if;
  end if;

  if sit is not null then
    if length(sit) < 2 then raise exception 'اسم الموقع قصير جدًا'; end if;
    select id into v_site from sites where archived_at is null and (lower(name) = lower(sit) or lower(code) = lower(sit)) order by (lower(name) = lower(sit)) desc limit 1;
    if v_site is null then
      v_code := left(sit, 40);
      while exists (select 1 from sites where lower(sites.code) = lower(v_code)) loop
        n := n + 1; v_code := left(sit, 36) || '-' || n;
      end loop;
      insert into sites(name, code, type) values (left(sit, 150), v_code, 'other') returning id into v_site;
    end if;
  end if;

  if lin is not null then
    if v_site is null then raise exception 'اكتب الموقع الأساسي قبل الخط'; end if;
    select id into v_line from lines where archived_at is null and lines.site_id = v_site
      and (lower(name) = lower(lin) or lower(code) = lower(lin)) limit 1;
    if v_line is null then insert into lines(name, code, site_id) values (left(lin, 150), left(lin, 40), v_site) returning id into v_line; end if;
  end if;

  if shf is not null then
    select id into v_shift from shifts where archived_at is null and (shifts.site_id is null or shifts.site_id = v_site)
      and (lower(name) = lower(shf) or lower(code) = lower(shf)) order by shifts.site_id nulls last limit 1;
    if v_shift is null then
      insert into shifts(name, code, start_time, end_time)
      values (left(shf, 100), left(shf, 40), coalesce(rot->>'day_start', '06:00')::time, coalesce(rot->>'night_start', '18:00')::time)
      returning id into v_shift;
    end if;
  end if;

  if mgr is not null then
    select id into v_mgr from employees where archived_at is null and (lower(full_name) = lower(mgr) or employee_number = mgr) limit 1;
  end if;

  return jsonb_build_object('department_id', v_dep, 'primary_site_id', v_site, 'line_id', v_line, 'shift_id', v_shift,
                            'manager_id', v_mgr, 'manager_text', case when v_mgr is null then mgr end);
end $$;
grant execute on function app.resolve_employee_refs(jsonb) to app_user;

drop view v_employees;
create view v_employees with (security_invoker = true) as
  select e.*, s.name as site_name, s.type as site_type, l.name as line_name, f.name as shift_name, d.name as department_name,
         coalesce(m.full_name, e.manager_text) as manager_name,
         (select u.id from users u where u.employee_id = e.id and u.archived_at is null limit 1) as user_id,
         g.code as group_code, g.name as group_name, g.color as group_color
  from employees e
  left join sites s on s.id = e.primary_site_id
  left join lines l on l.id = e.line_id
  left join shifts f on f.id = e.shift_id
  left join departments d on d.id = e.department_id
  left join employee_directory m on m.id = e.manager_id
  left join shift_groups g on g.id = e.group_id;
grant select on v_employees to app_user;
