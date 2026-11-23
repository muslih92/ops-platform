-- =====================================================================
-- منظومة إدارة وتمكين فريق التشغيل - المخطط الأساسي
-- PostgreSQL 15+
-- =====================================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists app;

-- ---------------------------------------------------------------------
-- Runtime role: every API request runs as app_user with RLS enforced.
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin noinherit;
  end if;
end $$;

-- Request context (set by the API server per transaction)
create or replace function app.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type app_role as enum ('system_admin','operations_manager','site_supervisor','employee','report_viewer');
create type site_type as enum ('system','pumping_station','line','terminal_station','control_room','strategic_tank','emergency_tank','other');
create type employee_status as enum ('active','on_leave','suspended','resigned');
create type skill_criticality as enum ('low','medium','high','critical');
create type skill_source as enum ('assessment','self_reported');
create type task_type as enum ('periodic','operational','observation_followup','improvement','training','administrative','interdept_followup');
create type task_priority as enum ('low','normal','high','critical');
create type task_status as enum ('new','assigned','in_progress','waiting_other_party','completed','cancelled');
create type recurrence_kind as enum ('none','daily','weekly','monthly');
create type handover_status as enum ('draft','submitted','acknowledged');
create type handover_item_kind as enum ('open_task','alarm_event','out_of_service','work_order','followup','note');
create type open_closed as enum ('open','closed');
create type leave_status as enum ('draft','submitted','pending_review','recommended','approved','rejected','cancelled');
create type plan_method as enum ('on_job','course','mentoring','task_participation','procedure_study');
create type plan_status as enum ('planned','in_progress','awaiting_practical','completed','overdue');
create type enrollment_status as enum ('nominated','attended','absent','completed');
create type idea_status as enum ('submitted','under_review','approved','in_progress','implemented','rejected');
create type review_status as enum ('draft','submitted','acknowledged');
create type integration_kind as enum ('sap_pm','scada','email','whatsapp');
create type integration_status as enum ('not_configured','configured','connected','last_failed');

-- ---------------------------------------------------------------------
-- Helper: standard audit columns trigger
-- ---------------------------------------------------------------------
create or replace function app.touch_row() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, app.uid());
  end if;
  new.updated_at := now();
  new.updated_by := app.uid();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Users, roles, permissions
-- ---------------------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  key app_role not null unique,
  name text not null,
  description text
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  category text
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 150),
  code text,
  description text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 150),
  code text not null unique check (length(trim(code)) between 1 and 40),
  type site_type not null default 'other',
  parent_site_id uuid references sites(id),
  region text,
  description text,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);
create index sites_parent_idx on sites(parent_site_id);
create index sites_name_trgm on sites using gin (name gin_trgm_ops);

create table lines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 150),
  code text not null,
  site_id uuid not null references sites(id),
  description text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  unique (site_id, code)
);
create index lines_site_idx on lines(site_id);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  code text not null,
  site_id uuid references sites(id),
  start_time time not null,
  end_time time not null,
  work_days int[] not null default '{0,1,2,3,4,5,6}' check (work_days <@ array[0,1,2,3,4,5,6]),
  color text not null default '#0e7490',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);
create index shifts_site_idx on shifts(site_id);

create table employees (
  id uuid primary key default gen_random_uuid(),
  employee_number text not null unique check (length(trim(employee_number)) between 1 and 40),
  full_name text not null check (length(trim(full_name)) between 2 and 150),
  job_title text,
  department_id uuid references departments(id),
  primary_site_id uuid references sites(id),
  line_id uuid references lines(id),
  shift_id uuid references shifts(id),
  manager_id uuid references employees(id),
  hire_date date,
  status employee_status not null default 'active',
  qualifications text,
  certifications text,
  previous_experience text,
  strengths text,
  interests text,
  desired_skills text,
  capabilities text[] not null default '{}',   -- reports / data / training / coordination / problem_solving
  specialization_wishes text,
  supervisor_recommendation text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);
