-- =====================================================================
-- الصلاحيات: دوال مساعدة + Row Level Security + سجل التدقيق
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER: they read role tables without
-- recursing into RLS). All are STABLE and pinned to a safe search_path.
-- ---------------------------------------------------------------------
create or replace function app.has_role(r app_role) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from user_roles ur join users u on u.id = ur.user_id
                 where ur.user_id = app.uid() and ur.role = r and u.is_active and u.archived_at is null)
$$;

create or replace function app.has_perm(k text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from user_roles ur
    join users u on u.id = ur.user_id and u.is_active and u.archived_at is null
    join roles r on r.key = ur.role
    join role_permissions rp on rp.role_id = r.id
    join permissions p on p.id = rp.permission_id
    where ur.user_id = app.uid() and p.key = k)
$$;

-- admin / operations manager / report viewer: read access to every site
create or replace function app.is_global() returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from user_roles ur join users u on u.id = ur.user_id
                 where ur.user_id = app.uid() and u.is_active and u.archived_at is null
                   and ur.role in ('system_admin','operations_manager','report_viewer'))
$$;

-- admin / operations manager: can act on every site
create or replace function app.is_manager_global() returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from user_roles ur join users u on u.id = ur.user_id
                 where ur.user_id = app.uid() and u.is_active and u.archived_at is null
                   and ur.role in ('system_admin','operations_manager'))
$$;

create or replace function app.my_employee_id() returns uuid
language sql stable security definer set search_path = public, app as $$
  select employee_id from users where id = app.uid() and is_active and archived_at is null
$$;

-- sites supervised by the current user (including child sites)
create or replace function app.supervised_site_ids() returns uuid[]
language sql stable security definer set search_path = public, app as $$
  with recursive s as (
    select ss.site_id as id from supervisor_sites ss
    where ss.user_id = app.uid() and app.has_role('site_supervisor')
    union
    select c.id from sites c join s on c.parent_site_id = s.id
  ) select coalesce(array_agg(id), '{}') from s
$$;

-- sites the current user may see
create or replace function app.my_site_ids() returns uuid[]
language sql stable security definer set search_path = public, app as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select unnest(app.supervised_site_ids()) x
    union select e.primary_site_id from employees e where e.id = app.my_employee_id()
    union select sa.site_id from shift_assignments sa
          where sa.employee_id = app.my_employee_id() and sa.archived_at is null
            and sa.start_date <= current_date and (sa.end_date is null or sa.end_date >= current_date)
  ) t where x is not null
$$;

