-- =====================================================================
-- قواعد العمل: المجموعات (A/B/C/D) والدورة 12 ساعة، التبديل، التغطية،
-- نقل الموظفين بين المجموعات، العمل الإضافي، وأرصدة الإجازة السنوية.
-- يضيف جداول وأعمدة جديدة فقط؛ البيانات الحالية تبقى كما هي.
-- =====================================================================

create type rotation_status as enum ('pending','approved','rejected','cancelled');
create type transfer_kind as enum ('permanent','temporary');
create type coverage_method as enum ('overtime','day_compensation');
create type overtime_cause as enum ('coverage','breakdown','pipe_burst','emergency','planned_work','other');

-- ---------------------------------------------------------------------
-- Groups and rotation settings
-- ---------------------------------------------------------------------
create table shift_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) between 1 and 10),
  name text not null check (length(trim(name)) between 1 and 100),
  color text not null default '#0e7490',
  cycle_start_date date not null,          -- first day-shift day of this group's cycle
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);

-- Cycle: 2 day shifts, 2 night shifts, 4 days off. Groups are staggered by 2 days,
-- so on every date exactly one group works the day shift and one the night shift.
insert into shift_groups(code, name, color, cycle_start_date) values
  ('A', 'المجموعة A', '#0e7490', date '2026-01-01'),
  ('B', 'المجموعة B', '#7c3aed', date '2026-01-03'),
  ('C', 'المجموعة C', '#b45309', date '2026-01-05'),
  ('D', 'المجموعة D', '#15803d', date '2026-01-07');

insert into system_settings(key, value) values
  ('rotation', '{"pattern": "DDNNOOOO", "day_start": "06:00", "night_start": "18:00", "shift_hours": 12}')
on conflict (key) do nothing;

alter table employees add column group_id uuid references shift_groups(id);
alter table employees add column annual_leave_days int not null default 30 check (annual_leave_days in (30, 33));
create index employees_group_idx on employees(group_id);

-- ---------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------
-- Swap between two groups. Leg A: dates group A was scheduled and group B works instead.
-- Leg B (optional return leg): dates group B was scheduled and group A works instead.
create table shift_swaps (
  id uuid primary key default gen_random_uuid(),
  group_a_id uuid not null references shift_groups(id),
  group_b_id uuid not null references shift_groups(id),
  a_start date not null, a_end date not null,
  b_start date, b_end date,
  reason text,
  status rotation_status not null default 'pending',
  decision_note text, decided_by uuid references users(id), decided_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check (group_a_id <> group_b_id),
  check (a_end >= a_start and a_end - a_start <= 6),
  check ((b_start is null) = (b_end is null)),
  check (b_start is null or (b_end >= b_start and b_end - b_start <= 6))
);
create index shift_swaps_dates_idx on shift_swaps(a_start, b_start);

create table group_transfers (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  from_group_id uuid references shift_groups(id),
  to_group_id uuid not null references shift_groups(id),
  kind transfer_kind not null,
  start_date date not null,
  end_date date,
  reason text not null check (length(trim(reason)) >= 3),
  status rotation_status not null default 'pending',
  decision_note text, decided_by uuid references users(id), decided_at timestamptz,
  applied_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check ((kind = 'permanent' and end_date is null) or (kind = 'temporary' and end_date is not null and end_date >= start_date)),
  check (from_group_id is null or from_group_id <> to_group_id)
);
create index group_transfers_emp_idx on group_transfers(employee_id, start_date);

create table overtime_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  work_date date not null,
  hours numeric(4,1) not null check (hours > 0 and hours <= 24),
  cause overtime_cause not null,
  site_id uuid references sites(id),
  description text,
  reference_no text,
  coverage_request_id uuid,
  status rotation_status not null default 'pending',
  decision_note text, decided_by uuid references users(id), decided_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);
create index overtime_emp_idx on overtime_entries(employee_id, work_date);
create index overtime_date_idx on overtime_entries(work_date);

create table coverage_requests (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  shift_kind text not null check (shift_kind in ('D','N')),
  group_id uuid references shift_groups(id),          -- group that is short-handed
  absent_employee_id uuid references employees(id),   -- whom the cover replaces (optional)
  covering_employee_id uuid not null references employees(id),
  method coverage_method not null,
  hours numeric(4,1) not null default 12 check (hours > 0 and hours <= 24),
  comp_days numeric(3,1) check (comp_days is null or (comp_days > 0 and comp_days <= 5)),
  comp_date date,                                      -- planned compensation day off (optional)
  site_id uuid references sites(id),
  reason text not null check (length(trim(reason)) >= 3),
  overtime_id uuid references overtime_entries(id),
  status rotation_status not null default 'pending',
  decision_note text, decided_by uuid references users(id), decided_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check (absent_employee_id is null or absent_employee_id <> covering_employee_id)
);
create index coverage_requests_date_idx on coverage_requests(work_date);
alter table overtime_entries add constraint overtime_coverage_fk foreign key (coverage_request_id) references coverage_requests(id);

