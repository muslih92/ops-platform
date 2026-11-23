-- =====================================================================
-- Views used by the UI (security_invoker → RLS of the caller applies)
-- People names come from the directory views, which only expose names.
-- =====================================================================

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text,
  ip text
);
create index sessions_user_idx on sessions(user_id);
revoke all on sessions from app_user;  -- server-only

create view v_sites with (security_invoker = true) as
  select s.*, p.name as parent_name,
    (select count(*) from lines l where l.site_id = s.id and l.archived_at is null)::int as lines_count,
    (select count(*) from employees e where e.primary_site_id = s.id and e.archived_at is null)::int as employees_count
  from sites s left join sites p on p.id = s.parent_site_id;

create view v_lines with (security_invoker = true) as
  select l.*, s.name as site_name from lines l join sites s on s.id = l.site_id;

create view v_shifts with (security_invoker = true) as
  select f.*, s.name as site_name,
    (select count(*) from employees e where e.shift_id = f.id and e.archived_at is null and e.status = 'active')::int as employees_count
  from shifts f left join sites s on s.id = f.site_id;

create view v_coverage_rules with (security_invoker = true) as
  select r.*, s.name as site_name, f.name as shift_name
  from site_coverage_rules r join sites s on s.id = r.site_id join shifts f on f.id = r.shift_id;

create view v_shift_assignments with (security_invoker = true) as
  select a.*, ed.full_name as employee_name, ed.employee_number, s.name as site_name, f.name as shift_name, l.name as line_name
  from shift_assignments a
  left join employee_directory ed on ed.id = a.employee_id
  join sites s on s.id = a.site_id join shifts f on f.id = a.shift_id left join lines l on l.id = a.line_id;

create view v_employees with (security_invoker = true) as
  select e.*, s.name as site_name, s.type as site_type, l.name as line_name, f.name as shift_name, d.name as department_name,
         m.full_name as manager_name,
         (select u.id from users u where u.employee_id = e.id and u.archived_at is null limit 1) as user_id
  from employees e
  left join sites s on s.id = e.primary_site_id
  left join lines l on l.id = e.line_id
  left join shifts f on f.id = e.shift_id
  left join departments d on d.id = e.department_id
  left join employee_directory m on m.id = e.manager_id;

create view v_skills with (security_invoker = true) as
  select k.*, d.name as domain_name, d.sort_order as domain_order
  from skills k join skill_domains d on d.id = k.domain_id;

create view v_employee_skills with (security_invoker = true) as
  select es.*, e.full_name as employee_name, e.employee_number, e.primary_site_id as site_id, s.name as site_name,
         k.name as skill_name, k.is_core, k.criticality, k.domain_id, d.name as domain_name, ud.full_name as assessor_name
  from employee_skills es
  join employees e on e.id = es.employee_id
  left join sites s on s.id = e.primary_site_id
  join skills k on k.id = es.skill_id join skill_domains d on d.id = k.domain_id
  left join user_directory ud on ud.id = es.assessor_id;

create view v_tasks with (security_invoker = true) as
  select t.*, s.name as site_name, l.name as line_name, o.full_name as owner_name, o.employee_number as owner_number,
         su.full_name as supervisor_name, ru.full_name as reviewer_name, cu.full_name as closed_by_name, cr.full_name as created_by_name,
         (t.status not in ('completed','cancelled','waiting_other_party') and t.due_at < now()) as is_overdue,
         (select count(*) from task_comments c where c.task_id = t.id)::int as comments_count,
         (select coalesce(array_agg(a.employee_id), '{}') from task_assignees a where a.task_id = t.id) as assignee_ids
  from tasks t
  left join sites s on s.id = t.site_id left join lines l on l.id = t.line_id
  left join employee_directory o on o.id = t.owner_employee_id
  left join user_directory su on su.id = t.supervisor_user_id
  left join user_directory ru on ru.id = t.reviewer_user_id
  left join user_directory cu on cu.id = t.closed_by
  left join user_directory cr on cr.id = t.created_by;

create view v_task_comments with (security_invoker = true) as
  select c.*, u.full_name as author_name from task_comments c left join user_directory u on u.id = c.author_id;

create view v_task_events with (security_invoker = true) as
  select ev.*, u.full_name as actor_name from task_events ev left join user_directory u on u.id = ev.actor_id;

create view v_task_assignees with (security_invoker = true) as
  select a.*, ed.full_name as employee_name, ed.employee_number from task_assignees a left join employee_directory ed on ed.id = a.employee_id;

create view v_attachments with (security_invoker = true) as
  select a.id, a.entity_type, a.entity_id, a.file_name, a.mime_type, a.size_bytes, a.uploaded_by, a.created_at, a.archived_at,
         u.full_name as uploaded_by_name
  from attachments a left join user_directory u on u.id = a.uploaded_by;

create view v_handover_reports with (security_invoker = true) as
  select r.*, s.name as site_name, l.name as line_name, f.name as shift_name,
         oe.full_name as outgoing_name, ie.full_name as incoming_name,
         (select count(*) from handover_items i where i.report_id = r.id and i.status = 'open')::int as open_items,
         (select count(*) from handover_items i where i.report_id = r.id)::int as items_count
  from shift_handover_reports r
  join sites s on s.id = r.site_id left join lines l on l.id = r.line_id left join shifts f on f.id = r.shift_id
  left join employee_directory oe on oe.id = r.outgoing_employee_id
  left join employee_directory ie on ie.id = r.incoming_employee_id;