create index employees_site_idx on employees(primary_site_id);
create index employees_shift_idx on employees(shift_id);
create index employees_manager_idx on employees(manager_id);
create index employees_name_trgm on employees using gin (full_name gin_trgm_ops);
create index employees_number_trgm on employees using gin (employee_number gin_trgm_ops);

-- Sensitive data separated, restricted by RLS
create table employee_private (
  employee_id uuid primary key references employees(id) on delete cascade,
  phone text check (phone is null or phone ~ '^[0-9+ ()-]{6,20}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  admin_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text not null,
  full_name text not null check (length(trim(full_name)) between 2 and 150),
  employee_id uuid unique references employees(id),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, role)
);

create table supervisor_sites (
  user_id uuid not null references users(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, site_id)
);
create index supervisor_sites_site_idx on supervisor_sites(site_id);

create table shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  site_id uuid not null references sites(id),
  shift_id uuid not null references shifts(id),
  line_id uuid references lines(id),
  start_date date not null default current_date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check (end_date is null or end_date >= start_date)
);
create index shift_assignments_emp_idx on shift_assignments(employee_id);
create index shift_assignments_site_shift_idx on shift_assignments(site_id, shift_id);

create table site_coverage_rules (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  shift_id uuid not null references shifts(id),
  min_staff int not null default 1 check (min_staff between 0 and 200),
  required_skill_ids uuid[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  unique (site_id, shift_id)
);

-- ---------------------------------------------------------------------
-- Skills
-- ---------------------------------------------------------------------
create table skill_domains (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 150),
  description text,
  sort_order int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);

create table skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 150),
  domain_id uuid not null references skill_domains(id),
  applicable_site_types site_type[] not null default '{}',
  applicable_site_ids uuid[] not null default '{}',
  criticality skill_criticality not null default 'medium',
  is_core boolean not null default false,
  training_requirements text,
  proof_requirements text,
  reassess_months int check (reassess_months is null or reassess_months between 1 and 120),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);
create index skills_domain_idx on skills(domain_id);

create table employee_skills (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  skill_id uuid not null references skills(id),
  level int not null check (level between 1 and 4),
  assessed_at date,
  assessor_id uuid references users(id),
  notes text,
  next_reassess_at date,
  source skill_source not null default 'assessment',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  unique (employee_id, skill_id)
);
create index employee_skills_skill_idx on employee_skills(skill_id);

-- ---------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 200),
  description text,
  type task_type not null default 'operational',
  site_id uuid references sites(id),
  line_id uuid references lines(id),
  equipment text,
  priority task_priority not null default 'normal',
  owner_employee_id uuid references employees(id),
  supervisor_user_id uuid references users(id),
  reviewer_user_id uuid references users(id),
  due_at timestamptz,
  status task_status not null default 'new',
  blocked_reason text,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  closed_at timestamptz,
  closed_by uuid references users(id),
  requires_review boolean not null default false,
  reviewed_at timestamptz,
  recurrence recurrence_kind not null default 'none',
  recurrence_parent_id uuid references tasks(id),
  last_spawned_at timestamptz,
  handover_item_id uuid,
  initiative_id uuid,
  development_plan_id uuid,
  sap_notification_no text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check (status <> 'waiting_other_party' or coalesce(length(trim(blocked_reason)),0) > 0)
);
create index tasks_site_idx on tasks(site_id);
create index tasks_owner_idx on tasks(owner_employee_id);
create index tasks_status_idx on tasks(status);
create index tasks_due_idx on tasks(due_at);
create index tasks_title_trgm on tasks using gin (title gin_trgm_ops);

create table task_assignees (
  task_id uuid not null references tasks(id) on delete cascade,
  employee_id uuid not null references employees(id),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (task_id, employee_id)
);
create index task_assignees_emp_idx on task_assignees(employee_id);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid references users(id) default app.uid(),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on task_comments(task_id);

create table task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  event_type text not null,
  from_status task_status,
  to_status task_status,
  note text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index task_events_task_idx on task_events(task_id);

