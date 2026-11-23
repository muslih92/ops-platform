-- =====================================================================
-- سير العمل: المهام، الإجازات، التغطية، الورديات، الإشعارات، المؤشرات
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tasks: guard + timeline + notifications
-- ---------------------------------------------------------------------
create or replace function app.task_before() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare is_mgr boolean;
begin
  if tg_op = 'INSERT' then
    if new.owner_employee_id is not null and new.status = 'new' then new.status := 'assigned'; end if;
    if new.supervisor_user_id is null then new.supervisor_user_id := app.uid(); end if;
    return new;
  end if;

  is_mgr := app.uid() is null or (app.has_perm('tasks.manage') and (app.is_manager_global() or app.can_manage_site(old.site_id)));
  if not is_mgr then
    -- Owners / assignees / reviewers may only progress the work, not redefine it.
    if new.title is distinct from old.title or new.description is distinct from old.description or new.type is distinct from old.type
       or new.site_id is distinct from old.site_id or new.line_id is distinct from old.line_id or new.priority is distinct from old.priority
       or new.owner_employee_id is distinct from old.owner_employee_id or new.due_at is distinct from old.due_at
       or new.supervisor_user_id is distinct from old.supervisor_user_id or new.reviewer_user_id is distinct from old.reviewer_user_id
       or new.requires_review is distinct from old.requires_review or new.recurrence is distinct from old.recurrence
       or new.archived_at is distinct from old.archived_at then
      raise exception 'لا يمكنك تعديل بيانات المهمة الأساسية، يمكنك تحديث الحالة والملاحظات وقائمة التحقق فقط' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      raise exception 'إلغاء المهمة من صلاحية المشرف' using errcode = '42501';
    end if;
    if new.reviewed_at is distinct from old.reviewed_at and old.reviewer_user_id is distinct from app.uid() then
      raise exception 'اعتماد المهمة من صلاحية المراجع المحدد' using errcode = '42501';
    end if;
  end if;

  if new.owner_employee_id is distinct from old.owner_employee_id and new.owner_employee_id is not null and new.status = 'new' then
    new.status := 'assigned';
  end if;
  if new.status in ('completed','cancelled') and old.status not in ('completed','cancelled') then
    new.closed_at := now(); new.closed_by := app.uid();
  elsif new.status not in ('completed','cancelled') and old.status in ('completed','cancelled') then
    new.closed_at := null; new.closed_by := null; new.reviewed_at := null;
  end if;
  if new.status <> 'waiting_other_party' and old.status = 'waiting_other_party' and new.blocked_reason = old.blocked_reason then
    null; -- keep the documented reason for history
  end if;
  return new;
end $$;
create trigger trg_tasks_before before insert or update on tasks for each row execute function app.task_before();

create or replace function app.task_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  link text := '/tasks/' || new.id;
  u uuid;
begin
  if tg_op = 'INSERT' then
    insert into task_events(task_id, event_type, to_status, note, actor_id) values (new.id, 'created', new.status, null, app.uid());
    perform app.notify(app.employee_user(new.owner_employee_id), 'task_assigned', 'مهمة جديدة مسندة إليك', new.title, link);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into task_events(task_id, event_type, from_status, to_status, note, actor_id)
    values (new.id, 'status_changed', old.status, new.status,
            case when new.status = 'waiting_other_party' then new.blocked_reason end, app.uid());
    perform app.notify(app.employee_user(new.owner_employee_id), 'task_updated', 'تحديث حالة مهمة', new.title, link);
    perform app.notify(new.supervisor_user_id, 'task_updated', 'تحديث حالة مهمة', new.title, link);
    if new.status = 'completed' and new.requires_review then
      perform app.notify(new.reviewer_user_id, 'task_review', 'مهمة بانتظار مراجعتك', new.title, link);
    end if;
  end if;
  if new.owner_employee_id is distinct from old.owner_employee_id then
    insert into task_events(task_id, event_type, note, actor_id) values (new.id, 'reassigned', null, app.uid());
    perform app.notify(app.employee_user(new.owner_employee_id), 'task_assigned', 'مهمة جديدة مسندة إليك', new.title, link);
  end if;
  if new.reviewed_at is not null and old.reviewed_at is null then
    insert into task_events(task_id, event_type, note, actor_id) values (new.id, 'reviewed', 'تم اعتماد المهمة', app.uid());
  end if;
  if (new.title, new.description, new.priority, new.due_at, new.site_id, new.line_id, new.checklist)
     is distinct from (old.title, old.description, old.priority, old.due_at, old.site_id, old.line_id, old.checklist)
     and new.status is not distinct from old.status then
    insert into task_events(task_id, event_type, note, actor_id) values (new.id, 'edited', null, app.uid());
  end if;
  if new.archived_at is not null and old.archived_at is null then
    insert into task_events(task_id, event_type, note, actor_id) values (new.id, 'archived', null, app.uid());
  end if;
  return new;
end $$;
create trigger trg_tasks_after after insert or update on tasks for each row execute function app.task_after();