-- Annual leave balance per employee and year. Carry-over is capped at 10 days.
create table leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  year int not null check (year between 2000 and 2100),
  entitlement int not null check (entitlement in (30, 33)),
  carried_over numeric(5,1) not null default 0 check (carried_over between 0 and 10),
  adjustment numeric(5,1) not null default 0 check (adjustment between -60 and 60),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  unique (employee_id, year)
);

-- compensation-day leave type (consumes days earned through day compensation)
insert into leave_types(name, code, max_days_per_year, requires_attachment, color)
select 'إجازة تعويض أيام', 'COMP', null, false, '#7c3aed'
where not exists (select 1 from leave_types where code = 'COMP');

-- triggers: touch + audit
do $$
declare t text;
begin
  foreach t in array array['shift_groups','shift_swaps','group_transfers','overtime_entries','coverage_requests','leave_balances'] loop
    execute format('create trigger trg_%s_touch before insert or update on %I for each row execute function app.touch_row()', t, t);
    execute format('create trigger trg_%s_audit after insert or update or delete on %I for each row execute function app.audit()', t, t);
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
insert into permissions(key, name, category) values
  ('rotation.approve', 'اعتماد طلبات التبديل والتغطية والنقل والعمل الإضافي', 'الفريق'),
  ('leave.balances', 'إدارة أرصدة الإجازة السنوية والترحيل', 'التشغيل')
on conflict (key) do nothing;
insert into role_permissions(role_id, permission_id)
select r.id, p.id from roles r join permissions p on (
  (p.key = 'rotation.approve' and r.key in ('system_admin','operations_manager','site_supervisor'))
  or (p.key = 'leave.balances' and r.key in ('system_admin','operations_manager')))
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Rotation engine
-- ---------------------------------------------------------------------
create or replace function app.rotation_pattern() returns text
language sql stable security definer set search_path = public, app as $$
  select coalesce(nullif((select value->>'pattern' from system_settings where key = 'rotation'), ''), 'DDNNOOOO')
$$;

-- base pattern letter (D / N / O) for a group on a date, before swaps
create or replace function app.group_base(p_group uuid, p_date date) returns text
language sql stable security definer set search_path = public, app as $$
  select substr(pat, (((p_date - g.cycle_start_date) % length(pat)) + length(pat)) % length(pat) + 1, 1)
  from shift_groups g, app.rotation_pattern() pat where g.id = p_group
$$;

-- actual shift letter after approved swaps
create or replace function app.group_shift(p_group uuid, p_date date, p_exclude uuid default null) returns text
language plpgsql stable security definer set search_path = public, app as $$
declare s shift_swaps; in_a boolean; in_b boolean;
begin
  for s in select * from shift_swaps w where w.status = 'approved' and w.archived_at is null and w.id is distinct from p_exclude
             and p_group in (w.group_a_id, w.group_b_id)
             and (p_date between w.a_start and w.a_end or p_date between w.b_start and w.b_end)
           order by w.decided_at loop
    in_a := p_date between s.a_start and s.a_end;
    in_b := coalesce(p_date between s.b_start and s.b_end, false);
    if p_group = s.group_a_id then
      if in_b then return app.group_base(s.group_b_id, p_date); end if;
      if in_a then return 'O'; end if;
    else
      if in_a then return app.group_base(s.group_a_id, p_date); end if;
      if in_b then return 'O'; end if;
    end if;
  end loop;
  return app.group_base(p_group, p_date);
end $$;

-- employee's group on a date (temporary transfer > permanent not yet applied > history > current)
create or replace function app.employee_group(p_emp uuid, p_date date) returns uuid
language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select t.to_group_id from group_transfers t where t.employee_id = p_emp and t.status = 'approved' and t.archived_at is null
       and t.kind = 'temporary' and p_date between t.start_date and t.end_date order by t.start_date desc, t.decided_at desc limit 1),
    (select t.to_group_id from group_transfers t where t.employee_id = p_emp and t.status = 'approved' and t.archived_at is null
       and t.kind = 'permanent' and t.applied_at is null and t.start_date <= p_date order by t.start_date desc limit 1),
    (select t.from_group_id from group_transfers t where t.employee_id = p_emp and t.status = 'approved' and t.archived_at is null
       and t.kind = 'permanent' and t.applied_at is not null and t.start_date > p_date order by t.start_date asc limit 1),
    (select group_id from employees where id = p_emp))
$$;

-- Group calendar for a period (max 62 days)
create or replace function app.rotation_calendar(p_from date default current_date, p_to date default null)
returns table (day date, group_id uuid, group_code text, group_name text, color text, base text, actual text, swapped boolean)
language sql stable security definer set search_path = public, app as $$
  select d::date, g.id, g.code, g.name, g.color, app.group_base(g.id, d::date), app.group_shift(g.id, d::date),
         app.group_base(g.id, d::date) <> app.group_shift(g.id, d::date)
  from generate_series(p_from, least(coalesce(p_to, p_from + 27), p_from + 61), interval '1 day') d
  cross join shift_groups g
  where g.archived_at is null and app.uid() is not null
  order by 1, g.code
