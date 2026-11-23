-- =====================================================================
-- البيانات الأساسية (ليست تجريبية): الأدوار والصلاحيات والإعدادات وقوائم الاختيار
-- =====================================================================
insert into roles(key, name, description) values
  ('system_admin', 'مدير النظام', 'إدارة المستخدمين والأدوار والإعدادات والمواقع وقوائم الاختيار والاطلاع على كل البيانات'),
  ('operations_manager', 'مدير التشغيل', 'الاطلاع على كل المواقع ومراجعة المؤشرات واعتماد الطلبات حسب الصلاحية'),
  ('site_supervisor', 'مشرف الموقع', 'إدارة مهام وموظفي المواقع المسندة إليه ومراجعة الإجازات والتقييمات'),
  ('employee', 'موظف', 'الاطلاع على ملفه ومهامه وورديته وتقديم الطلبات والمقترحات'),
  ('report_viewer', 'قارئ التقارير', 'عرض التقارير والمؤشرات فقط دون تعديل');

insert into permissions(key, name, category) values
  ('settings.manage', 'إدارة الإعدادات وقوائم الاختيار', 'الإدارة'),
  ('users.manage', 'إدارة المستخدمين والأدوار والصلاحيات', 'الإدارة'),
  ('sites.manage', 'إدارة المواقع والخطوط', 'الإدارة'),
  ('shifts.manage', 'إدارة الورديات والتغطية والإسناد', 'الفريق'),
  ('employees.manage', 'إضافة وتعديل بيانات الموظفين', 'الفريق'),
  ('employees.view_private', 'عرض بيانات الاتصال والملاحظات الإدارية', 'الفريق'),
  ('tasks.create', 'إنشاء المهام', 'التشغيل'),
  ('tasks.manage', 'إدارة المهام وتوزيعها', 'التشغيل'),
  ('leave.recommend', 'رفع توصية على طلب الإجازة', 'التشغيل'),
  ('leave.approve', 'اعتماد أو رفض طلبات الإجازة', 'التشغيل'),
  ('leave.override_coverage', 'تجاوز تحذير التغطية مع توثيق السبب', 'التشغيل'),
  ('skills.manage', 'إدارة مكتبة المهارات', 'التمكين'),
  ('skills.assess', 'تقييم مستوى مهارات الموظفين', 'التمكين'),
  ('training.manage', 'إدارة الدورات وخطط التطوير', 'التمكين'),
  ('ideas.manage', 'إدارة المبادرات والتحسينات', 'التمكين'),
  ('reviews.manage', 'إعداد تقييمات الأداء', 'التمكين'),
  ('reports.view', 'عرض التقارير', 'المتابعة'),
  ('reports.export', 'تصدير التقارير', 'المتابعة'),
  ('audit.view', 'عرض سجل التدقيق', 'المتابعة'),
  ('integrations.manage', 'إدارة إعدادات التكاملات', 'الإدارة');

-- default matrix (editable from the UI)
insert into role_permissions(role_id, permission_id)
select r.id, p.id from roles r join permissions p on (
  r.key = 'system_admin'
  or (r.key = 'operations_manager' and p.key in ('shifts.manage','employees.manage','employees.view_private','tasks.create','tasks.manage',
        'leave.recommend','leave.approve','leave.override_coverage','skills.assess','training.manage','ideas.manage','reviews.manage',
        'reports.view','reports.export','audit.view'))
  or (r.key = 'site_supervisor' and p.key in ('employees.view_private','tasks.create','tasks.manage','leave.recommend','leave.approve',
        'skills.assess','training.manage','ideas.manage','reviews.manage','reports.view','reports.export','shifts.manage'))
  or (r.key = 'employee' and p.key in ('tasks.create'))
  or (r.key = 'report_viewer' and p.key in ('reports.view','reports.export'))
);
-- employees can create tasks only on their own site (RLS: can_manage_site) → effectively none unless supervisor; keep explicit
delete from role_permissions where role_id = (select id from roles where key = 'employee')
  and permission_id = (select id from permissions where key = 'tasks.create');

insert into system_settings(key, value) values
  ('platform_name', '"منظومة إدارة وتمكين فريق التشغيل"'),
  ('platform_name_en', '"Operations Workforce Management & Development Platform"'),
  ('logo_path', 'null'),
  ('org_name', '""'),
  ('org_info', '{"address": "", "phone": "", "email": "", "website": ""}'),
  ('default_timezone', '"Asia/Riyadh"'),
  ('default_language', '"ar"'),
  ('qualified_level', '3');

insert into rating_levels(name, value, sort_order, color) values
  ('يحتاج إلى تحسين', 1, 1, '#b45309'),
  ('جيد', 2, 2, '#0369a1'),
  ('جيد جدًا', 3, 3, '#0f766e'),
  ('متميز', 4, 4, '#15803d');

insert into review_criteria(name, sort_order) values
  ('الالتزام بالإجراءات والسلامة', 1),
  ('دقة التسجيل والقراءات والتوثيق', 2),
  ('جودة تسليم واستلام الوردية', 3),
  ('متابعة المهام حتى الإغلاق', 4),
  ('التعاون والتواصل', 5),
  ('تطور المهارات', 6),
  ('المشاركة في التحسينات', 7),
  ('الالتزام بالجدول وفق الأنظمة الداخلية', 8);

insert into leave_types(name, code, max_days_per_year, requires_attachment, color) values
  ('إجازة اعتيادية', 'ANNUAL', 30, false, '#0e7490'),
  ('إجازة مرضية', 'SICK', null, true, '#b91c1c'),
  ('إجازة اضطرارية', 'EMERG', 5, false, '#b45309'),
  ('إجازة بدون راتب', 'UNPAID', null, false, '#64748b'),
  ('مهمة رسمية / تدريب خارجي', 'DUTY', null, false, '#4338ca');

insert into integration_configs(kind, status, settings) values
  ('sap_pm', 'not_configured', '{"base_url": "", "system_id": "", "notes": "حفظ رقم البلاغ أو أمر العمل ورابطه يدويًا متاح الآن، والمزامنة تحتاج إعدادًا معتمدًا"}'),
  ('scada', 'not_configured', '{"mode": "manual_log", "notes": "تسجيل رقم الإنذار أو الحدث يدويًا للقراءة فقط. لا يوجد أي أمر تحكم من المنصة."}'),
  ('email', 'not_configured', '{"from_address": "", "notes": "يتطلب إعداد خادم SMTP في متغيرات البيئة على الخادم"}'),
  ('whatsapp', 'not_configured', '{"notes": "يتطلب حساب WhatsApp Business API معتمد"}');
