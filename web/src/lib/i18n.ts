// UI dictionary. Arabic is the active language; add an `en` object with the same keys
// and switch `current` to enable English later without touching components.
const ar = {
  enums: {
    app_role: { system_admin: 'مدير النظام', operations_manager: 'مدير التشغيل', site_supervisor: 'مشرف الموقع', employee: 'موظف', report_viewer: 'قارئ التقارير' },
    site_type: { system: 'منظومة نقل', pumping_station: 'محطة ضخ', line: 'خطوط', terminal_station: 'محطة طرفية', control_room: 'غرفة تحكم', strategic_tank: 'خزانات استراتيجية', emergency_tank: 'خزانات طوارئ', other: 'أخرى' },
    employee_status: { active: 'على رأس العمل', on_leave: 'في إجازة', suspended: 'موقوف', resigned: 'منتهية خدمته' },
    skill_criticality: { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' },
    skill_level: { 1: 'يحتاج إلى تدريب', 2: 'ينفذ بمساعدة', 3: 'ينفذ باستقلالية', 4: 'متمكن ويمكنه تدريب الآخرين' } as Record<number, string>,
    skill_source: { assessment: 'تقييم مشرف', self_reported: 'إفادة ذاتية (غير معتمدة)' },
    task_type: { periodic: 'دورية', operational: 'تشغيلية', observation_followup: 'متابعة ملاحظة', improvement: 'تطوير وتحسين', training: 'تدريب', administrative: 'إدارية', interdept_followup: 'متابعة مع قسم آخر' },
    task_priority: { low: 'منخفضة', normal: 'عادية', high: 'عالية', critical: 'حرجة' },
    task_status: { new: 'جديدة', assigned: 'مسندة', in_progress: 'قيد التنفيذ', waiting_other_party: 'بانتظار جهة أخرى', completed: 'مكتملة', cancelled: 'ملغاة' },
    recurrence_kind: { none: 'غير متكررة', daily: 'يومية', weekly: 'أسبوعية', monthly: 'شهرية' },
    handover_status: { draft: 'مسودة', submitted: 'مُسلّمة بانتظار الاستلام', acknowledged: 'مستلمة' },
    handover_item_kind: { open_task: 'مهمة مفتوحة/معلقة', alarm_event: 'إنذار أو حدث', out_of_service: 'معدة/نظام خارج الخدمة', work_order: 'بلاغ أو أمر عمل', followup: 'تعليمات متابعة', note: 'ملاحظة' },
    open_closed: { open: 'مفتوحة', closed: 'مغلقة' },
    leave_status: { draft: 'مسودة', submitted: 'مقدم', pending_review: 'بانتظار مراجعة', recommended: 'موصى به', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغي' },
    plan_method: { on_job: 'تدريب عملي', course: 'دورة', mentoring: 'توجيه من موظف متمكن', task_participation: 'مشاركة في مهمة', procedure_study: 'دراسة إجراء' },
    plan_status: { planned: 'مخطط', in_progress: 'جارٍ', awaiting_practical: 'بانتظار تقييم عملي', completed: 'مكتمل', overdue: 'متأخر' },
    enrollment_status: { nominated: 'مرشح', attended: 'حضر', absent: 'لم يحضر', completed: 'أتم الدورة' },
    idea_status: { submitted: 'مقدمة', under_review: 'قيد الدراسة', approved: 'معتمدة', in_progress: 'قيد التنفيذ', implemented: 'منفذة', rejected: 'غير معتمدة' },
    idea_kind: { idea: 'فكرة تحسين', initiative: 'مبادرة', extra_skill: 'مهارة إضافية' },
    review_status: { draft: 'مسودة', submitted: 'مرسل للموظف', acknowledged: 'اطلع عليه الموظف' },
    integration_kind: { sap_pm: 'SAP PM', scada: 'SCADA', email: 'البريد الإلكتروني', whatsapp: 'WhatsApp' },
    integration_status: { not_configured: 'غير مهيأ', configured: 'مهيأ', connected: 'متصل', last_failed: 'فشل آخر اتصال' },
    capabilities: { reports: 'التقارير', data: 'البيانات والتحليل', training: 'التدريب ونقل المعرفة', coordination: 'التنسيق', problem_solving: 'حل المشكلات' },
    weekday: { 0: 'الأحد', 1: 'الإثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' } as Record<number, string>,
    rotation_status: { pending: 'بانتظار الاعتماد', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغي' },
    transfer_kind: { permanent: 'دائم', temporary: 'مؤقت' },
    coverage_method: { overtime: 'عمل إضافي', day_compensation: 'تعويض أيام' },
    overtime_cause: { coverage: 'تغطية زميل', breakdown: 'عطل', pipe_burst: 'انكسار خط', emergency: 'طارئ تشغيلي', planned_work: 'أعمال مجدولة', other: 'أخرى' },
    shift_kind: { D: 'نهاري', N: 'ليلي', O: 'راحة' },
    annual_leave_days: { 30: '30 يومًا', 33: '33 يومًا' } as Record<number, string>,
    audit_action: { insert: 'إضافة', update: 'تعديل', delete: 'حذف', archive: 'أرشفة', restore: 'استعادة', coverage_override: 'تجاوز تحذير التغطية' },
  },
  tables: {
    departments: 'الإدارات والأقسام', sites: 'المواقع', lines: 'الخطوط', shifts: 'الورديات', employees: 'الموظفون', employee_private: 'بيانات الاتصال',
    users: 'المستخدمون', user_roles: 'أدوار المستخدمين', supervisor_sites: 'مواقع المشرفين', role_permissions: 'صلاحيات الأدوار',
    shift_assignments: 'إسناد الورديات', site_coverage_rules: 'قواعد التغطية', skill_domains: 'مجالات المهارات', skills: 'المهارات',
    employee_skills: 'مهارات الموظفين', tasks: 'المهام', task_assignees: 'المشاركون في المهام', attachments: 'المرفقات',
    shift_handover_reports: 'تسليم الورديات', handover_items: 'بنود التسليم', leave_types: 'أنواع الإجازات', leave_requests: 'طلبات الإجازة',
    training_courses: 'الدورات', training_enrollments: 'المرشحون للدورات', development_plans: 'خطط التطوير', improvement_ideas: 'المبادرات والتحسينات',
    review_criteria: 'معايير التقييم', rating_levels: 'مستويات التقييم', performance_reviews: 'تقييمات الأداء', performance_review_scores: 'درجات التقييم',
    shift_groups: 'مجموعات المناوبة', shift_swaps: 'تبديل الورديات', group_transfers: 'نقل الموظفين بين المجموعات',
    coverage_requests: 'طلبات التغطية', overtime_entries: 'العمل الإضافي', leave_balances: 'أرصدة الإجازة السنوية',
    integration_configs: 'إعدادات التكامل', integration_records: 'سجلات التكامل', system_settings: 'إعدادات النظام',
  } as Record<string, string>,
};

export type Dict = typeof ar;
const current: Dict = ar;
export const t = current;

export function label(group: keyof Dict['enums'], key: string | number | null | undefined): string {
  if (key === null || key === undefined || key === '') return '—';
  return ((current.enums[group] as Record<string, string>)[String(key)] ?? String(key));
}
export function options(group: keyof Dict['enums']) {
  return Object.entries(current.enums[group] as Record<string, string>).map(([value, l]) => ({ value, label: l }));
}