-- Generic attachments (files on server disk; access via entity RLS)
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('task','employee','employee_skill','handover','leave','plan','enrollment','idea','review')),
  entity_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid default app.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz, archived_by uuid
);
create index attachments_entity_idx on attachments(entity_type, entity_id);

-- task_attachments as required by the spec (view on generic table)
create view task_attachments with (security_invoker = true) as
  select id, entity_id as task_id, file_name, storage_path, mime_type, size_bytes, uploaded_by, created_at
  from attachments where entity_type = 'task' and archived_at is null;

-- ---------------------------------------------------------------------
-- Shift handover
-- ---------------------------------------------------------------------
create table shift_handover_reports (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  line_id uuid references lines(id),
  shift_id uuid references shifts(id),
  handover_at timestamptz not null default now(),
  outgoing_employee_id uuid references employees(id),
  incoming_employee_id uuid references employees(id),
  systems_status text,
  general_notes text,
  next_shift_instructions text,
  outgoing_confirmed_at timestamptz,
  incoming_confirmed_at timestamptz,
  status handover_status not null default 'draft',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);
create index handover_site_idx on shift_handover_reports(site_id, handover_at desc);

create table handover_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references shift_handover_reports(id) on delete cascade,
  kind handover_item_kind not null default 'followup',
  description text not null check (length(trim(description)) between 2 and 2000),
  event_time timestamptz,
  reference_no text,
  status open_closed not null default 'open',
  linked_task_id uuid references tasks(id),
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index handover_items_report_idx on handover_items(report_id);
create index handover_items_open_idx on handover_items(status) where status = 'open';

alter table tasks add constraint tasks_handover_item_fk foreign key (handover_item_id) references handover_items(id);

-- ---------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------
create table leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  code text,
  max_days_per_year int,
  requires_attachment boolean not null default false,
  color text not null default '#0e7490',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  leave_type_id uuid not null references leave_types(id),
  start_date date not null,
  end_date date not null,
  notes text,
  status leave_status not null default 'draft',
  recommendation_note text,
  recommended_by uuid references users(id),
  recommended_at timestamptz,
  decision_reason text,
  decided_by uuid references users(id),
  decided_at timestamptz,
  coverage_override boolean not null default false,
  override_reason text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check (end_date >= start_date),
  check (end_date - start_date <= 365)
);
create index leave_requests_emp_idx on leave_requests(employee_id);
create index leave_requests_dates_idx on leave_requests(start_date, end_date);
create index leave_requests_status_idx on leave_requests(status);

create table leave_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references leave_requests(id) on delete cascade,
  from_status leave_status,
  to_status leave_status,
  note text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index leave_request_events_req_idx on leave_request_events(request_id);

-- ---------------------------------------------------------------------
-- Development & training
-- ---------------------------------------------------------------------
create table training_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 200),
  provider text,
  start_date date,
  end_date date,
  location text,
  skill_ids uuid[] not null default '{}',
  description text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table training_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references training_courses(id),
  employee_id uuid not null references employees(id),
  status enrollment_status not null default 'nominated',
  result text,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  unique (course_id, employee_id)
);
create index training_enrollments_emp_idx on training_enrollments(employee_id);

create table development_plans (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  goal text not null check (length(trim(goal)) between 3 and 500),
  target_skill_id uuid references skills(id),
  method plan_method not null default 'on_job',
  mentor_employee_id uuid references employees(id),
  course_id uuid references training_courses(id),
  start_date date,
  end_date date,
  status plan_status not null default 'planned',
  progress int not null default 0 check (progress between 0 and 100),
  practical_result text,
  level_before int check (level_before between 1 and 4),
  level_after int check (level_after between 1 and 4),
  employee_comment text,
  supervisor_comment text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index development_plans_emp_idx on development_plans(employee_id);

-- ---------------------------------------------------------------------
-- Improvement ideas / initiatives
-- ---------------------------------------------------------------------
create table improvement_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 200),
  problem text,
  proposal text,
  kind text not null default 'idea' check (kind in ('idea','initiative','extra_skill')),
  submitted_by_employee_id uuid references employees(id),
  site_id uuid references sites(id),
  status idea_status not null default 'submitted',
  owner_employee_id uuid references employees(id),
  outcome text,
  linked_task_id uuid references tasks(id),
  linked_plan_id uuid references development_plans(id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);