create view v_handover_items with (security_invoker = true) as
  select i.*, r.site_id, r.shift_id, r.handover_at, s.name as site_name, t.status as task_status
  from handover_items i join shift_handover_reports r on r.id = i.report_id join sites s on s.id = r.site_id
  left join tasks t on t.id = i.linked_task_id;

create view v_leave_requests with (security_invoker = true) as
  select l.*, e.full_name as employee_name, e.employee_number, e.primary_site_id as site_id, s.name as site_name,
         e.shift_id, f.name as shift_name, lt.name as leave_type_name, lt.color as leave_type_color,
         (l.end_date - l.start_date + 1) as days,
         du.full_name as decided_by_name, rb.full_name as recommended_by_name
  from leave_requests l
  join employees e on e.id = l.employee_id
  left join sites s on s.id = e.primary_site_id left join shifts f on f.id = e.shift_id
  join leave_types lt on lt.id = l.leave_type_id
  left join user_directory du on du.id = l.decided_by
  left join user_directory rb on rb.id = l.recommended_by;

create view v_leave_events with (security_invoker = true) as
  select ev.*, u.full_name as actor_name from leave_request_events ev left join user_directory u on u.id = ev.actor_id;

create view v_training_courses with (security_invoker = true) as
  select c.*,
    (select count(*) from training_enrollments e where e.course_id = c.id and e.archived_at is null)::int as enrolled_count,
    (select coalesce(array_agg(k.name), '{}') from skills k where k.id = any(c.skill_ids)) as skill_names
  from training_courses c;

create view v_training_enrollments with (security_invoker = true) as
  select en.*, c.name as course_name, c.start_date, c.end_date, c.provider, e.full_name as employee_name, e.employee_number,
         e.primary_site_id as site_id, s.name as site_name
  from training_enrollments en join training_courses c on c.id = en.course_id
  join employees e on e.id = en.employee_id left join sites s on s.id = e.primary_site_id;

create view v_development_plans with (security_invoker = true) as
  select p.*, e.full_name as employee_name, e.employee_number, e.primary_site_id as site_id, s.name as site_name,
         k.name as target_skill_name, m.full_name as mentor_name, c.name as course_name,
         (p.status not in ('completed') and p.end_date < current_date) as is_late
  from development_plans p join employees e on e.id = p.employee_id
  left join sites s on s.id = e.primary_site_id left join skills k on k.id = p.target_skill_id
  left join employee_directory m on m.id = p.mentor_employee_id left join training_courses c on c.id = p.course_id;

create view v_ideas with (security_invoker = true) as
  select i.*, sb.full_name as submitted_by_name, ow.full_name as owner_name, s.name as site_name,
         t.title as linked_task_title, p.goal as linked_plan_goal
  from improvement_ideas i
  left join employee_directory sb on sb.id = i.submitted_by_employee_id
  left join employee_directory ow on ow.id = i.owner_employee_id
  left join sites s on s.id = i.site_id
  left join tasks t on t.id = i.linked_task_id
  left join development_plans p on p.id = i.linked_plan_id;

create view v_reviews with (security_invoker = true) as
  select r.*, e.full_name as employee_name, e.employee_number, e.primary_site_id as site_id, s.name as site_name,
         u.full_name as reviewer_name, rl.name as overall_rating_name, rl.color as overall_rating_color
  from performance_reviews r join employees e on e.id = r.employee_id left join sites s on s.id = e.primary_site_id
  left join user_directory u on u.id = r.reviewer_id left join rating_levels rl on rl.id = r.overall_rating_level_id;

create view v_review_scores with (security_invoker = true) as
  select sc.*, c.name as criterion_name, c.sort_order, rl.name as rating_name, rl.value as rating_value
  from performance_review_scores sc join review_criteria c on c.id = sc.criterion_id left join rating_levels rl on rl.id = sc.rating_level_id;

create view v_users with (security_invoker = true) as
  select u.id, u.email, u.full_name, u.employee_id, u.is_active, u.last_login_at, u.created_at, u.archived_at,
         e.full_name as employee_name, e.employee_number,
         (select coalesce(array_agg(r.role::text order by r.role), '{}') from user_roles r where r.user_id = u.id) as roles,
         (select coalesce(array_agg(ss.site_id), '{}') from supervisor_sites ss where ss.user_id = u.id) as site_ids
  from users u left join employees e on e.id = u.employee_id;

create view v_audit_logs with (security_invoker = true) as
  select a.*, u.full_name as actor_name from audit_logs a left join user_directory u on u.id = a.actor_id;

create view v_integration_records with (security_invoker = true) as
  select r.*, u.full_name as created_by_name from integration_records r left join user_directory u on u.id = r.created_by;

grant select on all tables in schema public to app_user;
revoke all on sessions from app_user;
revoke insert, update on audit_logs from app_user;