create or replace function app.task_assignee_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare t tasks;
begin
  select * into t from tasks where id = coalesce(new.task_id, old.task_id);
  if tg_op = 'INSERT' then
    insert into task_events(task_id, event_type, note, actor_id)
    values (new.task_id, 'assignee_added', (select full_name from employees where id = new.employee_id), app.uid());
    perform app.notify(app.employee_user(new.employee_id), 'task_assigned', 'أضفت مشاركًا في مهمة', t.title, '/tasks/' || t.id);
  else
    insert into task_events(task_id, event_type, note, actor_id)
    values (old.task_id, 'assignee_removed', (select full_name from employees where id = old.employee_id), app.uid());
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_task_assignees_after after insert or delete on task_assignees for each row execute function app.task_assignee_after();

create or replace function app.task_comment_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare t tasks; a uuid;
begin
  select * into t from tasks where id = new.task_id;
  insert into task_events(task_id, event_type, note, actor_id) values (new.task_id, 'comment', left(new.body, 200), app.uid());
  perform app.notify(app.employee_user(t.owner_employee_id), 'task_comment', 'تعليق جديد على مهمة', t.title, '/tasks/' || t.id);
  perform app.notify(t.supervisor_user_id, 'task_comment', 'تعليق جديد على مهمة', t.title, '/tasks/' || t.id);
  for a in select app.employee_user(employee_id) from task_assignees where task_id = t.id loop
    perform app.notify(a, 'task_comment', 'تعليق جديد على مهمة', t.title, '/tasks/' || t.id);
  end loop;
  return new;
end $$;
create trigger trg_task_comments_after after insert on task_comments for each row execute function app.task_comment_after();

create or replace function app.attachment_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare t tasks;
begin
  if new.entity_type = 'task' then
    select * into t from tasks where id = new.entity_id;
    insert into task_events(task_id, event_type, note, actor_id) values (t.id, 'attachment', new.file_name, app.uid());
    perform app.notify(app.employee_user(t.owner_employee_id), 'task_attachment', 'مرفق جديد على مهمة', t.title, '/tasks/' || t.id);
    perform app.notify(t.supervisor_user_id, 'task_attachment', 'مرفق جديد على مهمة', t.title, '/tasks/' || t.id);
  end if;
  return new;
end $$;
create trigger trg_attachments_after after insert on attachments for each row execute function app.attachment_after();

-- Create a task (with assignees) atomically
create or replace function app.create_task(p jsonb, p_assignees uuid[] default '{}')
returns uuid language plpgsql security invoker set search_path = public, app as $$
declare new_id uuid; e uuid;
begin
  insert into tasks(title, description, type, site_id, line_id, equipment, priority, owner_employee_id, supervisor_user_id,
                    reviewer_user_id, due_at, blocked_reason, checklist, requires_review, recurrence, sap_notification_no,
                    handover_item_id, initiative_id, development_plan_id)
  values (p->>'title', p->>'description', coalesce((p->>'type')::task_type, 'operational'), (p->>'site_id')::uuid,
          (p->>'line_id')::uuid, p->>'equipment', coalesce((p->>'priority')::task_priority, 'normal'),
          (p->>'owner_employee_id')::uuid, (p->>'supervisor_user_id')::uuid, (p->>'reviewer_user_id')::uuid,
          (p->>'due_at')::timestamptz, p->>'blocked_reason', coalesce(p->'checklist', '[]'::jsonb),
          coalesce((p->>'requires_review')::boolean, false), coalesce((p->>'recurrence')::recurrence_kind, 'none'),
          p->>'sap_notification_no', (p->>'handover_item_id')::uuid, (p->>'initiative_id')::uuid, (p->>'development_plan_id')::uuid)
  returning id into new_id;
  foreach e in array coalesce(p_assignees, '{}') loop
    if e is distinct from (p->>'owner_employee_id')::uuid then
      insert into task_assignees(task_id, employee_id) values (new_id, e) on conflict do nothing;
    end if;
  end loop;
  return new_id;
end $$;

-- Recurring tasks: copy templates when their period has elapsed (called by the server job)
create or replace function app.spawn_recurring_tasks() returns int
language plpgsql security definer set search_path = public, app as $$
declare t tasks; n int := 0; step interval; new_id uuid;
begin
  for t in select * from tasks where recurrence <> 'none' and recurrence_parent_id is null and archived_at is null
             and status <> 'cancelled' for update skip locked loop
    step := case t.recurrence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
    if now() >= coalesce(t.last_spawned_at, t.created_at) + step then
      insert into tasks(title, description, type, site_id, line_id, equipment, priority, owner_employee_id, supervisor_user_id,
                        reviewer_user_id, due_at, checklist, requires_review, recurrence, recurrence_parent_id, is_demo, created_by)
      values (t.title, t.description, t.type, t.site_id, t.line_id, t.equipment, t.priority, t.owner_employee_id, t.supervisor_user_id,
              t.reviewer_user_id, case when t.due_at is not null then now() + (t.due_at - t.created_at) end,
              (select coalesce(jsonb_agg(c || jsonb_build_object('done', false)), '[]'::jsonb) from jsonb_array_elements(t.checklist) c),
              t.requires_review, 'none', t.id, t.is_demo, t.created_by)
      returning id into new_id;
      insert into task_assignees(task_id, employee_id) select new_id, employee_id from task_assignees where task_id = t.id;
      update tasks set last_spawned_at = now() where id = t.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Handover: notify next shift / supervisors, convert item to task