$$;

-- On-duty roster for a date: members of the working groups + approved cover
create or replace function app.duty_roster(p_date date default current_date)
returns table (shift_kind text, group_code text, employee_id uuid, full_name text, employee_number text, site_name text,
               state text, note text)
language sql stable security definer set search_path = public, app as $$
  with g as (select id, code, app.group_shift(id, p_date) k from shift_groups where archived_at is null),
  m as (
    select g.k, g.code, e.id, e.full_name, e.employee_number, s.name site_name,
           case when app.absent_on(e.id, p_date) then 'absent'
                when app.employee_group(e.id, p_date) is distinct from e.group_id then 'transferred' else 'on_duty' end state,
           (select lt.name from leave_requests l join leave_types lt on lt.id = l.leave_type_id where l.employee_id = e.id
              and l.archived_at is null and l.status in ('approved','recommended') and p_date between l.start_date and l.end_date limit 1) note
    from g join employees e on app.employee_group(e.id, p_date) = g.id
    left join sites s on s.id = e.primary_site_id
    where g.k in ('D','N') and e.archived_at is null and e.status in ('active','on_leave')
      and (app.is_global() or e.id = app.my_employee_id() or app.can_see_site(e.primary_site_id))
  ),
  c as (
    select r.shift_kind, coalesce(g.code, '—'), e.id, e.full_name, e.employee_number, s.name,
           'covering', case r.method when 'overtime' then 'عمل إضافي' else 'تعويض أيام' end
             || coalesce(' بدل ' || a.full_name, '')
    from coverage_requests r join employees e on e.id = r.covering_employee_id
    left join shift_groups g on g.id = r.group_id left join employees a on a.id = r.absent_employee_id
    left join sites s on s.id = e.primary_site_id
    where r.work_date = p_date and r.status = 'approved' and r.archived_at is null
      and (app.is_global() or e.id = app.my_employee_id() or app.can_see_site(e.primary_site_id))
  )
  select * from m union all select * from c
  order by 1, 2, 7 desc, 4
$$;

-- An employee's own schedule (or one the caller may see)
create or replace function app.employee_schedule(p_emp uuid, p_from date default current_date, p_to date default null)
returns table (day date, group_code text, shift_kind text, swapped boolean, on_leave text, covering text, overtime_hours numeric)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.can_see_employee(p_emp) then raise exception 'ليست لديك صلاحية' using errcode = '42501'; end if;
  return query
  select d::date, g.code,
         case when g.id is null then null else app.group_shift(g.id, d::date) end,
         case when g.id is null then false else app.group_base(g.id, d::date) <> app.group_shift(g.id, d::date) end,
         (select lt.name from leave_requests l join leave_types lt on lt.id = l.leave_type_id where l.employee_id = p_emp
            and l.archived_at is null and l.status in ('approved','recommended') and d::date between l.start_date and l.end_date limit 1),
         (select case r.shift_kind when 'D' then 'تغطية نهاري' else 'تغطية ليلي' end from coverage_requests r
            where r.covering_employee_id = p_emp and r.work_date = d::date and r.status = 'approved' and r.archived_at is null limit 1),
         (select sum(o.hours) from overtime_entries o where o.employee_id = p_emp and o.work_date = d::date
            and o.status = 'approved' and o.archived_at is null)
  from generate_series(p_from, least(coalesce(p_to, p_from + 30), p_from + 92), interval '1 day') d
  left join shift_groups g on g.id = app.employee_group(p_emp, d::date)
  order by 1;
end $$;

-- ---------------------------------------------------------------------
-- Request validation (before insert)
-- ---------------------------------------------------------------------
create or replace function app.swap_before() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare d date; ka text; kb text; in_b boolean; in_a boolean;
begin
  if tg_op = 'UPDATE' and (new.group_a_id, new.group_b_id, new.a_start, new.a_end, new.b_start, new.b_end)
       is not distinct from (old.group_a_id, old.group_b_id, old.a_start, old.a_end, old.b_start, old.b_end) then
    return new;
  end if;
  for d in select generate_series(new.a_start, new.a_end, interval '1 day')::date loop
    ka := app.group_shift(new.group_a_id, d, new.id); kb := app.group_shift(new.group_b_id, d, new.id);
    in_b := new.b_start is not null and d between new.b_start and new.b_end;
    if ka = 'O' then raise exception 'المجموعة الأولى ليست في دوام يوم %', to_char(d, 'YYYY-MM-DD'); end if;
    if kb <> 'O' and not in_b then raise exception 'المجموعة الثانية في دوام يوم %، اختر يومًا تكون فيه في راحة أو أضفه لأيام الرد', to_char(d, 'YYYY-MM-DD'); end if;
  end loop;
  if new.b_start is not null then
    for d in select generate_series(new.b_start, new.b_end, interval '1 day')::date loop
      ka := app.group_shift(new.group_a_id, d, new.id); kb := app.group_shift(new.group_b_id, d, new.id);
      in_a := d between new.a_start and new.a_end;
      if kb = 'O' then raise exception 'المجموعة الثانية ليست في دوام يوم %', to_char(d, 'YYYY-MM-DD'); end if;
      if ka <> 'O' and not in_a then raise exception 'المجموعة الأولى في دوام يوم %، اختر يومًا تكون فيه في راحة', to_char(d, 'YYYY-MM-DD'); end if;
    end loop;
  end if;
  return new;