create index improvement_ideas_site_idx on improvement_ideas(site_id);
create index improvement_ideas_submitter_idx on improvement_ideas(submitted_by_employee_id);

create table idea_participants (
  idea_id uuid not null references improvement_ideas(id) on delete cascade,
  employee_id uuid not null references employees(id),
  role text,
  primary key (idea_id, employee_id)
);

alter table tasks add constraint tasks_initiative_fk foreign key (initiative_id) references improvement_ideas(id);
alter table tasks add constraint tasks_plan_fk foreign key (development_plan_id) references development_plans(id);

-- ---------------------------------------------------------------------
-- Performance reviews
-- ---------------------------------------------------------------------
create table review_criteria (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 200),
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);

create table rating_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  value int not null,
  sort_order int not null default 0,
  color text not null default '#0e7490',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);

create table performance_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  period_start date not null,
  period_end date not null,
  reviewer_id uuid references users(id),
  status review_status not null default 'draft',
  overall_rating_level_id uuid references rating_levels(id),
  external_delay_notes text,
  employee_comment text,
  supervisor_comment text,
  next_development_step text,
  submitted_at timestamptz,
  acknowledged_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid,
  check (period_end >= period_start)
);
create index performance_reviews_emp_idx on performance_reviews(employee_id);

create table performance_review_scores (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references performance_reviews(id) on delete cascade,
  criterion_id uuid not null references review_criteria(id),
  rating_level_id uuid references rating_levels(id),
  comment text,
  unique (review_id, criterion_id)
);

-- ---------------------------------------------------------------------
-- Notifications, integrations, audit, settings
-- ---------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at, created_at desc);
create unique index notifications_dedupe_idx on notifications(user_id, dedupe_key) where dedupe_key is not null;

create table integration_configs (
  id uuid primary key default gen_random_uuid(),
  kind integration_kind not null unique,
  status integration_status not null default 'not_configured',
  enabled boolean not null default false,
  last_checked_at timestamptz,
  last_error text,
  settings jsonb not null default '{}'::jsonb, -- non-secret settings only; secrets live in server env vars
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table integration_records (
  id uuid primary key default gen_random_uuid(),
  kind integration_kind not null,
  entity_type text not null check (entity_type in ('task','handover_item','handover','idea')),
  entity_id uuid not null,
  external_ref text not null check (length(trim(external_ref)) between 1 and 100),
  external_url text check (external_url is null or external_url ~* '^https?://'),
  event_time timestamptz,
  source text,
  sync_status text not null default 'manual' check (sync_status in ('manual','pending','synced','failed')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, archived_at timestamptz, archived_by uuid
);
create index integration_records_entity_idx on integration_records(entity_type, entity_id);

create table audit_logs (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_table_idx on audit_logs(table_name, record_id);
create index audit_logs_created_idx on audit_logs(created_at desc);
create index audit_logs_actor_idx on audit_logs(actor_id);

create table system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- touch triggers
do $$
declare t text;
begin
  foreach t in array array['departments','sites','lines','shifts','employees','employee_private','users','shift_assignments',
    'site_coverage_rules','skill_domains','skills','employee_skills','tasks','shift_handover_reports','handover_items',
    'leave_types','leave_requests','training_courses','training_enrollments','development_plans','improvement_ideas',
    'review_criteria','rating_levels','performance_reviews','integration_configs','integration_records'] loop
    execute format('create trigger trg_%s_touch before insert or update on %I for each row execute function app.touch_row()', t, t);
  end loop;
end $$;