-- ---------------------------------------------------------------------
create or replace function app.handover_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare u uuid; link text := '/handover/' || new.id;
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform app.notify(app.employee_user(new.incoming_employee_id), 'handover', 'تسليم وردية بانتظار استلامك',
      coalesce(new.next_shift_instructions, new.general_notes, ''), link);
    if exists (select 1 from handover_items where report_id = new.id and status = 'open') then
      for u in select app.site_manager_users(new.site_id) loop
        perform app.notify(u, 'handover_open', 'ملاحظات وردية مفتوحة تحتاج متابعة', (select name from sites where id = new.site_id), link);
      end loop;
    end if;
  end if;
  return new;
end $$;
create trigger trg_handover_after after insert or update on shift_handover_reports for each row execute function app.handover_after();

create or replace function app.handover_confirm(p_report uuid, p_side text) returns void
language plpgsql security invoker set search_path = public, app as $$
declare r shift_handover_reports;
begin
  select * into r from shift_handover_reports where id = p_report;
  if r.id is null then raise exception 'التقرير غير موجود أو لا تملك صلاحية عليه' using errcode = '42501'; end if;
  if p_side = 'outgoing' then
    if r.outgoing_employee_id is distinct from app.my_employee_id() and not app.can_manage_site(r.site_id) then
      raise exception 'التأكيد متاح للموظف المسلّم فقط' using errcode = '42501'; end if;
    update shift_handover_reports set outgoing_confirmed_at = now(), status = case when status = 'draft' then 'submitted' else status end where id = p_report;
  elsif p_side = 'incoming' then
    if r.incoming_employee_id is distinct from app.my_employee_id() and not app.can_manage_site(r.site_id) then
      raise exception 'التأكيد متاح للموظف المستلم فقط' using errcode = '42501'; end if;
    if r.outgoing_confirmed_at is null then raise exception 'يجب أن يؤكد المسلّم أولًا'; end if;
    update shift_handover_reports set incoming_confirmed_at = now(), status = 'acknowledged' where id = p_report;
  else
    raise exception 'قيمة غير صحيحة';
  end if;
end $$;

create or replace function app.handover_item_to_task(p_item uuid, p_title text, p_owner uuid, p_due timestamptz, p_priority task_priority default 'normal')
returns uuid language plpgsql security invoker set search_path = public, app as $$
declare i handover_items; r shift_handover_reports; tid uuid;
begin
  select * into i from handover_items where id = p_item;
  if i.id is null then raise exception 'الملاحظة غير موجودة' using errcode = '42501'; end if;
  if i.linked_task_id is not null then raise exception 'تم تحويل هذه الملاحظة إلى مهمة مسبقًا'; end if;
  select * into r from shift_handover_reports where id = i.report_id;
  tid := app.create_task(jsonb_build_object('title', coalesce(nullif(trim(p_title), ''), left(i.description, 190)),
           'description', i.description || coalesce(E'\nالمرجع: ' || i.reference_no, ''),
           'type', 'observation_followup', 'site_id', r.site_id, 'line_id', r.line_id, 'priority', p_priority,
           'owner_employee_id', p_owner, 'due_at', p_due, 'handover_item_id', i.id), '{}');
  update handover_items set linked_task_id = tid where id = p_item;
  return tid;
end $$;

-- ---------------------------------------------------------------------
-- Coverage & skill availability
-- ---------------------------------------------------------------------
-- employees assigned to (site, shift) on a date: active shift assignment, else the employee's default site/shift
create or replace function app.assigned_employees(p_site uuid, p_shift uuid, p_date date)
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select e.id from employees e
  where e.archived_at is null and e.status in ('active','on_leave')
    and (exists (select 1 from shift_assignments sa where sa.employee_id = e.id and sa.archived_at is null
                  and sa.site_id = p_site and sa.shift_id = p_shift and sa.start_date <= p_date and (sa.end_date is null or sa.end_date >= p_date))
         or (not exists (select 1 from shift_assignments sa where sa.employee_id = e.id and sa.archived_at is null
                  and sa.start_date <= p_date and (sa.end_date is null or sa.end_date >= p_date))
             and e.primary_site_id = p_site and e.shift_id = p_shift))
$$;

create or replace function app.absent_on(p_emp uuid, p_date date, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from leave_requests l where l.employee_id = p_emp and l.archived_at is null
                  and l.status in ('approved','recommended') and p_date between l.start_date and l.end_date
                  and l.id is distinct from p_exclude)
      or exists (select 1 from employees where id = p_emp and status in ('suspended','resigned'))
$$;

-- Coverage grid for the sites the caller can see
create or replace function app.coverage_overview(p_date date default current_date, p_site uuid default null)
returns table (site_id uuid, site_name text, shift_id uuid, shift_name text, start_time time, end_time time,
               assigned int, absent int, available int, min_staff int, status text)