end $$;
create trigger trg_shift_swaps_before before insert or update on shift_swaps for each row execute function app.swap_before();

create or replace function app.transfer_before() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    new.from_group_id := coalesce(new.from_group_id, app.employee_group(new.employee_id, new.start_date));
    if new.from_group_id = new.to_group_id then raise exception 'الموظف في هذه المجموعة بالفعل في ذلك التاريخ'; end if;
  end if;
  return new;
end $$;
create trigger trg_group_transfers_before before insert on group_transfers for each row execute function app.transfer_before();

create or replace function app.coverage_before() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    if new.method = 'day_compensation' then new.comp_days := coalesce(new.comp_days, 1); else new.comp_days := null; new.comp_date := null; end if;
    if new.group_id is null then
      new.group_id := (select id from shift_groups where archived_at is null and app.group_shift(id, new.work_date) = new.shift_kind limit 1);
    end if;
    if new.site_id is null and new.absent_employee_id is not null then new.site_id := app.employee_site(new.absent_employee_id); end if;
  end if;
  return new;
end $$;
create trigger trg_coverage_requests_before before insert on coverage_requests for each row execute function app.coverage_before();

-- notify approvers when a request is created
create or replace function app.rotation_request_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare u uuid; emp uuid; title text; link text;
begin
  if new.status <> 'pending' then return new; end if;
  case tg_table_name
    when 'shift_swaps' then emp := null; title := 'طلب تبديل ورديات بين مجموعتين بانتظار الاعتماد'; link := '/rotation?tab=swaps';
    when 'group_transfers' then emp := new.employee_id; title := 'طلب نقل موظف بين المجموعات بانتظار الاعتماد'; link := '/rotation?tab=transfers';
    when 'coverage_requests' then emp := new.covering_employee_id; title := 'طلب تغطية بانتظار الاعتماد'; link := '/rotation?tab=coverage';
    when 'overtime_entries' then emp := new.employee_id; title := 'عمل إضافي بانتظار الاعتماد'; link := '/rotation?tab=overtime';
  end case;
  for u in select x from app.site_manager_users(case when emp is null then null else app.employee_site(emp) end) x loop
    perform app.notify(u, 'rotation_request', title, coalesce((select full_name from employees where id = emp), ''), link);
  end loop;
  return new;
end $$;
create trigger trg_swaps_after after insert on shift_swaps for each row execute function app.rotation_request_after();
create trigger trg_transfers_after after insert on group_transfers for each row execute function app.rotation_request_after();
create trigger trg_coverage_after after insert on coverage_requests for each row execute function app.rotation_request_after();
create trigger trg_overtime_after after insert on overtime_entries for each row execute function app.rotation_request_after();

