/**
 * Resource registry for the generic CRUD API.
 * Security is enforced by PostgreSQL RLS (every query runs as app_user);
 * this registry only whitelists tables/columns and shapes queries.
 *
 *  table     – base table for insert/update/archive
 *  view      – relation used for reads (security_invoker view or table)
 *  write     – columns a client may set
 *  search    – columns searched with ILIKE
 *  filters   – columns allowed as equality / range filters
 *  sort      – sortable columns
 *  archivable – soft delete via archived_at
 */
export const resources = {
  departments: { table: 'departments', write: ['name', 'code', 'description'], search: ['name', 'code'], sort: ['name', 'created_at'], defaultSort: 'name', archivable: true },
  sites: {
    table: 'sites', view: 'v_sites',
    write: ['name', 'code', 'type', 'parent_site_id', 'region', 'description', 'active'],
    search: ['name', 'code', 'region'], filters: ['type', 'parent_site_id', 'active', 'id'],
    sort: ['name', 'code', 'type', 'employees_count', 'created_at'], defaultSort: 'code', archivable: true,
  },
  lines: { table: 'lines', view: 'v_lines', write: ['name', 'code', 'site_id', 'description'], search: ['name', 'code'], filters: ['site_id'], sort: ['name', 'code'], defaultSort: 'code', archivable: true },
  shifts: {
    table: 'shifts', view: 'v_shifts', write: ['name', 'code', 'site_id', 'start_time', 'end_time', 'work_days', 'color'],
    search: ['name', 'code', 'site_name'], filters: ['site_id'], sort: ['site_name', 'start_time', 'name'], defaultSort: 'site_name', archivable: true,
  },
  coverage_rules: {
    table: 'site_coverage_rules', view: 'v_coverage_rules', write: ['site_id', 'shift_id', 'min_staff', 'required_skill_ids', 'notes'],
    search: ['site_name', 'shift_name'], filters: ['site_id', 'shift_id'], sort: ['site_name', 'shift_name', 'min_staff'], defaultSort: 'site_name', archivable: true,
  },
  shift_assignments: {
    table: 'shift_assignments', view: 'v_shift_assignments', write: ['employee_id', 'site_id', 'shift_id', 'line_id', 'start_date', 'end_date', 'notes'],
    search: ['employee_name', 'employee_number', 'site_name', 'shift_name'], filters: ['site_id', 'shift_id', 'employee_id'],
    sort: ['start_date', 'employee_name', 'site_name'], defaultSort: '-start_date', archivable: true,
  },
  employees: {
    table: 'employees', view: 'v_employees',
    write: ['employee_number', 'full_name', 'job_title', 'department_id', 'primary_site_id', 'line_id', 'shift_id', 'manager_id', 'hire_date',
      'status', 'qualifications', 'certifications', 'previous_experience', 'strengths', 'interests', 'desired_skills', 'capabilities',
      'specialization_wishes', 'supervisor_recommendation', 'group_id', 'annual_leave_days', 'manager_text'],
    search: ['full_name', 'employee_number', 'site_name', 'job_title'], filters: ['primary_site_id', 'shift_id', 'line_id', 'status', 'department_id', 'id', 'is_demo', 'group_id'],
    sort: ['full_name', 'employee_number', 'site_name', 'shift_name', 'hire_date', 'status', 'group_code'], defaultSort: 'employee_number', archivable: true,
  },
  employee_private: { table: 'employee_private', key: 'employee_id', write: ['employee_id', 'phone', 'email', 'admin_notes'], filters: ['employee_id'], sort: ['employee_id'], defaultSort: 'employee_id' },
  employee_directory: { view: 'employee_directory', readOnly: true, search: ['full_name', 'employee_number'], filters: ['primary_site_id', 'shift_id', 'status', 'id', 'group_id'], sort: ['full_name', 'employee_number'], defaultSort: 'full_name' },
  user_directory: { view: 'user_directory', readOnly: true, search: ['full_name'], filters: ['id', 'employee_id'], sort: ['full_name'], defaultSort: 'full_name' },
  skill_domains: { table: 'skill_domains', write: ['name', 'description', 'sort_order'], search: ['name'], sort: ['sort_order', 'name'], defaultSort: 'sort_order', archivable: true },
  skills: {
    table: 'skills', view: 'v_skills',
    write: ['name', 'domain_id', 'applicable_site_types', 'applicable_site_ids', 'criticality', 'is_core', 'training_requirements', 'proof_requirements', 'reassess_months'],
    search: ['name', 'domain_name'], filters: ['domain_id', 'is_core', 'criticality'], sort: ['name', 'domain_order', 'criticality'], defaultSort: 'domain_order', archivable: true,
  },
  employee_skills: {
    table: 'employee_skills', view: 'v_employee_skills',
    write: ['employee_id', 'skill_id', 'level', 'assessed_at', 'assessor_id', 'notes', 'next_reassess_at', 'source'],
    search: ['employee_name', 'skill_name', 'employee_number'], filters: ['employee_id', 'skill_id', 'site_id', 'level', 'domain_id', 'source', 'is_core', 'next_reassess_at'],
    sort: ['employee_name', 'skill_name', 'level', 'assessed_at', 'next_reassess_at'], defaultSort: 'employee_name', archivable: true,
  },
  tasks: {
    table: 'tasks', view: 'v_tasks',
    write: ['title', 'description', 'type', 'site_id', 'line_id', 'equipment', 'priority', 'owner_employee_id', 'supervisor_user_id', 'reviewer_user_id',
      'due_at', 'status', 'blocked_reason', 'checklist', 'requires_review', 'reviewed_at', 'recurrence', 'sap_notification_no', 'initiative_id', 'development_plan_id'],
    search: ['title', 'description', 'owner_name', 'equipment', 'sap_notification_no'],
    filters: ['status', 'priority', 'type', 'site_id', 'line_id', 'owner_employee_id', 'is_overdue', 'recurrence', 'initiative_id', 'development_plan_id', 'recurrence_parent_id', 'due_at', 'created_at', 'closed_at'],
    sort: ['due_at', 'created_at', 'priority', 'status', 'title', 'site_name', 'updated_at', 'closed_at'], defaultSort: '-created_at', archivable: true,
  },
  task_comments: { table: 'task_comments', view: 'v_task_comments', write: ['task_id', 'body'], filters: ['task_id'], sort: ['created_at'], defaultSort: 'created_at', noUpdate: true },
  task_events: { view: 'v_task_events', readOnly: true, filters: ['task_id'], sort: ['created_at'], defaultSort: '-created_at' },
  task_assignees: { table: 'task_assignees', view: 'v_task_assignees', write: ['task_id', 'employee_id'], filters: ['task_id', 'employee_id'], sort: ['employee_name'], defaultSort: 'employee_name', compositeKey: ['task_id', 'employee_id'], deletable: true },
  attachments: { table: 'attachments', view: 'v_attachments', write: [], filters: ['entity_type', 'entity_id'], sort: ['created_at'], defaultSort: '-created_at', archivable: true, noInsert: true },
  handover_reports: {
    table: 'shift_handover_reports', view: 'v_handover_reports',
    write: ['site_id', 'line_id', 'shift_id', 'handover_at', 'outgoing_employee_id', 'incoming_employee_id', 'systems_status', 'general_notes', 'next_shift_instructions', 'status'],
    search: ['site_name', 'outgoing_name', 'incoming_name', 'general_notes', 'systems_status'], filters: ['site_id', 'shift_id', 'line_id', 'status', 'handover_at', 'incoming_employee_id', 'outgoing_employee_id'],
    sort: ['handover_at', 'site_name', 'open_items'], defaultSort: '-handover_at', archivable: true,
  },
  handover_items: {
    table: 'handover_items', view: 'v_handover_items', write: ['report_id', 'kind', 'description', 'event_time', 'reference_no', 'status'],
    search: ['description', 'reference_no', 'site_name'], filters: ['report_id', 'status', 'kind', 'site_id', 'handover_at', 'shift_id'], sort: ['created_at', 'event_time', 'handover_at'], defaultSort: 'created_at',
  },
  leave_types: { table: 'leave_types', write: ['name', 'code', 'max_days_per_year', 'requires_attachment', 'color'], search: ['name'], sort: ['name'], defaultSort: 'name', archivable: true },
  leave_requests: {
    table: 'leave_requests', view: 'v_leave_requests', write: ['employee_id', 'leave_type_id', 'start_date', 'end_date', 'notes', 'status'],
    search: ['employee_name', 'employee_number', 'site_name', 'leave_type_name'], filters: ['status', 'employee_id', 'site_id', 'leave_type_id', 'shift_id', 'id', 'coverage_override', 'start_date', 'end_date'],
    sort: ['start_date', 'created_at', 'employee_name', 'status'], defaultSort: '-created_at', archivable: true,
  },
  leave_events: { view: 'v_leave_events', readOnly: true, filters: ['request_id'], sort: ['created_at'], defaultSort: 'created_at' },
  training_courses: {
    table: 'training_courses', view: 'v_training_courses', write: ['name', 'provider', 'start_date', 'end_date', 'location', 'skill_ids', 'description'],
    search: ['name', 'provider', 'location'], sort: ['start_date', 'name'], defaultSort: '-start_date', archivable: true,
  },
  training_enrollments: {
    table: 'training_enrollments', view: 'v_training_enrollments', write: ['course_id', 'employee_id', 'status', 'result', 'notes'],
    search: ['employee_name', 'course_name'], filters: ['course_id', 'employee_id', 'status', 'site_id'], sort: ['employee_name', 'start_date', 'status'], defaultSort: 'employee_name', archivable: true,
  },
  development_plans: {
    table: 'development_plans', view: 'v_development_plans',
    write: ['employee_id', 'goal', 'target_skill_id', 'method', 'mentor_employee_id', 'course_id', 'start_date', 'end_date', 'status', 'progress',
      'practical_result', 'level_before', 'level_after', 'supervisor_comment'],
    search: ['employee_name', 'goal', 'target_skill_name'], filters: ['employee_id', 'status', 'site_id', 'method', 'target_skill_id', 'is_late', 'mentor_employee_id'],
    sort: ['end_date', 'start_date', 'employee_name', 'progress', 'status'], defaultSort: 'end_date', archivable: true,
  },
  ideas: {
    table: 'improvement_ideas', view: 'v_ideas',
    write: ['title', 'problem', 'proposal', 'kind', 'submitted_by_employee_id', 'site_id', 'status', 'owner_employee_id', 'outcome', 'linked_task_id', 'linked_plan_id'],
    search: ['title', 'problem', 'proposal', 'submitted_by_name'], filters: ['status', 'site_id', 'kind', 'submitted_by_employee_id', 'owner_employee_id', 'id'],
    sort: ['created_at', 'title', 'status'], defaultSort: '-created_at', archivable: true,
  },
  idea_participants: { table: 'idea_participants', write: ['idea_id', 'employee_id', 'role'], filters: ['idea_id', 'employee_id'], sort: ['employee_id'], defaultSort: 'employee_id', compositeKey: ['idea_id', 'employee_id'], deletable: true },
  review_criteria: { table: 'review_criteria', write: ['name', 'description', 'sort_order', 'active'], search: ['name'], sort: ['sort_order', 'name'], defaultSort: 'sort_order', archivable: true },
  rating_levels: { table: 'rating_levels', write: ['name', 'value', 'sort_order', 'color'], search: ['name'], sort: ['sort_order'], defaultSort: 'sort_order', archivable: true },
  reviews: {
    table: 'performance_reviews', view: 'v_reviews',
    write: ['employee_id', 'period_start', 'period_end', 'reviewer_id', 'status', 'overall_rating_level_id', 'external_delay_notes', 'supervisor_comment', 'next_development_step'],
    search: ['employee_name', 'employee_number'], filters: ['employee_id', 'status', 'site_id', 'id'], sort: ['period_end', 'employee_name', 'status'], defaultSort: '-period_end', archivable: true,
  },
  review_scores: { table: 'performance_review_scores', view: 'v_review_scores', write: ['review_id', 'criterion_id', 'rating_level_id', 'comment'], filters: ['review_id'], sort: ['sort_order'], defaultSort: 'sort_order' },
  notifications: { table: 'notifications', write: ['read_at'], search: ['title', 'body'], filters: ['type', 'unread'], sort: ['created_at'], defaultSort: '-created_at', noInsert: true },
  users: { table: 'users', view: 'v_users', write: ['full_name', 'employee_id', 'is_active'], noInsert: true, archivable: true, search: ['full_name', 'email', 'employee_name'], filters: ['is_active', 'id'], sort: ['full_name', 'email', 'created_at', 'last_login_at'], defaultSort: 'full_name' },
  roles: { view: 'roles', readOnly: true, sort: ['key'], defaultSort: 'key' },
  permissions: { view: 'permissions', readOnly: true, sort: ['category', 'key'], defaultSort: 'category' },
  role_permissions: { table: 'role_permissions', write: ['role_id', 'permission_id'], filters: ['role_id'], sort: ['role_id'], defaultSort: 'role_id', compositeKey: ['role_id', 'permission_id'], deletable: true },
  supervisor_sites: { table: 'supervisor_sites', write: ['user_id', 'site_id'], filters: ['user_id', 'site_id'], sort: ['user_id'], defaultSort: 'user_id', compositeKey: ['user_id', 'site_id'], deletable: true },
  user_roles: { table: 'user_roles', write: ['user_id', 'role'], filters: ['user_id', 'role'], sort: ['user_id'], defaultSort: 'user_id', compositeKey: ['user_id', 'role'], deletable: true },
  integration_configs: { table: 'integration_configs', write: ['enabled', 'settings'], sort: ['kind'], defaultSort: 'kind', noInsert: true },
  integration_records: {
    table: 'integration_records', view: 'v_integration_records',
    write: ['kind', 'entity_type', 'entity_id', 'external_ref', 'external_url', 'event_time', 'source', 'notes'],
    search: ['external_ref', 'source', 'notes'], filters: ['kind', 'entity_type', 'entity_id', 'sync_status'], sort: ['created_at', 'event_time'], defaultSort: '-created_at', archivable: true,
  },
  audit_logs: { view: 'v_audit_logs', readOnly: true, search: ['table_name', 'record_id', 'actor_name', 'action', 'reason'], filters: ['table_name', 'action', 'actor_id', 'record_id', 'created_at'], sort: ['created_at'], defaultSort: '-created_at' },
  system_settings: { table: 'system_settings', key: 'key', write: ['key', 'value'], sort: ['key'], defaultSort: 'key' },
  // ---- 12h rotation (groups A/B/C/D), swaps, coverage, transfers, overtime, leave balances
  shift_groups: {
    table: 'shift_groups', view: 'v_shift_groups', write: ['code', 'name', 'color', 'cycle_start_date', 'notes'],
    search: ['code', 'name'], sort: ['code', 'name'], defaultSort: 'code', archivable: true,
  },
  shift_swaps: {
    table: 'shift_swaps', view: 'v_shift_swaps', write: ['group_a_id', 'group_b_id', 'a_start', 'a_end', 'b_start', 'b_end', 'reason'],
    search: ['reason', 'group_a_code', 'group_b_code', 'created_by_name'], filters: ['status', 'group_a_id', 'group_b_id', 'a_start', 'id'],
    sort: ['a_start', 'created_at', 'status'], defaultSort: '-created_at', noUpdate: true,
  },
  group_transfers: {
    table: 'group_transfers', view: 'v_group_transfers', write: ['employee_id', 'to_group_id', 'kind', 'start_date', 'end_date', 'reason'],
    search: ['employee_name', 'employee_number', 'reason'], filters: ['status', 'employee_id', 'kind', 'to_group_id', 'from_group_id', 'site_id', 'id'],
    sort: ['start_date', 'created_at', 'employee_name', 'status'], defaultSort: '-created_at', noUpdate: true,
  },
  coverage_requests: {
    table: 'coverage_requests', view: 'v_coverage_requests',
    write: ['work_date', 'shift_kind', 'group_id', 'absent_employee_id', 'covering_employee_id', 'method', 'hours', 'comp_days', 'comp_date', 'site_id', 'reason'],
    search: ['covering_name', 'absent_name', 'reason', 'site_name'], filters: ['status', 'method', 'covering_employee_id', 'absent_employee_id', 'work_date', 'site_id', 'group_id', 'id'],
    sort: ['work_date', 'created_at', 'covering_name', 'status'], defaultSort: '-work_date', noUpdate: true,
  },
  overtime_entries: {
    table: 'overtime_entries', view: 'v_overtime_entries', write: ['employee_id', 'work_date', 'hours', 'cause', 'site_id', 'description', 'reference_no'],
    search: ['employee_name', 'employee_number', 'description', 'reference_no', 'site_name'], filters: ['status', 'cause', 'employee_id', 'site_id', 'work_date', 'coverage_request_id', 'id'],
    sort: ['work_date', 'created_at', 'employee_name', 'hours', 'status'], defaultSort: '-work_date', noUpdate: true,
  },
  leave_balances: {
    table: 'leave_balances', view: 'v_leave_balances', write: ['employee_id', 'year', 'entitlement', 'carried_over', 'adjustment', 'notes'],
    search: ['employee_name', 'employee_number'], filters: ['employee_id', 'year'], sort: ['year', 'employee_name'], defaultSort: '-year',
  },
};