language sql stable security definer set search_path = public, app as $$
  with sh as (
    select s.id site_id, s.name site_name, f.id shift_id, f.name shift_name, f.start_time, f.end_time,
           coalesce(r.min_staff, 0) min_staff
    from sites s
    join shifts f on (f.site_id = s.id or (f.site_id is null and exists (select 1 from site_coverage_rules r2 where r2.site_id = s.id and r2.shift_id = f.id)))
                  and f.archived_at is null and extract(dow from p_date)::int = any(f.work_days)
    left join site_coverage_rules r on r.site_id = s.id and r.shift_id = f.id and r.archived_at is null
    where s.archived_at is null and s.active and app.can_see_site(s.id) and (p_site is null or s.id = p_site)
  ), c as (
    select sh.*, (select count(*) from app.assigned_employees(sh.site_id, sh.shift_id, p_date))::int assigned,
           (select count(*) from app.assigned_employees(sh.site_id, sh.shift_id, p_date) e where app.absent_on(e, p_date))::int absent
    from sh
  )
  select site_id, site_name, shift_id, shift_name, start_time, end_time, assigned, absent, assigned - absent, min_staff,
         case when min_staff = 0 then 'no_rule' when assigned - absent < min_staff then 'below'
              when assigned - absent = min_staff then 'at_min' else 'ok' end
  from c order by site_name, start_time
$$;

-- Skill coverage per site: qualified = level >= 3 (independent or expert)
create or replace function app.skill_coverage(p_site uuid default null, p_date date default current_date)
returns table (site_id uuid, site_name text, skill_id uuid, skill_name text, domain_name text, is_core boolean,
               criticality skill_criticality, qualified int, available int, expert int)
language sql stable security definer set search_path = public, app as $$
  select s.id, s.name, k.id, k.name, d.name, k.is_core, k.criticality,
    (select count(*) from employee_skills es join employees e on e.id = es.employee_id
      where es.skill_id = k.id and es.level >= 3 and es.archived_at is null and es.source = 'assessment'
        and e.primary_site_id = s.id and e.archived_at is null and e.status in ('active','on_leave'))::int,
    (select count(*) from employee_skills es join employees e on e.id = es.employee_id
      where es.skill_id = k.id and es.level >= 3 and es.archived_at is null and es.source = 'assessment'
        and e.primary_site_id = s.id and e.archived_at is null and e.status in ('active','on_leave') and not app.absent_on(e.id, p_date))::int,
    (select count(*) from employee_skills es join employees e on e.id = es.employee_id
      where es.skill_id = k.id and es.level = 4 and es.archived_at is null and es.source = 'assessment'
        and e.primary_site_id = s.id and e.archived_at is null and e.status = 'active')::int
  from sites s
  join skills k on k.archived_at is null and (
       (cardinality(k.applicable_site_ids) = 0 and cardinality(k.applicable_site_types) = 0)
       or s.id = any(k.applicable_site_ids) or s.type = any(k.applicable_site_types))
  join skill_domains d on d.id = k.domain_id
  where s.archived_at is null and s.active and app.can_see_site(s.id) and (p_site is null or s.id = p_site)
    and s.type not in ('system','line')
  order by s.name, d.sort_order, k.name
$$;

-- Impact of a leave on coverage & critical skills (for reviewers)
create or replace function app.leave_impact(p_emp uuid, p_start date, p_end date, p_exclude uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  e employees; d date; site uuid; shift uuid; rule site_coverage_rules;
  worst_available int := null; worst_day date; assigned int; absent int;
  skills_risk jsonb;
begin
  if not (app.can_see_employee(p_emp)) then raise exception 'ليست لديك صلاحية' using errcode = '42501'; end if;
  select * into e from employees where id = p_emp;
  site := coalesce((select sa.site_id from shift_assignments sa where sa.employee_id = p_emp and sa.archived_at is null
                    and sa.start_date <= p_start and (sa.end_date is null or sa.end_date >= p_start) limit 1), e.primary_site_id);
  shift := coalesce((select sa.shift_id from shift_assignments sa where sa.employee_id = p_emp and sa.archived_at is null
                    and sa.start_date <= p_start and (sa.end_date is null or sa.end_date >= p_start) limit 1), e.shift_id);
  select * into rule from site_coverage_rules where site_id = site and shift_id = shift and archived_at is null;
  if p_end - p_start > 60 then p_end := p_start + 60; end if;
  if shift is not null then
    d := p_start;
    while d <= p_end loop
      select count(*) into assigned from app.assigned_employees(site, shift, d);
      select count(*) into absent from app.assigned_employees(site, shift, d) x where x <> p_emp and app.absent_on(x, d, p_exclude);
      if worst_available is null or (assigned - absent - 1) < worst_available then
        worst_available := assigned - absent - 1; worst_day := d;
      end if;
      d := d + 1;
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('skill_id', k.id, 'skill_name', k.name, 'is_core', k.is_core,
           'criticality', k.criticality, 'others_available', o.cnt)), '[]'::jsonb)
  into skills_risk
  from employee_skills es join skills k on k.id = es.skill_id
  cross join lateral (
    select count(*)::int cnt from employee_skills x join employees y on y.id = x.employee_id
    where x.skill_id = k.id and x.level >= 3 and x.source = 'assessment' and x.archived_at is null and y.id <> p_emp
      and y.primary_site_id = site and y.archived_at is null and y.status = 'active'
      and not exists (select 1 from generate_series(p_start, p_end, interval '1 day') g where app.absent_on(y.id, g::date, p_exclude))
  ) o
  where es.employee_id = p_emp and es.level >= 3 and es.source = 'assessment' and es.archived_at is null
    and (k.is_core or k.criticality in ('high','critical')) and o.cnt <= 1;

  return jsonb_build_object(
    'site_id', site, 'site_name', (select name from sites where id = site),
    'shift_id', shift, 'shift_name', (select name from shifts where id = shift),
    'min_staff', coalesce(rule.min_staff, 0),
    'worst_available', worst_available, 'worst_day', worst_day,
    'below_min', rule.id is not null and worst_available is not null and worst_available < rule.min_staff,
    'skills_at_risk', skills_risk,
    'no_backup', exists (select 1 from jsonb_array_elements(skills_risk) s where (s->>'others_available')::int = 0)
  );