-- apply permanent transfers whose start date has arrived
create or replace function app.apply_group_transfers() returns int
language plpgsql security definer set search_path = public, app as $$
declare t group_transfers; n int := 0;
begin
  perform set_config('app.rotation_rpc', 'on', true);
  for t in select * from group_transfers where status = 'approved' and archived_at is null and kind = 'permanent'
             and applied_at is null and start_date <= current_date order by start_date, decided_at loop
    update employees set group_id = t.to_group_id where id = t.employee_id;
    update group_transfers set applied_at = now() where id = t.id;
    n := n + 1;
  end loop;
  perform set_config('app.rotation_rpc', 'off', true);
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Decisions (approve / reject / cancel) for all rotation requests
-- ---------------------------------------------------------------------
create or replace function app.rotation_decide(p_kind text, p_id uuid, p_decision rotation_status, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  rec jsonb; emp uuid; emp2 uuid; st rotation_status; creator uuid; can_app boolean; can_see boolean;
  s shift_swaps; t group_transfers; c coverage_requests; ot uuid; label text; link text;
begin
  case p_kind
    when 'swap' then
      select * into s from shift_swaps where id = p_id for update;
      if s.id is null then raise exception 'الطلب غير موجود'; end if;
      st := s.status; creator := s.created_by; can_see := app.uid() is not null;
      can_app := app.has_perm('rotation.approve');
      label := 'طلب تبديل الورديات'; link := '/rotation?tab=swaps';
    when 'transfer' then
      select * into t from group_transfers where id = p_id for update;
      if t.id is null then raise exception 'الطلب غير موجود'; end if;
      st := t.status; creator := t.created_by; emp := t.employee_id; can_see := app.can_see_employee(emp);
      can_app := app.has_perm('rotation.approve') and app.can_manage_employee(emp);
      label := 'طلب النقل بين المجموعات'; link := '/rotation?tab=transfers';
    when 'coverage' then
      select * into c from coverage_requests where id = p_id for update;
      if c.id is null then raise exception 'الطلب غير موجود'; end if;
      st := c.status; creator := c.created_by; emp := c.covering_employee_id; emp2 := c.absent_employee_id;
      can_see := app.can_see_employee(emp) or creator = app.uid();
      can_app := app.has_perm('rotation.approve') and app.can_manage_employee(emp);
      label := 'طلب التغطية'; link := '/rotation?tab=coverage';
    when 'overtime' then
      select employee_id, status, created_by into emp, st, creator from overtime_entries where id = p_id for update;
      if emp is null then raise exception 'السجل غير موجود'; end if;
      can_see := app.can_see_employee(emp);
      can_app := app.has_perm('rotation.approve') and app.can_manage_employee(emp);
      label := 'العمل الإضافي'; link := '/rotation?tab=overtime';
    else raise exception 'نوع غير معروف';
  end case;
  if not can_see then raise exception 'ليست لديك صلاحية على هذا الطلب' using errcode = '42501'; end if;

  if p_decision in ('approved','rejected') then
    if st <> 'pending' then raise exception 'الطلب ليس بانتظار القرار'; end if;
    if not can_app then raise exception 'ليست لديك صلاحية الاعتماد' using errcode = '42501'; end if;
    if emp is not null and emp = app.my_employee_id() then raise exception 'لا يمكنك اعتماد طلب يخصك' using errcode = '42501'; end if;
    if p_decision = 'rejected' and coalesce(trim(p_note), '') = '' then raise exception 'يجب توضيح سبب الرفض'; end if;
  elsif p_decision = 'cancelled' then
    if st in ('rejected','cancelled') then raise exception 'الطلب مغلق بالفعل'; end if;
    if st = 'approved' and not can_app then raise exception 'إلغاء طلب معتمد يحتاج صلاحية الاعتماد' using errcode = '42501'; end if;
    if st = 'pending' and not (can_app or creator = app.uid() or (emp is not null and emp = app.my_employee_id())) then
      raise exception 'ليست لديك صلاحية الإلغاء' using errcode = '42501';
    end if;
    if p_kind = 'transfer' and t.applied_at is not null then
      raise exception 'تم تطبيق هذا النقل الدائم؛ أنشئ نقلًا جديدًا للعودة';
    end if;
  else
    raise exception 'قرار غير مسموح';
  end if;

  perform set_config('app.rotation_rpc', 'on', true);
  perform set_config('app.reason', coalesce(p_note, ''), true);

  if p_kind = 'swap' then
    if p_decision = 'approved' and exists (
         select 1 from shift_swaps w where w.status = 'approved' and w.archived_at is null and w.id <> s.id
           and (w.group_a_id in (s.group_a_id, s.group_b_id) or w.group_b_id in (s.group_a_id, s.group_b_id))
           and exists (select 1 from generate_series(least(s.a_start, coalesce(s.b_start, s.a_start)), greatest(s.a_end, coalesce(s.b_end, s.a_end)), interval '1 day') g
                       where (g::date between s.a_start and s.a_end or g::date between s.b_start and s.b_end)
                         and (g::date between w.a_start and w.a_end or g::date between w.b_start and w.b_end))) then
      raise exception 'يوجد تبديل معتمد آخر لإحدى المجموعتين في نفس الأيام';
    end if;
    update shift_swaps set status = p_decision, decision_note = p_note, decided_by = app.uid(), decided_at = now() where id = p_id returning to_jsonb(shift_swaps.*) into rec;
  elsif p_kind = 'transfer' then
    if p_decision = 'approved' and t.kind = 'temporary' and exists (
         select 1 from group_transfers x where x.employee_id = t.employee_id and x.id <> t.id and x.status = 'approved' and x.archived_at is null
           and x.kind = 'temporary' and daterange(x.start_date, x.end_date, '[]') && daterange(t.start_date, t.end_date, '[]')) then
      raise exception 'يوجد نقل مؤقت معتمد آخر لنفس الموظف في هذه الفترة';
    end if;
    update group_transfers set status = p_decision, decision_note = p_note, decided_by = app.uid(), decided_at = now() where id = p_id returning to_jsonb(group_transfers.*) into rec;
    if p_decision = 'approved' then perform app.apply_group_transfers(); perform set_config('app.rotation_rpc', 'on', true); end if;
  elsif p_kind = 'coverage' then
    if p_decision = 'approved' and c.method = 'overtime' then
      insert into overtime_entries(employee_id, work_date, hours, cause, site_id, description, coverage_request_id, status, decided_by, decided_at, decision_note)
      values (c.covering_employee_id, c.work_date, c.hours, 'coverage', coalesce(c.site_id, app.employee_site(c.covering_employee_id)),
              'تغطية ' || case c.shift_kind when 'D' then 'وردية نهارية' else 'وردية ليلية' end
                || coalesce(' بدل ' || (select full_name from employees where id = c.absent_employee_id), '') || ' - ' || c.reason,
              c.id, 'approved', app.uid(), now(), p_note)
      returning id into ot;
    end if;
    if p_decision = 'cancelled' and c.overtime_id is not null then
      update overtime_entries set status = 'cancelled', decision_note = coalesce(p_note, 'إلغاء طلب التغطية') where id = c.overtime_id;
    end if;
    update coverage_requests set status = p_decision, decision_note = p_note, decided_by = app.uid(), decided_at = now(),
           overtime_id = coalesce(ot, overtime_id) where id = p_id returning to_jsonb(coverage_requests.*) into rec;
  else
    update overtime_entries set status = p_decision, decision_note = p_note, decided_by = app.uid(), decided_at = now() where id = p_id returning to_jsonb(overtime_entries.*) into rec;
  end if;

  perform set_config('app.rotation_rpc', 'off', true);
  perform set_config('app.reason', '', true);

  -- notify requester and the employees concerned
  perform app.notify(creator, 'rotation_status', 'تم تحديث ' || label, case p_decision when 'approved' then 'معتمد' when 'rejected' then 'مرفوض' else 'ملغي' end, link);
  if emp is not null and app.employee_user(emp) is distinct from creator then
    perform app.notify(app.employee_user(emp), 'rotation_status', 'تم تحديث ' || label, case p_decision when 'approved' then 'معتمد' when 'rejected' then 'مرفوض' else 'ملغي' end, link);
  end if;
  if emp2 is not null then
    perform app.notify(app.employee_user(emp2), 'rotation_status', 'تم تحديث ' || label, case p_decision when 'approved' then 'معتمد' when 'rejected' then 'مرفوض' else 'ملغي' end, link);
  end if;
  return rec;
end $$;

-- ---------------------------------------------------------------------
-- Annual leave balances
-- ---------------------------------------------------------------------
-- internal (no visibility filter): used by the report and the reminder job
create or replace function app.leave_balances_all(p_year int)
returns table (employee_id uuid, employee_number text, full_name text, site_id uuid, site_name text, group_code text,
               entitlement int, carried_over numeric, adjustment numeric, used numeric, pending numeric, remaining numeric,
               above_cap numeric, comp_earned numeric, comp_used numeric, has_record boolean)
language sql stable security definer set search_path = public, app as $$
  with y as (select make_date(p_year, 1, 1) f, make_date(p_year, 12, 31) t),
  lv as (
    select l.employee_id, lt.code, l.status,
           (least(l.end_date, y.t) - greatest(l.start_date, y.f) + 1)::numeric days
    from leave_requests l join leave_types lt on lt.id = l.leave_type_id, y
    where l.archived_at is null and l.start_date <= y.t and l.end_date >= y.f and lt.code in ('ANNUAL','COMP')
  ),
  base as (
    select e.id, e.employee_number, e.full_name, e.primary_site_id, s.name site_name, g.code group_code,
           coalesce(b.entitlement, e.annual_leave_days) ent, coalesce(b.carried_over, 0) co, coalesce(b.adjustment, 0) adj,
           coalesce((select sum(days) from lv where lv.employee_id = e.id and lv.code = 'ANNUAL' and lv.status = 'approved'), 0) used,
           coalesce((select sum(days) from lv where lv.employee_id = e.id and lv.code = 'ANNUAL' and lv.status in ('submitted','pending_review','recommended')), 0) pend,
           coalesce((select sum(r.comp_days) from coverage_requests r, y where r.covering_employee_id = e.id and r.method = 'day_compensation'
                       and r.status = 'approved' and r.archived_at is null and r.work_date between y.f and y.t), 0) comp_e,
           coalesce((select sum(days) from lv where lv.employee_id = e.id and lv.code = 'COMP' and lv.status = 'approved'), 0) comp_u,
           b.id is not null has_rec
    from employees e
    left join leave_balances b on b.employee_id = e.id and b.year = p_year and b.archived_at is null
    left join sites s on s.id = e.primary_site_id
    left join shift_groups g on g.id = e.group_id
    where e.archived_at is null and e.status in ('active','on_leave')
  )
  select id, employee_number, full_name, primary_site_id, site_name, group_code, ent, co, adj, used, pend,
         ent + co + adj - used, greatest(ent + co + adj - used - 10, 0), comp_e, comp_u, has_rec
  from base
$$;
revoke execute on function app.leave_balances_all(int) from public;

create or replace function app.leave_balance_report(p_year int default null, p_site uuid default null)
returns table (employee_id uuid, employee_number text, full_name text, site_id uuid, site_name text, group_code text,
               entitlement int, carried_over numeric, adjustment numeric, used numeric, pending numeric, remaining numeric,
               above_cap numeric, comp_earned numeric, comp_used numeric, has_record boolean)
language sql stable security definer set search_path = public, app as $$
  select * from app.leave_balances_all(coalesce(p_year, extract(year from current_date)::int)) b
  where app.can_see_employee(b.employee_id) and (p_site is null or b.site_id = p_site)
  order by b.remaining desc, b.full_name
$$;

-- Close a year: carry min(remaining, 10) into next year's balance
create or replace function app.close_leave_year(p_year int)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare n int := 0; lost numeric := 0; r record;
begin
  if not (app.has_perm('leave.balances') and app.is_manager_global()) then
    raise exception 'ليست لديك صلاحية ترحيل الأرصدة' using errcode = '42501';
  end if;
  perform set_config('app.rotation_rpc', 'on', true);
  perform set_config('app.reason', 'ترحيل أرصدة الإجازة من سنة ' || p_year, true);
  for r in select * from app.leave_balances_all(p_year) loop
    insert into leave_balances(employee_id, year, entitlement, carried_over)
    values (r.employee_id, p_year + 1, (select annual_leave_days from employees where id = r.employee_id), least(greatest(r.remaining, 0), 10))
    on conflict (employee_id, year) do update set carried_over = excluded.carried_over;
    lost := lost + r.above_cap; n := n + 1;
  end loop;
  perform set_config('app.rotation_rpc', 'off', true);
  perform set_config('app.reason', '', true);
  return jsonb_build_object('employees', n, 'days_over_cap', lost, 'year', p_year + 1);
end $$;

-- Reminder job: from October, warn about balances above the 10-day carry-over cap (monthly).
-- Only balances an administrator has entered/confirmed for the year are used, so missing
-- leave history never produces false alerts.
create or replace function app.leave_balance_alerts() returns int
language plpgsql security definer set search_path = public, app as $$
declare n int := 0; r record; u uuid; yr int := extract(year from current_date)::int; mon text := to_char(current_date, 'YYYY-MM');
begin
  if extract(month from current_date) < 10 then return 0; end if;
  for r in select * from app.leave_balances_all(yr) where above_cap > 0 and has_record loop
    perform app.notify(app.employee_user(r.employee_id), 'leave_balance', 'رصيد إجازتك أعلى من حد الترحيل',
      'رصيدك المتبقي ' || r.remaining || ' يوم، والحد الأقصى للترحيل 10 أيام. خطط لإجازتك قبل نهاية السنة.',
      '/leaves', 'leave_bal:' || r.employee_id || ':' || mon);
    n := n + 1;
  end loop;
  for r in select b.site_id, count(*) cnt from app.leave_balances_all(yr) b where b.above_cap > 0 and b.has_record group by b.site_id loop
    for u in select app.site_manager_users(r.site_id) loop
      perform app.notify(u, 'leave_balance', 'موظفون رصيدهم أعلى من 10 أيام',
        r.cnt || ' موظف لديهم رصيد إجازة يتجاوز حد الترحيل قبل نهاية السنة',
        '/leaves?tab=balances', 'leave_bal_site:' || coalesce(r.site_id::text, '-') || ':' || u || ':' || mon);
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function app.leave_balance_alerts() from public;
revoke execute on function app.apply_group_transfers() from public;

-- ---------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------
create policy sel on shift_groups for select to app_user using (app.uid() is not null);
create policy ins on shift_groups for insert to app_user with check (app.has_perm('settings.manage') or (app.has_perm('shifts.manage') and app.is_manager_global()));
create policy upd on shift_groups for update to app_user using (app.has_perm('settings.manage') or (app.has_perm('shifts.manage') and app.is_manager_global()));

create policy sel on shift_swaps for select to app_user using (app.uid() is not null);
create policy ins on shift_swaps for insert to app_user with check (app.is_writer() and status = 'pending');
create policy upd on shift_swaps for update to app_user using (current_setting('app.rotation_rpc', true) = 'on');

create policy sel on group_transfers for select to app_user using (app.can_see_employee(employee_id) or created_by = app.uid());
create policy ins on group_transfers for insert to app_user with check (status = 'pending' and app.has_perm('shifts.manage') and app.can_manage_employee(employee_id));
create policy upd on group_transfers for update to app_user using (current_setting('app.rotation_rpc', true) = 'on');

create policy sel on coverage_requests for select to app_user using (
  app.can_see_employee(covering_employee_id) or (absent_employee_id is not null and app.can_see_employee(absent_employee_id)) or created_by = app.uid());
create policy ins on coverage_requests for insert to app_user with check (
  status = 'pending' and app.is_writer() and (covering_employee_id = app.my_employee_id() or app.can_manage_employee(covering_employee_id)));
create policy upd on coverage_requests for update to app_user using (current_setting('app.rotation_rpc', true) = 'on');

create policy sel on overtime_entries for select to app_user using (app.can_see_employee(employee_id));
create policy ins on overtime_entries for insert to app_user with check (
  (status = 'pending' and app.is_writer() and (employee_id = app.my_employee_id() or app.can_manage_employee(employee_id)))
  or current_setting('app.rotation_rpc', true) = 'on');
create policy upd on overtime_entries for update to app_user using (current_setting('app.rotation_rpc', true) = 'on');

create policy sel on leave_balances for select to app_user using (app.can_see_employee(employee_id));
create policy ins on leave_balances for insert to app_user with check (
  (app.has_perm('leave.balances') and app.can_manage_employee(employee_id)) or current_setting('app.rotation_rpc', true) = 'on');
create policy upd on leave_balances for update to app_user using (
  (app.has_perm('leave.balances') and app.can_manage_employee(employee_id)) or current_setting('app.rotation_rpc', true) = 'on');

-- applying approved permanent transfers updates the employee's group
create policy upd_rotation on employees for update to app_user using (current_setting('app.rotation_rpc', true) = 'on');

grant select, insert, update on shift_groups, shift_swaps, group_transfers, overtime_entries, coverage_requests, leave_balances to app_user;

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------
drop view v_employees;
create view v_employees with (security_invoker = true) as
  select e.*, s.name as site_name, s.type as site_type, l.name as line_name, f.name as shift_name, d.name as department_name,
         m.full_name as manager_name,
         (select u.id from users u where u.employee_id = e.id and u.archived_at is null limit 1) as user_id,
         g.code as group_code, g.name as group_name, g.color as group_color
  from employees e
  left join sites s on s.id = e.primary_site_id
  left join lines l on l.id = e.line_id
  left join shifts f on f.id = e.shift_id
  left join departments d on d.id = e.department_id
  left join employee_directory m on m.id = e.manager_id
  left join shift_groups g on g.id = e.group_id;

create or replace view employee_directory as
  select e.id, e.employee_number, e.full_name, e.job_title, e.primary_site_id, e.line_id, e.shift_id, e.status, e.is_demo, e.group_id
  from employees e
  where e.archived_at is null and (app.is_global() or e.id = app.my_employee_id() or app.can_see_site(e.primary_site_id));

create view v_shift_groups with (security_invoker = true) as
  select g.*,
    (select count(*) from employees e where e.group_id = g.id and e.archived_at is null and e.status in ('active','on_leave'))::int as members_count,
    app.group_shift(g.id, current_date) as today
  from shift_groups g;

create view v_shift_swaps with (security_invoker = true) as
  select w.*, ga.code as group_a_code, gb.code as group_b_code, ud.full_name as decided_by_name, uc.full_name as created_by_name,
         (w.a_end - w.a_start + 1) as a_days, (w.b_end - w.b_start + 1) as b_days
  from shift_swaps w join shift_groups ga on ga.id = w.group_a_id join shift_groups gb on gb.id = w.group_b_id
  left join user_directory ud on ud.id = w.decided_by left join user_directory uc on uc.id = w.created_by;

create view v_group_transfers with (security_invoker = true) as
  select t.*, ed.full_name as employee_name, ed.employee_number, ed.primary_site_id as site_id,
         gf.code as from_group_code, gt.code as to_group_code, ud.full_name as decided_by_name, uc.full_name as created_by_name
  from group_transfers t
  left join employee_directory ed on ed.id = t.employee_id
  left join shift_groups gf on gf.id = t.from_group_id join shift_groups gt on gt.id = t.to_group_id
  left join user_directory ud on ud.id = t.decided_by left join user_directory uc on uc.id = t.created_by;

create view v_coverage_requests with (security_invoker = true) as
  select r.*, ce.full_name as covering_name, ce.employee_number as covering_number, ae.full_name as absent_name,
         g.code as group_code, s.name as site_name, ud.full_name as decided_by_name, uc.full_name as created_by_name
  from coverage_requests r
  left join employee_directory ce on ce.id = r.covering_employee_id
  left join employee_directory ae on ae.id = r.absent_employee_id
  left join shift_groups g on g.id = r.group_id left join sites s on s.id = r.site_id
  left join user_directory ud on ud.id = r.decided_by left join user_directory uc on uc.id = r.created_by;

create view v_overtime_entries with (security_invoker = true) as
  select o.*, ed.full_name as employee_name, ed.employee_number, s.name as site_name,
         ud.full_name as decided_by_name, uc.full_name as created_by_name
  from overtime_entries o
  left join employee_directory ed on ed.id = o.employee_id
  left join sites s on s.id = o.site_id
  left join user_directory ud on ud.id = o.decided_by left join user_directory uc on uc.id = o.created_by;

create view v_leave_balances with (security_invoker = true) as
  select b.*, ed.full_name as employee_name, ed.employee_number
  from leave_balances b left join employee_directory ed on ed.id = b.employee_id;

grant select on v_employees, employee_directory, v_shift_groups, v_shift_swaps, v_group_transfers, v_coverage_requests,
  v_overtime_entries, v_leave_balances to app_user;

grant execute on all functions in schema app to app_user;
revoke execute on function app.leave_balances_all(int) from app_user;
revoke execute on function app.leave_balance_alerts() from app_user;
revoke execute on function app.apply_group_transfers() from app_user;

-- demo data only: spread the demo employees over the four groups so the schedule is visible
update employees e set group_id = g.id
from (select id, row_number() over (order by employee_number) rn from employees where is_demo and group_id is null) x,
     (select id, row_number() over (order by code) - 1 idx from shift_groups) g
where e.id = x.id and g.idx = (x.rn - 1) % 4;