create or replace function app.can_see_site(s uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.uid() is not null and (app.is_global() or s = any(app.my_site_ids()))
$$;

create or replace function app.can_manage_site(s uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.uid() is not null and (app.is_manager_global() or (s is not null and s = any(app.supervised_site_ids())))
$$;

-- any operational role (everything except a pure report viewer)
create or replace function app.is_writer() returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from user_roles ur join users u on u.id = ur.user_id
                 where ur.user_id = app.uid() and u.is_active and u.archived_at is null
                   and ur.role in ('system_admin','operations_manager','site_supervisor','employee'))
$$;

create or replace function app.employee_site(e uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select primary_site_id from employees where id = e
$$;

create or replace function app.can_manage_employee(e uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.uid() is not null and (
    app.is_manager_global()
    or app.can_manage_site(app.employee_site(e))
    or (app.has_role('site_supervisor') and exists (select 1 from employees x where x.id = e and x.manager_id = app.my_employee_id()))
  )
$$;

create or replace function app.can_see_employee(e uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.uid() is not null and (app.is_global() or e = app.my_employee_id() or app.can_manage_employee(e))
$$;

create or replace function app.employee_user(e uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select id from users where employee_id = e and is_active and archived_at is null
$$;

-- users to notify for a site (its supervisors + operations managers)
create or replace function app.site_manager_users(s uuid) returns setof uuid
language sql stable security definer set search_path = public, app as $$
  select distinct u.id from users u join user_roles ur on ur.user_id = u.id
  where u.is_active and u.archived_at is null and (
    ur.role = 'operations_manager'
    or (ur.role = 'site_supervisor' and exists (
        select 1 from supervisor_sites ss where ss.user_id = u.id and (ss.site_id = s
          or ss.site_id = (select parent_site_id from sites where id = s)))))
$$;

create or replace function app.can_see_task(t uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from tasks x where x.id = t and (
    app.is_global() or app.can_manage_site(x.site_id)
    or x.owner_employee_id = app.my_employee_id()
    or x.created_by = app.uid() or x.supervisor_user_id = app.uid() or x.reviewer_user_id = app.uid()
    or exists (select 1 from task_assignees a where a.task_id = x.id and a.employee_id = app.my_employee_id())))
$$;

create or replace function app.can_see_entity(etype text, eid uuid) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
begin
  case etype
    when 'task' then return app.can_see_task(eid);
    when 'employee' then return app.can_see_employee(eid);
    when 'employee_skill' then return app.can_see_employee((select employee_id from employee_skills where id = eid));
    when 'handover' then return app.can_see_site((select site_id from shift_handover_reports where id = eid));
    when 'leave' then return app.can_see_employee((select employee_id from leave_requests where id = eid));
    when 'plan' then return app.can_see_employee((select employee_id from development_plans where id = eid));
    when 'enrollment' then return app.can_see_employee((select employee_id from training_enrollments where id = eid));
    when 'idea' then return exists (select 1 from improvement_ideas i where i.id = eid and
         (i.site_id is null or app.can_see_site(i.site_id) or i.submitted_by_employee_id = app.my_employee_id()));
    when 'review' then return exists (select 1 from performance_reviews r where r.id = eid and
         (app.can_manage_employee(r.employee_id) or app.is_global() or (r.employee_id = app.my_employee_id() and r.status <> 'draft')));
    else return false;
  end case;
end $$;

-- ---------------------------------------------------------------------
-- Notifications helper
-- ---------------------------------------------------------------------
create or replace function app.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if p_user is null then return; end if;
  if p_user = app.uid() and p_dedupe is null then return; end if;  -- do not notify the actor about own action
  insert into notifications(user_id, type, title, body, link, dedupe_key)
  values (p_user, p_type, p_title, p_body, p_link, p_dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Audit trigger (cannot be bypassed by app_user; audit_logs is read-only)
-- ---------------------------------------------------------------------
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  rid text;
  act text := lower(tg_op);
begin
  if tg_table_name = 'users' then
    o := o - 'password_hash'; n := n - 'password_hash';
  end if;
  if tg_op = 'UPDATE' then
    if (o - 'updated_at' - 'updated_by' - 'last_login_at') = (n - 'updated_at' - 'updated_by' - 'last_login_at') then
      return new;
    end if;
    if (o->>'archived_at') is null and (n->>'archived_at') is not null then act := 'archive';
    elsif (o->>'archived_at') is not null and (n->>'archived_at') is null then act := 'restore';
    end if;
  end if;
  rid := coalesce(n->>'id', o->>'id', n->>'employee_id', o->>'employee_id', n->>'key', o->>'key', n->>'user_id', o->>'user_id');
  insert into audit_logs(actor_id, action, table_name, record_id, old_data, new_data, reason)
  values (app.uid(), act, tg_table_name, rid, o, n, nullif(current_setting('app.reason', true), ''));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['departments','sites','lines','shifts','employees','employee_private','users','user_roles',
    'supervisor_sites','role_permissions','shift_assignments','site_coverage_rules','skill_domains','skills','employee_skills',
    'tasks','task_assignees','attachments','shift_handover_reports','handover_items','leave_types','leave_requests',
    'training_courses','training_enrollments','development_plans','improvement_ideas','review_criteria','rating_levels',
    'performance_reviews','performance_review_scores','integration_configs','integration_records','system_settings'] loop
    execute format('create trigger trg_%s_audit after insert or update or delete on %I for each row execute function app.audit()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant usage on schema public, app to app_user;
grant execute on all functions in schema app to app_user;
grant select, insert, update on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
revoke insert, update on audit_logs from app_user;
revoke insert, update on users from app_user;            -- accounts are created by the API (password hashing)
grant update (full_name, employee_id, is_active, archived_at, archived_by) on users to app_user;
grant delete on task_assignees, supervisor_sites, user_roles, role_permissions, idea_participants, performance_review_scores to app_user;
revoke insert on notifications from app_user;            -- created by triggers/jobs only

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['roles','permissions','role_permissions','departments','sites','lines','shifts','employees',
    'employee_private','users','user_roles','supervisor_sites','shift_assignments','site_coverage_rules','skill_domains',
    'skills','employee_skills','tasks','task_assignees','task_comments','task_events','attachments','shift_handover_reports',
    'handover_items','leave_types','leave_requests','leave_request_events','training_courses','training_enrollments',
    'development_plans','improvement_ideas','idea_participants','review_criteria','rating_levels','performance_reviews',
    'performance_review_scores','notifications','integration_configs','integration_records','audit_logs','system_settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- Lookup / reference tables: readable by any signed-in user, managed by permission
create policy sel on roles for select to app_user using (app.uid() is not null);
create policy sel on permissions for select to app_user using (app.uid() is not null);
create policy sel on role_permissions for select to app_user using (app.uid() is not null);
create policy ins on role_permissions for insert to app_user with check (app.has_perm('users.manage'));
create policy del on role_permissions for delete to app_user using (app.has_perm('users.manage'));

create policy sel on departments for select to app_user using (app.uid() is not null);
create policy ins on departments for insert to app_user with check (app.has_perm('settings.manage'));
create policy upd on departments for update to app_user using (app.has_perm('settings.manage'));

create policy sel on sites for select to app_user using (app.can_see_site(id));
create policy ins on sites for insert to app_user with check (app.has_perm('sites.manage'));
create policy upd on sites for update to app_user using (app.has_perm('sites.manage'));

create policy sel on lines for select to app_user using (app.uid() is not null);
create policy ins on lines for insert to app_user with check (app.has_perm('sites.manage'));
create policy upd on lines for update to app_user using (app.has_perm('sites.manage'));

create policy sel on shifts for select to app_user using (app.uid() is not null);
create policy ins on shifts for insert to app_user with check (app.has_perm('shifts.manage') and (site_id is null and app.is_manager_global() or app.can_manage_site(site_id)));
create policy upd on shifts for update to app_user using (app.has_perm('shifts.manage') and app.can_manage_site(coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid)) or app.has_perm('settings.manage'));

create policy sel on skill_domains for select to app_user using (app.uid() is not null);
create policy ins on skill_domains for insert to app_user with check (app.has_perm('skills.manage'));
create policy upd on skill_domains for update to app_user using (app.has_perm('skills.manage'));
create policy sel on skills for select to app_user using (app.uid() is not null);
create policy ins on skills for insert to app_user with check (app.has_perm('skills.manage'));
create policy upd on skills for update to app_user using (app.has_perm('skills.manage'));

create policy sel on leave_types for select to app_user using (app.uid() is not null);
create policy ins on leave_types for insert to app_user with check (app.has_perm('settings.manage'));
create policy upd on leave_types for update to app_user using (app.has_perm('settings.manage'));

create policy sel on review_criteria for select to app_user using (app.uid() is not null);
create policy ins on review_criteria for insert to app_user with check (app.has_perm('settings.manage'));
create policy upd on review_criteria for update to app_user using (app.has_perm('settings.manage'));
create policy sel on rating_levels for select to app_user using (app.uid() is not null);
create policy ins on rating_levels for insert to app_user with check (app.has_perm('settings.manage'));
create policy upd on rating_levels for update to app_user using (app.has_perm('settings.manage'));

create policy sel on system_settings for select to app_user using (app.uid() is not null);
create policy ins on system_settings for insert to app_user with check (app.has_perm('settings.manage'));
create policy upd on system_settings for update to app_user using (app.has_perm('settings.manage'));

-- Users & roles
create policy sel on users for select to app_user using (id = app.uid() or app.has_perm('users.manage'));
create policy upd on users for update to app_user using (app.has_perm('users.manage'));
create policy sel on user_roles for select to app_user using (user_id = app.uid() or app.has_perm('users.manage'));
create policy ins on user_roles for insert to app_user with check (app.has_perm('users.manage'));
create policy del on user_roles for delete to app_user using (app.has_perm('users.manage') and not (user_id = app.uid() and role = 'system_admin'));
create policy sel on supervisor_sites for select to app_user using (user_id = app.uid() or app.has_perm('users.manage') or app.is_global());
create policy ins on supervisor_sites for insert to app_user with check (app.has_perm('users.manage'));
create policy del on supervisor_sites for delete to app_user using (app.has_perm('users.manage'));

-- Employees
create policy sel on employees for select to app_user using (app.can_see_employee(id));
create policy ins on employees for insert to app_user with check (app.has_perm('employees.manage') and (app.is_manager_global() or app.can_manage_site(primary_site_id)));
create policy upd on employees for update to app_user using (app.has_perm('employees.manage') and app.can_manage_employee(id));

create policy sel on employee_private for select to app_user using (
  employee_id = app.my_employee_id() or (app.has_perm('employees.view_private') and app.can_manage_employee(employee_id)));
create policy ins on employee_private for insert to app_user with check (app.has_perm('employees.manage') and app.can_manage_employee(employee_id));
create policy upd on employee_private for update to app_user using (app.has_perm('employees.manage') and app.can_manage_employee(employee_id));

-- Shift assignments & coverage
create policy sel on shift_assignments for select to app_user using (app.can_see_site(site_id) or employee_id = app.my_employee_id());
create policy ins on shift_assignments for insert to app_user with check (app.has_perm('shifts.manage') and app.can_manage_site(site_id));
create policy upd on shift_assignments for update to app_user using (app.has_perm('shifts.manage') and app.can_manage_site(site_id));
create policy sel on site_coverage_rules for select to app_user using (app.can_see_site(site_id));
create policy ins on site_coverage_rules for insert to app_user with check (app.has_perm('shifts.manage') and app.can_manage_site(site_id));
create policy upd on site_coverage_rules for update to app_user using (app.has_perm('shifts.manage') and app.can_manage_site(site_id));

-- Employee skills: assessed by authorised supervisors; employees may self-report (never as assessment)
create policy sel on employee_skills for select to app_user using (app.can_see_employee(employee_id));
create policy ins on employee_skills for insert to app_user with check (
  (app.has_perm('skills.assess') and app.can_manage_employee(employee_id))
  or (employee_id = app.my_employee_id() and source = 'self_reported'));
create policy upd on employee_skills for update to app_user using (
  (app.has_perm('skills.assess') and app.can_manage_employee(employee_id))
  or (employee_id = app.my_employee_id() and source = 'self_reported'))
  with check ((app.has_perm('skills.assess') and app.can_manage_employee(employee_id))
  or (employee_id = app.my_employee_id() and source = 'self_reported'));

-- Tasks
create policy sel on tasks for select to app_user using (
  app.is_global() or app.can_manage_site(site_id) or owner_employee_id = app.my_employee_id()
  or created_by = app.uid() or supervisor_user_id = app.uid() or reviewer_user_id = app.uid()
  or exists (select 1 from task_assignees a where a.task_id = id and a.employee_id = app.my_employee_id()));
create policy ins on tasks for insert to app_user with check (
  app.has_perm('tasks.create') and (app.is_manager_global() or app.can_manage_site(site_id)));
create policy upd on tasks for update to app_user using (
  (app.has_perm('tasks.manage') and (app.is_manager_global() or app.can_manage_site(site_id)))
  or owner_employee_id = app.my_employee_id() or reviewer_user_id = app.uid()
  or exists (select 1 from task_assignees a where a.task_id = id and a.employee_id = app.my_employee_id()));

create policy sel on task_assignees for select to app_user using (app.can_see_task(task_id));
create policy ins on task_assignees for insert to app_user with check (
  app.has_perm('tasks.manage') and app.can_manage_site((select site_id from tasks where id = task_id))
  or exists (select 1 from tasks t where t.id = task_id and t.created_by = app.uid()));
create policy del on task_assignees for delete to app_user using (
  app.has_perm('tasks.manage') and app.can_manage_site((select site_id from tasks where id = task_id)));

create policy sel on task_comments for select to app_user using (app.can_see_task(task_id));
create policy ins on task_comments for insert to app_user with check (app.can_see_task(task_id) and author_id = app.uid() and app.is_writer());
create policy sel on task_events for select to app_user using (app.can_see_task(task_id));
-- task_events are written by trigger only
revoke insert, update on task_events from app_user;

-- Attachments: visible when the parent record is visible; upload requires the same
create policy sel on attachments for select to app_user using (app.can_see_entity(entity_type, entity_id));
create policy ins on attachments for insert to app_user with check (app.can_see_entity(entity_type, entity_id) and uploaded_by = app.uid() and app.is_writer());
create policy upd on attachments for update to app_user using (uploaded_by = app.uid() or app.is_manager_global());

-- Shift handover
create policy sel on shift_handover_reports for select to app_user using (app.can_see_site(site_id));
create policy ins on shift_handover_reports for insert to app_user with check (
  app.can_manage_site(site_id) or (app.my_employee_id() is not null and site_id = any(app.my_site_ids())));
create policy upd on shift_handover_reports for update to app_user using (
  app.can_manage_site(site_id) or outgoing_employee_id = app.my_employee_id() or incoming_employee_id = app.my_employee_id()
  or (created_by = app.uid() and status = 'draft'));
create policy sel on handover_items for select to app_user using (app.can_see_site((select site_id from shift_handover_reports where id = report_id)));
create policy ins on handover_items for insert to app_user with check (exists (select 1 from shift_handover_reports r where r.id = report_id and
  (app.can_manage_site(r.site_id) or r.outgoing_employee_id = app.my_employee_id() or r.created_by = app.uid())));
create policy upd on handover_items for update to app_user using (exists (select 1 from shift_handover_reports r where r.id = report_id and
  (app.can_manage_site(r.site_id) or r.site_id = any(app.my_site_ids()) and app.my_employee_id() is not null)));

-- Leave
create policy sel on leave_requests for select to app_user using (app.can_see_employee(employee_id));
create policy ins on leave_requests for insert to app_user with check (
  status in ('draft','submitted') and (employee_id = app.my_employee_id() or (app.has_perm('leave.recommend') and app.can_manage_employee(employee_id))));
create policy upd on leave_requests for update to app_user using (
  (employee_id = app.my_employee_id() and status = 'draft') or current_setting('app.leave_rpc', true) = 'on');
create policy sel on leave_request_events for select to app_user using (app.can_see_employee((select employee_id from leave_requests where id = request_id)));
revoke insert, update on leave_request_events from app_user;

-- Training & development
create policy sel on training_courses for select to app_user using (app.uid() is not null);
create policy ins on training_courses for insert to app_user with check (app.has_perm('training.manage'));
create policy upd on training_courses for update to app_user using (app.has_perm('training.manage'));
create policy sel on training_enrollments for select to app_user using (app.can_see_employee(employee_id));
create policy ins on training_enrollments for insert to app_user with check (app.has_perm('training.manage') and app.can_manage_employee(employee_id));
create policy upd on training_enrollments for update to app_user using (app.has_perm('training.manage') and app.can_manage_employee(employee_id));
create policy sel on development_plans for select to app_user using (app.can_see_employee(employee_id) or mentor_employee_id = app.my_employee_id());
create policy ins on development_plans for insert to app_user with check (app.has_perm('training.manage') and app.can_manage_employee(employee_id));
create policy upd on development_plans for update to app_user using (app.has_perm('training.manage') and app.can_manage_employee(employee_id));

-- Ideas & initiatives: everyone can propose; managers manage
create policy sel on improvement_ideas for select to app_user using (
  app.is_global() or site_id is null and app.uid() is not null or app.can_see_site(site_id) or submitted_by_employee_id = app.my_employee_id());
create policy ins on improvement_ideas for insert to app_user with check (
  (submitted_by_employee_id = app.my_employee_id() and status = 'submitted')
  or (app.has_perm('ideas.manage') and (site_id is null or app.can_manage_site(site_id))));
create policy upd on improvement_ideas for update to app_user using (
  (app.has_perm('ideas.manage') and (site_id is null or app.can_manage_site(site_id)))
  or (submitted_by_employee_id = app.my_employee_id() and status = 'submitted'));
create policy sel on idea_participants for select to app_user using (app.can_see_entity('idea', idea_id));
create policy ins on idea_participants for insert to app_user with check (app.has_perm('ideas.manage'));
create policy del on idea_participants for delete to app_user using (app.has_perm('ideas.manage'));

-- Performance reviews: never public; employee sees own after submission
create policy sel on performance_reviews for select to app_user using (
  (app.has_perm('reviews.manage') and app.can_manage_employee(employee_id)) or app.is_global()
  or (employee_id = app.my_employee_id() and status <> 'draft'));
create policy ins on performance_reviews for insert to app_user with check (app.has_perm('reviews.manage') and app.can_manage_employee(employee_id));
create policy upd on performance_reviews for update to app_user using (
  (app.has_perm('reviews.manage') and app.can_manage_employee(employee_id)) or current_setting('app.review_rpc', true) = 'on');
create policy sel on performance_review_scores for select to app_user using (app.can_see_entity('review', review_id));
create policy ins on performance_review_scores for insert to app_user with check (exists (select 1 from performance_reviews r where r.id = review_id and app.has_perm('reviews.manage') and app.can_manage_employee(r.employee_id) and r.status = 'draft'));
create policy upd on performance_review_scores for update to app_user using (exists (select 1 from performance_reviews r where r.id = review_id and app.has_perm('reviews.manage') and app.can_manage_employee(r.employee_id) and r.status = 'draft'));
create policy del on performance_review_scores for delete to app_user using (exists (select 1 from performance_reviews r where r.id = review_id and app.has_perm('reviews.manage') and app.can_manage_employee(r.employee_id) and r.status = 'draft'));

-- Notifications: own only
create policy sel on notifications for select to app_user using (user_id = app.uid());
create policy upd on notifications for update to app_user using (user_id = app.uid()) with check (user_id = app.uid());

-- Integrations
create policy sel on integration_configs for select to app_user using (app.has_perm('integrations.manage') or app.is_manager_global());
create policy upd on integration_configs for update to app_user using (app.has_perm('integrations.manage'));
create policy ins on integration_configs for insert to app_user with check (app.has_perm('integrations.manage'));
create policy sel on integration_records for select to app_user using (
  (entity_type = 'task' and app.can_see_task(entity_id))
  or (entity_type in ('handover') and app.can_see_entity('handover', entity_id))
  or (entity_type = 'handover_item' and app.can_see_entity('handover', (select report_id from handover_items where id = entity_id)))
  or (entity_type = 'idea' and app.can_see_entity('idea', entity_id)));
create policy ins on integration_records for insert to app_user with check (
  app.is_writer() and (
  (entity_type = 'task' and app.can_see_task(entity_id))
  or (entity_type = 'handover' and app.can_see_entity('handover', entity_id))
  or (entity_type = 'handover_item' and app.can_see_entity('handover', (select report_id from handover_items where id = entity_id)))
  or (entity_type = 'idea' and app.has_perm('ideas.manage'))));
create policy upd on integration_records for update to app_user using (created_by = app.uid() or app.is_manager_global());

-- Audit log: read only, by permission. No insert/update/delete for app_user at all.
create policy sel on audit_logs for select to app_user using (app.has_perm('audit.view'));

-- ---------------------------------------------------------------------
-- Directory views (names only) used for pickers. They run with owner
-- rights but filter rows by the caller's visibility explicitly.
-- ---------------------------------------------------------------------
create view employee_directory as
  select e.id, e.employee_number, e.full_name, e.job_title, e.primary_site_id, e.line_id, e.shift_id, e.status, e.is_demo
  from employees e
  where e.archived_at is null and (app.is_global() or e.id = app.my_employee_id() or app.can_see_site(e.primary_site_id));
create view user_directory as
  select u.id, u.full_name, u.employee_id from users u
  where u.archived_at is null and app.uid() is not null;
grant select on employee_directory, user_directory to app_user;

-- The API connection role (owner) must be able to switch to app_user per request.
do $$ begin execute format('grant app_user to %I', current_user); exception when others then null; end $$;