end $$;

-- ---------------------------------------------------------------------
-- Leave workflow (human decisions only; nothing is decided automatically)
-- ---------------------------------------------------------------------
create or replace function app.leave_transition(p_id uuid, p_to leave_status, p_note text default null,
                                                p_override boolean default false, p_override_reason text default null)
returns leave_requests language plpgsql security definer set search_path = public, app as $$
declare
  r leave_requests; is_owner boolean; can_rec boolean; can_app boolean; impact jsonb; emp_name text; u uuid;
begin
  select * into r from leave_requests where id = p_id for update;
  if r.id is null or not app.can_see_employee(r.employee_id) then raise exception 'الطلب غير موجود أو لا تملك صلاحية عليه' using errcode = '42501'; end if;
  is_owner := r.employee_id = app.my_employee_id();
  can_rec := app.has_perm('leave.recommend') and app.can_manage_employee(r.employee_id) and not is_owner;
  can_app := app.has_perm('leave.approve') and app.can_manage_employee(r.employee_id) and not is_owner;
  emp_name := (select full_name from employees where id = r.employee_id);

  if p_to = 'submitted' then
    if r.status <> 'draft' or not (is_owner or can_rec) then raise exception 'لا يمكن تقديم هذا الطلب' using errcode = '42501'; end if;
    p_to := 'pending_review';
  elsif p_to = 'cancelled' then
    if r.status in ('approved','rejected','cancelled') and not can_app then raise exception 'لا يمكن إلغاء طلب تم البت فيه' using errcode = '42501'; end if;
    if not (is_owner or can_app) then raise exception 'ليست لديك صلاحية الإلغاء' using errcode = '42501'; end if;
  elsif p_to = 'recommended' then
    if r.status <> 'pending_review' or not can_rec then raise exception 'ليست لديك صلاحية رفع التوصية' using errcode = '42501'; end if;
  elsif p_to in ('approved','rejected') then
    if r.status not in ('pending_review','recommended') then raise exception 'الطلب ليس بانتظار القرار'; end if;
    if not can_app then raise exception 'ليست لديك صلاحية اعتماد أو رفض الطلب' using errcode = '42501'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'يجب توثيق سبب القرار'; end if;
    if p_to = 'approved' then
      impact := app.leave_impact(r.employee_id, r.start_date, r.end_date, r.id);
      if (impact->>'below_min')::boolean or (impact->>'no_backup')::boolean then
        if not p_override then
          raise exception 'الاعتماد يخفض التغطية عن الحد الأدنى أو يترك مهارة أساسية بلا بديل. يلزم تجاوز موثّق.' using errcode = 'P0001', hint = 'coverage_override_required';
        end if;
        if not app.has_perm('leave.override_coverage') then raise exception 'ليست لديك صلاحية تجاوز تحذير التغطية' using errcode = '42501'; end if;
        if coalesce(trim(p_override_reason), '') = '' then raise exception 'يجب توثيق سبب تجاوز تحذير التغطية'; end if;
      end if;
    end if;
  else
    raise exception 'انتقال غير مسموح';
  end if;

  perform set_config('app.leave_rpc', 'on', true);
  perform set_config('app.reason', coalesce(p_override_reason, p_note, ''), true);
  update leave_requests set
    status = p_to,
    recommendation_note = case when p_to = 'recommended' then p_note else recommendation_note end,
    recommended_by = case when p_to = 'recommended' then app.uid() else recommended_by end,
    recommended_at = case when p_to = 'recommended' then now() else recommended_at end,
    decision_reason = case when p_to in ('approved','rejected','cancelled') then p_note else decision_reason end,
    decided_by = case when p_to in ('approved','rejected') then app.uid() else decided_by end,
    decided_at = case when p_to in ('approved','rejected') then now() else decided_at end,
    coverage_override = case when p_to = 'approved' and p_override then true else coverage_override end,
    override_reason = case when p_to = 'approved' and p_override then p_override_reason else override_reason end
  where id = p_id returning * into r;
  perform set_config('app.leave_rpc', 'off', true);
  perform set_config('app.reason', '', true);

  insert into leave_request_events(request_id, from_status, to_status, note, actor_id)
  values (r.id, (select to_status from leave_request_events where request_id = r.id order by created_at desc limit 1), p_to,
          coalesce(p_note, '') || case when p_override then E'\nتجاوز تحذير التغطية: ' || p_override_reason else '' end, app.uid());

  if p_override and p_to = 'approved' then
    insert into audit_logs(actor_id, action, table_name, record_id, new_data, reason)
    values (app.uid(), 'coverage_override', 'leave_requests', r.id::text, impact, p_override_reason);
  end if;

  -- notifications
  perform app.notify(app.employee_user(r.employee_id), 'leave_status', 'تغيّرت حالة طلب الإجازة', emp_name, '/leaves?id=' || r.id);
  if p_to in ('pending_review','recommended') then
    for u in select app.site_manager_users(app.employee_site(r.employee_id)) loop
      perform app.notify(u, 'leave_review', case when p_to = 'recommended' then 'طلب إجازة موصى به بانتظار القرار' else 'طلب إجازة بانتظار المراجعة' end,
                         emp_name, '/leaves?id=' || r.id);
    end loop;
    impact := app.leave_impact(r.employee_id, r.start_date, r.end_date, r.id);
    if (impact->>'below_min')::boolean or (impact->>'no_backup')::boolean then
      for u in select app.site_manager_users(app.employee_site(r.employee_id)) loop
        perform app.notify(u, 'coverage_low', 'تحذير: طلب إجازة يؤثر على التغطية', emp_name || ' - ' || coalesce(impact->>'site_name', ''),
                           '/leaves?id=' || r.id, 'leave_cov:' || r.id || ':' || p_to);
      end loop;
    end if;
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Employee self-service (limited fields)
-- ---------------------------------------------------------------------
create or replace function app.update_my_profile(p jsonb) returns void
language plpgsql security definer set search_path = public, app as $$
declare me uuid := app.my_employee_id();
begin
  if me is null then raise exception 'حسابك غير مرتبط بملف موظف' using errcode = '42501'; end if;
  update employees set
    strengths = coalesce(p->>'strengths', strengths),
    interests = coalesce(p->>'interests', interests),
    desired_skills = coalesce(p->>'desired_skills', desired_skills),
    specialization_wishes = coalesce(p->>'specialization_wishes', specialization_wishes),
    capabilities = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'capabilities') x), capabilities)
  where id = me;
end $$;

create or replace function app.plan_employee_comment(p_plan uuid, p_comment text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update development_plans set employee_comment = p_comment
  where id = p_plan and employee_id = app.my_employee_id();
  if not found then raise exception 'الخطة غير موجودة أو ليست لك' using errcode = '42501'; end if;
end $$;

create or replace function app.review_acknowledge(p_review uuid, p_comment text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update performance_reviews set employee_comment = p_comment, status = 'acknowledged', acknowledged_at = now()
  where id = p_review and employee_id = app.my_employee_id() and status = 'submitted';
  if not found then raise exception 'التقييم غير متاح للاعتماد' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Notifications on other events
-- ---------------------------------------------------------------------
create or replace function app.idea_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare u uuid;
begin
  if tg_op = 'INSERT' then
    for u in select app.site_manager_users(new.site_id) loop
      perform app.notify(u, 'idea', 'مقترح أو مبادرة جديدة', new.title, '/initiatives?id=' || new.id);
    end loop;
  elsif new.status is distinct from old.status then
    perform app.notify(app.employee_user(new.submitted_by_employee_id), 'idea', 'تحديث حالة مقترحك', new.title, '/initiatives?id=' || new.id);
    perform app.notify(app.employee_user(new.owner_employee_id), 'idea', 'تحديث حالة مبادرة', new.title, '/initiatives?id=' || new.id);
  end if;
  return new;
end $$;
create trigger trg_ideas_after after insert or update on improvement_ideas for each row execute function app.idea_after();

create or replace function app.enrollment_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    perform app.notify(app.employee_user(new.employee_id), 'course', 'تم ترشيحك لدورة تدريبية',
      (select name from training_courses where id = new.course_id), '/development?tab=courses');
  end if;
  return new;
end $$;
create trigger trg_enrollments_after after insert on training_enrollments for each row execute function app.enrollment_after();

create or replace function app.review_after() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform app.notify(app.employee_user(new.employee_id), 'review', 'تقييم أداء بانتظار اطلاعك', null, '/performance?id=' || new.id);
  end if;
  return new;
end $$;
create trigger trg_reviews_after after insert or update on performance_reviews for each row execute function app.review_after();

-- Periodic reminders (server job, every 15 minutes). Idempotent thanks to dedupe keys.
create or replace function app.generate_reminders() returns int
language plpgsql security definer set search_path = public, app as $$
declare n int := 0; r record; u uuid; today text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD');
begin
  -- tasks due within 24h
  for r in select * from tasks where archived_at is null and status not in ('completed','cancelled')
             and due_at between now() and now() + interval '24 hours' loop
    perform app.notify(app.employee_user(r.owner_employee_id), 'task_due', 'موعد مهمة يقترب', r.title, '/tasks/' || r.id, 'task_due:' || r.id);
    n := n + 1;
  end loop;
  -- overdue tasks (once per day)
  for r in select * from tasks where archived_at is null and status not in ('completed','cancelled','waiting_other_party') and due_at < now() loop
    perform app.notify(app.employee_user(r.owner_employee_id), 'task_overdue', 'مهمة متأخرة', r.title, '/tasks/' || r.id, 'task_overdue:' || r.id || ':' || today);
    perform app.notify(r.supervisor_user_id, 'task_overdue', 'مهمة متأخرة', r.title, '/tasks/' || r.id, 'task_overdue:' || r.id || ':' || today);
  end loop;
  -- courses starting within 3 days
  for r in select e.employee_id, c.id, c.name from training_enrollments e join training_courses c on c.id = e.course_id
             where e.archived_at is null and c.archived_at is null and e.status = 'nominated'
               and c.start_date between current_date and current_date + 3 loop
    perform app.notify(app.employee_user(r.employee_id), 'course_soon', 'دورة تدريبية قادمة', r.name, '/development?tab=courses', 'course_soon:' || r.id || ':' || r.employee_id);
  end loop;
  -- skill re-assessments due within 14 days
  for r in select es.id, es.employee_id, k.name, e.primary_site_id from employee_skills es join skills k on k.id = es.skill_id
             join employees e on e.id = es.employee_id
             where es.archived_at is null and es.next_reassess_at is not null and es.next_reassess_at <= current_date + 14 loop
    perform app.notify(app.employee_user(r.employee_id), 'reassess', 'موعد إعادة تقييم مهارة', r.name, '/employees/' || r.employee_id, 'reassess:' || r.id);
    for u in select app.site_manager_users(r.primary_site_id) loop
      perform app.notify(u, 'reassess', 'مهارة تحتاج إلى إعادة تقييم', r.name, '/employees/' || r.employee_id, 'reassess:' || r.id);
    end loop;
  end loop;
  -- overdue development plans
  update development_plans set status = 'overdue'
   where archived_at is null and status in ('planned','in_progress','awaiting_practical') and end_date < current_date;
  -- coverage below minimum today
  for r in select * from app.coverage_overview(current_date) where status = 'below' loop
    for u in select app.site_manager_users(r.site_id) loop
      perform app.notify(u, 'coverage_low', 'انخفاض التغطية عن الحد الأدنى', r.site_name || ' - ' || r.shift_name,
                         '/shifts', 'cov:' || r.site_id || ':' || r.shift_id || ':' || today);
    end loop;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Dashboard (security invoker → respects the caller's RLS)
-- ---------------------------------------------------------------------
create or replace function app.dashboard(p_site uuid default null, p_shift uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security invoker set search_path = public, app as $$
declare res jsonb; f date := coalesce(p_from, current_date - 30); t date := coalesce(p_to, current_date + 30);
begin
  select jsonb_build_object(
    'active_employees', (select count(*) from employees e where e.archived_at is null and e.status = 'active'
                          and (p_site is null or e.primary_site_id = p_site) and (p_shift is null or e.shift_id = p_shift)),
    'by_site', (select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
                 select jsonb_build_object('id', s.id, 'name', s.name, 'count', count(e.id)) x
                 from sites s left join employees e on e.primary_site_id = s.id and e.archived_at is null and e.status = 'active'
                   and (p_shift is null or e.shift_id = p_shift)
                 where s.archived_at is null and (p_site is null or s.id = p_site)
                 group by s.id, s.name having count(e.id) > 0) q),
    'by_shift', (select coalesce(jsonb_agg(x), '[]') from (
                 select jsonb_build_object('name', coalesce(f.name, 'غير محدد'), 'count', count(*)) x
                 from employees e left join shifts f on f.id = e.shift_id
                 where e.archived_at is null and e.status = 'active' and (p_site is null or e.primary_site_id = p_site)
                   and (p_shift is null or e.shift_id = p_shift)
                 group by f.name) q),
    'tasks', (select jsonb_build_object(
                'new', count(*) filter (where status in ('new','assigned')),
                'in_progress', count(*) filter (where status = 'in_progress'),
                'waiting', count(*) filter (where status = 'waiting_other_party'),
                'overdue', count(*) filter (where status not in ('completed','cancelled','waiting_other_party') and due_at < now()),
                'completed', count(*) filter (where status = 'completed' and closed_at::date between f and t))
              from tasks where archived_at is null and (p_site is null or site_id = p_site)),
    'tasks_by_site', (select coalesce(jsonb_agg(x), '[]') from (
                 select jsonb_build_object('name', coalesce(s.name, 'بدون موقع'),
                   'open', count(*) filter (where k.status not in ('completed','cancelled')),
                   'overdue', count(*) filter (where k.status not in ('completed','cancelled','waiting_other_party') and k.due_at < now()),
                   'completed', count(*) filter (where k.status = 'completed')) x
                 from tasks k left join sites s on s.id = k.site_id
                 where k.archived_at is null and (p_site is null or k.site_id = p_site)
                 group by s.name order by count(*) desc limit 12) q),
    'leaves_pending', (select count(*) from leave_requests l join employees e on e.id = l.employee_id
                        where l.archived_at is null and l.status in ('pending_review','recommended')
                          and (p_site is null or e.primary_site_id = p_site)),
    'leaves_current', (select count(*) from leave_requests l join employees e on e.id = l.employee_id
                        where l.archived_at is null and l.status = 'approved' and current_date between l.start_date and l.end_date
                          and (p_site is null or e.primary_site_id = p_site)),
    'coverage', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from app.coverage_overview(current_date, p_site) c
                  where (p_shift is null or c.shift_id = p_shift)),
    'skill_gaps', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from (
                  select * from app.skill_coverage(p_site) where is_core and available < 2 order by available, site_name limit 30) g),
    'skills_by_level', (select coalesce(jsonb_agg(x), '[]') from (
                  select jsonb_build_object('domain', d.name,
                    'l1', count(*) filter (where es.level = 1), 'l2', count(*) filter (where es.level = 2),
                    'l3', count(*) filter (where es.level = 3), 'l4', count(*) filter (where es.level = 4)) x
                  from employee_skills es join skills k on k.id = es.skill_id join skill_domains d on d.id = k.domain_id
                  join employees e on e.id = es.employee_id
                  where es.archived_at is null and es.source = 'assessment' and e.archived_at is null and (p_site is null or e.primary_site_id = p_site)
                  group by d.name, d.sort_order order by d.sort_order) q),
    'training', (select jsonb_build_object(
                  'upcoming_courses', (select count(*) from training_courses c where c.archived_at is null and c.start_date between current_date and current_date + 30),
                  'plans_active', count(*) filter (where p.status in ('planned','in_progress','awaiting_practical')),
                  'plans_overdue', count(*) filter (where p.status = 'overdue' or (p.status not in ('completed') and p.end_date < current_date)),
                  'plans_completed', count(*) filter (where p.status = 'completed'))
                 from development_plans p join employees e on e.id = p.employee_id
                 where p.archived_at is null and (p_site is null or e.primary_site_id = p_site)),
    'upcoming_courses', (select coalesce(jsonb_agg(x order by x->>'start_date'), '[]') from (
                  select jsonb_build_object('id', c.id, 'name', c.name, 'start_date', c.start_date, 'provider', c.provider) x
                  from training_courses c where c.archived_at is null and c.start_date >= current_date order by c.start_date limit 5) q),
    'handover_open', (select count(*) from handover_items i join shift_handover_reports r on r.id = i.report_id
                      where i.status = 'open' and r.archived_at is null and (p_site is null or r.site_id = p_site)),
    'handover_open_items', (select coalesce(jsonb_agg(x), '[]') from (
                  select jsonb_build_object('id', i.id, 'report_id', r.id, 'description', i.description, 'kind', i.kind,
                     'site', s.name, 'at', r.handover_at) x
                  from handover_items i join shift_handover_reports r on r.id = i.report_id join sites s on s.id = r.site_id
                  where i.status = 'open' and r.archived_at is null and (p_site is null or r.site_id = p_site)
                  order by r.handover_at desc limit 6) q),
    'reassess_due', (select count(*) from employee_skills es join employees e on e.id = es.employee_id
                     where es.archived_at is null and es.next_reassess_at <= current_date + 30 and (p_site is null or e.primary_site_id = p_site)),
    'recent_activity', (select coalesce(jsonb_agg(x), '[]') from (
                  select jsonb_build_object('id', ev.id, 'task_id', ev.task_id, 'title', k.title, 'event_type', ev.event_type,
                    'to_status', ev.to_status, 'note', ev.note, 'actor', ud.full_name, 'at', ev.created_at) x
                  from task_events ev join tasks k on k.id = ev.task_id left join user_directory ud on ud.id = ev.actor_id
                  where (p_site is null or k.site_id = p_site)
                  order by ev.created_at desc limit 10) q)
  ) into res;
  return res;
end $$;

grant execute on all functions in schema app to app_user;
-- functions only meant for the server job (owner); keep them away from app_user
revoke execute on function app.spawn_recurring_tasks() from app_user, public;
revoke execute on function app.generate_reminders() from app_user, public;

-- Supervisor recommendation on an employee (without full edit rights on employee data)
create or replace function app.set_recommendation(p_emp uuid, p_text text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not (app.can_manage_employee(p_emp) and (app.has_perm('skills.assess') or app.has_perm('employees.manage'))) then
    raise exception 'ليست لديك صلاحية تسجيل توصية لهذا الموظف' using errcode = '42501';
  end if;
  update employees set supervisor_recommendation = p_text where id = p_emp;
end $$;
grant execute on function app.set_recommendation(uuid, text) to app_user;
