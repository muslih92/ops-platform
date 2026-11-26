-- =====================================================================
-- بيانات تجريبية (DEMO) - أسماء وأرقام وهمية بالكامل، مميزة بـ is_demo = true
-- لا تحتوي أي بيانات شخصية حقيقية. يمكن حذفها/أرشفتها من الواجهة أو بتشغيل
--   update <table> set archived_at = now() where is_demo;
-- =====================================================================
do $$
#variable_conflict use_column
declare
  jr uuid; rq uuid; fg uuid; abc uuid; cr uuid; st uuid; et uuid;
  s record; sid uuid; i int; e uuid; d_ops uuid; d_ctrl uuid; d_maint uuid;
  dom uuid; k uuid; lvl int; sh uuid; emp_ids uuid[] := '{}'; site_ids uuid[];
  sh_day uuid; t uuid; rep uuid;
begin
  perform setseed(0.42);

  insert into departments(name, code, is_demo) values ('قسم التشغيل', 'OPS', true) returning id into d_ops;
  insert into departments(name, code, is_demo) values ('قسم غرف التحكم', 'CTRL', true) returning id into d_ctrl;
  insert into departments(name, code, is_demo) values ('قسم الخزانات', 'TNK', true) returning id into d_maint;

  -- ---------------- Sites ----------------
  insert into sites(name, code, type, region, is_demo, description) values ('منظومة JRWTS', 'JRWTS', 'system', 'المنطقة الشرقية - الرياض', true, 'منظومة نقل رئيسية (بيانات تجريبية)') returning id into jr;
  insert into sites(name, code, type, parent_site_id, is_demo) values ('خطوط F وG', 'FG', 'line', jr, true) returning id into fg;
  insert into sites(name, code, type, parent_site_id, is_demo) values ('خطوط AB وC', 'ABC', 'line', jr, true) returning id into abc;
  insert into lines(name, code, site_id, is_demo) values ('خط F', 'F', fg, true), ('خط G', 'G', fg, true), ('خط AB', 'AB', abc, true), ('خط C', 'C', abc, true);
  insert into sites(name, code, type, parent_site_id, is_demo) values
    ('محطة الضخ PS1', 'PS1', 'pumping_station', jr, true), ('محطة الضخ PS2', 'PS2', 'pumping_station', jr, true),
    ('محطة الضخ PS3', 'PS3', 'pumping_station', jr, true), ('محطة HPT', 'HPT', 'pumping_station', jr, true);
  insert into sites(name, code, type, region, is_demo, description) values ('منظومة RQWTS', 'RQWTS', 'system', 'القصيم', true, 'المحطات الطرفية (بيانات تجريبية)') returning id into rq;
  insert into sites(name, code, type, parent_site_id, region, is_demo) values
    ('محطة المجمعة الطرفية', 'RQ-MAJ', 'terminal_station', rq, 'المجمعة', true),
    ('محطة بريدة الطرفية', 'RQ-BUR', 'terminal_station', rq, 'بريدة', true),
    ('محطة الغنمان الطرفية', 'RQ-GHN', 'terminal_station', rq, 'الغنمان', true),
    ('محطة شقراء الطرفية', 'RQ-SHQ', 'terminal_station', rq, 'شقراء', true),
    ('محطة الغاط الطرفية', 'RQ-GHT', 'terminal_station', rq, 'الغاط', true),
    ('محطة الحسي الطرفية', 'RQ-HSY', 'terminal_station', rq, 'الحسي', true);
  insert into sites(name, code, type, is_demo) values ('غرف التحكم الرئيسية', 'MCR', 'control_room', true) returning id into cr;
  insert into sites(name, code, type, is_demo) values ('الخزانات الاستراتيجية', 'STK', 'strategic_tank', true) returning id into st;
  insert into sites(name, code, type, is_demo) values ('خزانات الطوارئ', 'ETK', 'emergency_tank', true) returning id into et;

  -- ---------------- Shifts (different patterns per site) ----------------
  insert into shifts(name, code, site_id, start_time, end_time, color, is_demo) values
    ('الصباحية', 'A', cr, '07:00', '15:00', '#0e7490', true),
    ('المسائية', 'B', cr, '15:00', '23:00', '#4338ca', true),
    ('الليلية', 'C', cr, '23:00', '07:00', '#334155', true);
  for s in select id, code from sites where type = 'pumping_station' or code in ('RQ-MAJ', 'RQ-BUR') loop
    insert into shifts(name, code, site_id, start_time, end_time, color, is_demo) values
      ('النهارية 12 ساعة', 'D12', s.id, '06:00', '18:00', '#0e7490', true),
      ('الليلية 12 ساعة', 'N12', s.id, '18:00', '06:00', '#334155', true);
  end loop;
  for s in select id from sites where code in ('RQ-GHN', 'RQ-SHQ', 'RQ-GHT', 'RQ-HSY', 'STK', 'ETK', 'FG', 'ABC') loop
    insert into shifts(name, code, site_id, start_time, end_time, work_days, color, is_demo) values
      ('الدوام النهاري', 'DAY', s.id, '07:00', '15:00', '{0,1,2,3,4}', '#0f766e', true);
  end loop;

  -- coverage rules
  insert into site_coverage_rules(site_id, shift_id, min_staff)
  select f.site_id, f.id, case when s.type = 'control_room' then 2 when s.type = 'pumping_station' then 2 else 1 end
  from shifts f join sites s on s.id = f.site_id where f.is_demo;

  -- ---------------- Skills ----------------
  insert into skill_domains(name, sort_order, is_demo) values ('تشغيل المضخات', 1, true) returning id into dom;
  insert into skills(name, domain_id, applicable_site_types, criticality, is_core, training_requirements, proof_requirements, reassess_months, is_demo) values
    ('تشغيل وإيقاف المضخات الرئيسية وفق الإجراء', dom, '{pumping_station,terminal_station}', 'critical', true, 'تدريب عملي 40 ساعة تحت إشراف موظف متمكن', 'تنفيذ عملي أمام المشرف 3 مرات', 12, true),
    ('مراقبة أداء المضخات والاهتزازات والحرارة', dom, '{pumping_station,terminal_station}', 'high', true, 'دراسة الإجراء وتدريب عملي', 'تقرير مراقبة معتمد', 12, true);
  insert into skill_domains(name, sort_order, is_demo) values ('أنظمة VSD', 2, true) returning id into dom;
  insert into skills(name, domain_id, applicable_site_types, criticality, is_core, reassess_months, is_demo) values
    ('تشغيل ومراقبة محركات السرعة المتغيرة VSD', dom, '{pumping_station}', 'high', true, 12, true);
  insert into skill_domains(name, sort_order, is_demo) values ('SCADA ومراقبة الإنذارات', 3, true) returning id into dom;
  insert into skills(name, domain_id, applicable_site_types, criticality, is_core, reassess_months, is_demo) values
    ('قراءة شاشات SCADA ومتابعة الاتجاهات', dom, '{control_room,pumping_station,terminal_station}', 'critical', true, 12, true),
    ('التعامل مع الإنذارات وتصنيفها وتوثيقها', dom, '{control_room,pumping_station,terminal_station}', 'critical', true, 12, true);
  insert into skill_domains(name, sort_order, is_demo) values ('تشغيل ومراقبة الخزانات', 4, true) returning id into dom;
  insert into skills(name, domain_id, applicable_site_types, criticality, is_core, reassess_months, is_demo) values
    ('مراقبة مناسيب الخزانات وتشغيل الصمامات يدويًا', dom, '{strategic_tank,emergency_tank,terminal_station}', 'critical', true, 12, true);
  insert into skill_domains(name, sort_order, is_demo) values ('غرف التحكم والاتصال بالمحطات', 5, true) returning id into dom;
  insert into skills(name, domain_id, applicable_site_types, criticality, is_core, reassess_months, is_demo) values
    ('التنسيق والاتصال مع المحطات أثناء التشغيل', dom, '{control_room}', 'critical', true, 12, true),
    ('إدارة سجل الأحداث في غرفة التحكم', dom, '{control_room}', 'medium', false, null, true);
  insert into skill_domains(name, sort_order, is_demo) values ('القراءات والتقارير التشغيلية', 6, true) returning id into dom;
  insert into skills(name, domain_id, criticality, is_core, is_demo) values
    ('تسجيل القراءات اليومية بدقة', dom, 'medium', false, true),
    ('إعداد التقارير التشغيلية الأسبوعية', dom, 'low', false, true);
  insert into skill_domains(name, sort_order, is_demo) values ('تسليم واستلام الوردية', 7, true) returning id into dom;
  insert into skills(name, domain_id, criticality, is_core, is_demo) values ('توثيق تسليم واستلام الوردية', dom, 'high', true, true);
  insert into skill_domains(name, sort_order, is_demo) values ('إجراءات الطوارئ', 8, true) returning id into dom;
  insert into skills(name, domain_id, criticality, is_core, reassess_months, is_demo) values ('تطبيق خطة الاستجابة للطوارئ', dom, 'critical', true, 6, true);
  insert into skill_domains(name, sort_order, is_demo) values ('السلامة وتصاريح العمل والعزل', 9, true) returning id into dom;
  insert into skills(name, domain_id, criticality, is_core, reassess_months, is_demo) values
    ('إصدار ومتابعة تصاريح العمل', dom, 'high', true, 12, true),
    ('تطبيق إجراءات العزل والإقفال LOTO', dom, 'critical', true, 12, true);

  -- ---------------- Employees (fictitious) ----------------
  site_ids := array(select id from sites where is_demo and type not in ('system','line') order by code);
  for i in 1..36 loop
    sid := case
      when i <= 8 then cr
      when i <= 20 then (select id from sites where code = 'PS' || (((i - 9) % 3) + 1)::text)
      when i <= 22 then (select id from sites where code = 'HPT')
      when i <= 30 then site_ids[1 + (i % array_length(site_ids, 1))]
      when i <= 33 then st
      else et end;
    select id into sh from shifts where site_id = sid order by start_time offset ((i % (select count(*) from shifts where site_id = sid)::int)) limit 1;
    insert into employees(employee_number, full_name, job_title, department_id, primary_site_id, shift_id, hire_date, status,
                          qualifications, strengths, interests, desired_skills, capabilities, is_demo)
    values ('DEMO-' || lpad(i::text, 3, '0'), 'موظف تجريبي ' || lpad(i::text, 2, '0'),
            (array['مشغل محطة', 'مشغل أول', 'فني تشغيل', 'مراقب غرفة تحكم', 'مشغل خزانات'])[1 + (i % 5)],
            case when sid = cr then d_ctrl when sid in (st, et) then d_maint else d_ops end,
            sid, sh, date '2012-01-01' + (i * 97) % 4000, (case when i = 17 then 'on_leave' else 'active' end)::employee_status,
            'دبلوم تقني (بيانات تجريبية)', case when i % 4 = 0 then 'إعداد التقارير وتحليل البيانات' when i % 4 = 1 then 'حل المشكلات الميدانية' else null end,
            case when i % 3 = 0 then 'أنظمة SCADA' else null end, case when i % 5 = 0 then 'أنظمة VSD' else null end,
            case when i % 4 = 0 then '{reports,data}'::text[] when i % 4 = 1 then '{problem_solving}'::text[] else '{}'::text[] end, true)
    returning id into e;
    emp_ids := emp_ids || e;
    insert into employee_private(employee_id, phone, email) values (e, '0500000' || lpad(i::text, 3, '0'), 'demo' || i || '@example.invalid');
  end loop;
  -- supervisors-as-employees as managers for some
  update employees set manager_id = emp_ids[1] where primary_site_id = cr and id <> emp_ids[1];

  -- employee skills (only applicable skills; deterministic pseudo-random levels)
  for e in select unnest(emp_ids) loop
    for k in select k.id from skills k join employees x on x.id = e join sites s on s.id = x.primary_site_id
              where k.is_demo and ((cardinality(k.applicable_site_types) = 0) or s.type = any(k.applicable_site_types)) loop
      lvl := 1 + floor(random() * 4)::int;
      if random() < 0.85 then
        insert into employee_skills(employee_id, skill_id, level, assessed_at, notes, next_reassess_at, is_demo)
        values (e, k, lvl, current_date - (random() * 300)::int, 'تقييم تجريبي',
                case when random() < 0.2 then current_date + (random() * 40)::int - 10 else current_date + 200 end, true);
      end if;
    end loop;
  end loop;

  -- ---------------- Tasks ----------------
  for i in 1..24 loop
    e := emp_ids[1 + (i * 7) % 36];
    insert into tasks(title, description, type, site_id, priority, owner_employee_id, due_at, status, blocked_reason, checklist, is_demo)
    values (
      (array['فحص دوري لمضخة رقم 2', 'متابعة إنذار ارتفاع الضغط', 'تحديث سجل القراءات الأسبوعي', 'مراجعة إجراء العزل في المحطة',
             'تنسيق مع قسم الصيانة بشأن صمام المدخل', 'تدريب موظف جديد على شاشات SCADA', 'متابعة ملاحظة تسليم الوردية',
             'إعداد تقرير الأداء الشهري'])[1 + i % 8] || ' (تجريبي ' || i || ')',
      'مهمة تجريبية لأغراض العرض',
      (array['periodic','operational','observation_followup','administrative','interdept_followup','training','observation_followup','administrative'])[1 + i % 8]::task_type,
      (select primary_site_id from employees where id = e),
      (array['low','normal','high','critical'])[1 + i % 4]::task_priority, e,
      now() + ((i % 9) - 4) * interval '1 day',
      (array['assigned','in_progress','waiting_other_party','completed','in_progress','new','assigned','completed'])[1 + i % 8]::task_status,
      case when (1 + i % 8) = 3 then 'بانتظار رد قسم الصيانة (تجريبي)' end,
      '[{"text":"مراجعة الإجراء","done":true},{"text":"التنفيذ الميداني","done":false},{"text":"توثيق النتيجة","done":false}]'::jsonb,
      true);
  end loop;
  insert into tasks(title, type, site_id, priority, owner_employee_id, recurrence, due_at, status, is_demo)
  values ('جولة تفقد يومية للمحطة (متكررة - تجريبي)', 'periodic', (select id from sites where code = 'PS1'), 'normal', emp_ids[9], 'daily', now() + interval '8 hours', 'assigned', true);

  -- ---------------- Leave ----------------
  insert into leave_requests(employee_id, leave_type_id, start_date, end_date, notes, status, is_demo)
  select emp_ids[x], (select id from leave_types where code = 'ANNUAL'), current_date + x, current_date + x + 6, 'طلب تجريبي',
         (array['pending_review','recommended','approved','draft','pending_review'])[1 + x % 5]::leave_status, true
  from generate_series(2, 30, 4) x;

  -- ---------------- Handover ----------------
  select id into sh from shifts where site_id = cr order by start_time limit 1;
  insert into shift_handover_reports(site_id, shift_id, handover_at, outgoing_employee_id, incoming_employee_id, systems_status,
    general_notes, next_shift_instructions, outgoing_confirmed_at, status, is_demo)
  values (cr, sh, now() - interval '3 hours', emp_ids[2], emp_ids[3], 'جميع الأنظمة تعمل بشكل طبيعي عدا ملاحظة على خط G (تجريبي)',
          'وردية هادئة', 'متابعة قراءة الضغط على خط G كل ساعة', now() - interval '3 hours', 'submitted', true)
  returning id into rep;
  insert into handover_items(report_id, kind, description, event_time, reference_no, status) values
    (rep, 'alarm_event', 'إنذار تذبذب ضغط على خط G (تجريبي)', now() - interval '5 hours', 'ALM-DEMO-001', 'open'),
    (rep, 'out_of_service', 'المضخة رقم 3 في PS2 خارج الخدمة للصيانة (تجريبي)', now() - interval '1 day', 'WO-DEMO-1001', 'open'),
    (rep, 'followup', 'التأكد من إغلاق تصريح العمل رقم 55 (تجريبي)', null, null, 'closed');

  -- ---------------- Training & development ----------------
  insert into training_courses(name, provider, start_date, end_date, location, skill_ids, is_demo) values
    ('أساسيات أنظمة VSD', 'مركز التدريب الداخلي (تجريبي)', current_date + 5, current_date + 7, 'قاعة التدريب', array(select id from skills where name like '%VSD%'), true),
    ('الاستجابة للطوارئ في محطات الضخ', 'جهة تدريب خارجية (تجريبي)', current_date + 20, current_date + 22, 'عن بعد', array(select id from skills where name like '%الطوارئ%'), true),
    ('مراقبة الإنذارات في SCADA', 'مركز التدريب الداخلي (تجريبي)', current_date - 40, current_date - 38, 'غرفة التحكم', array(select id from skills where name like '%الإنذارات%'), true);
  insert into training_enrollments(course_id, employee_id, status, result)
  select c.id, emp_ids[x], case when c.start_date < current_date then 'attended' else 'nominated' end::enrollment_status,
         case when c.start_date < current_date then 'حضر الدورة - لم يُقيّم عمليًا بعد' end
  from training_courses c, generate_series(1, 6) x where c.is_demo;
  insert into development_plans(employee_id, goal, target_skill_id, method, mentor_employee_id, start_date, end_date, status, progress, level_before, is_demo)
  select emp_ids[x], 'الوصول إلى مستوى التنفيذ باستقلالية في ' || k.name, k.id,
         (array['on_job','mentoring','course','procedure_study'])[1 + x % 4]::plan_method, emp_ids[1],
         current_date - 30, current_date + (x * 10) - 40,
         (array['in_progress','planned','awaiting_practical','in_progress'])[1 + x % 4]::plan_status, (x * 13) % 100, 2, true
  from generate_series(2, 9) x cross join lateral (select id, name from skills where is_demo order by name offset x limit 1) k;

  -- ---------------- Ideas ----------------
  insert into improvement_ideas(title, problem, proposal, kind, submitted_by_employee_id, site_id, status, is_demo) values
    ('نموذج موحد لقراءات المحطات الطرفية', 'اختلاف طريقة تسجيل القراءات بين المحطات', 'اعتماد نموذج رقمي موحد', 'idea', emp_ids[24], (select primary_site_id from employees where id = emp_ids[24]), 'under_review', true),
    ('دليل مختصر للتعامل مع إنذارات الضغط', 'تأخر الاستجابة لبعض الإنذارات', 'إعداد بطاقة إجراءات سريعة في غرفة التحكم', 'initiative', emp_ids[4], cr, 'in_progress', true),
    ('مهارة إضافية: تحليل البيانات في Excel', null, 'الموظف يجيد تحليل البيانات ويمكنه دعم التقارير', 'extra_skill', emp_ids[12], (select primary_site_id from employees where id = emp_ids[12]), 'approved', true);

  -- ---------------- Performance review sample ----------------
  insert into performance_reviews(employee_id, period_start, period_end, status, supervisor_comment, next_development_step, is_demo)
  values (emp_ids[5], date_trunc('quarter', current_date)::date - interval '3 months', date_trunc('quarter', current_date)::date - 1, 'draft',
          'تقييم تجريبي', 'التدريب على إعداد التقارير', true);
  insert into performance_review_scores(review_id, criterion_id, rating_level_id)
  select (select id from performance_reviews where is_demo limit 1), c.id, (select id from rating_levels order by random() limit 1)
  from review_criteria c;

  update system_settings set value = '"منظومة إدارة وتمكين فريق التشغيل"' where key = 'platform_name';
end $$;

-- spread demo employees over the rotation groups A/B/C/D
update employees e set group_id = g.id
from (select id, row_number() over (order by employee_number) rn from employees where is_demo and group_id is null) x,
     (select id, row_number() over (order by code) - 1 idx from shift_groups) g
where e.id = x.id and g.idx = (x.rn - 1) % 4;

-- ---------------------------------------------------------------------
-- Demo: rotation requests, overtime, leaves and balances (relative to today)
-- ---------------------------------------------------------------------
do $$
declare
  ga uuid := (select id from shift_groups where code = 'A'); gb uuid := (select id from shift_groups where code = 'B');
  gc uuid := (select id from shift_groups where code = 'C'); gd uuid := (select id from shift_groups where code = 'D');
  d date; a1 date; b1 date; e uuid[]; today_d uuid; today_n uuid; i int;
begin
  if not exists (select 1 from employees where is_demo) then return; end if;
  select array_agg(id order by employee_number) into e from employees where is_demo;
  today_d := (select id from shift_groups where app.group_shift(id, current_date) = 'D' limit 1);
  today_n := (select id from shift_groups where app.group_shift(id, current_date) = 'N' limit 1);

  -- approved swap A <-> B (A's next 2 working days that B is off, and B's following 2 days that A is off)
  d := current_date + 1;
  while not (app.group_shift(ga, d) <> 'O' and app.group_shift(gb, d) = 'O' and app.group_shift(ga, d + 1) = app.group_shift(ga, d) and app.group_shift(gb, d + 1) = 'O') loop d := d + 1; end loop;
  a1 := d; d := a1 + 2;
  while not (app.group_shift(gb, d) <> 'O' and app.group_shift(ga, d) = 'O' and app.group_shift(gb, d + 1) = app.group_shift(gb, d) and app.group_shift(ga, d + 1) = 'O') loop d := d + 1; end loop;
  b1 := d;
  insert into shift_swaps(group_a_id, group_b_id, a_start, a_end, b_start, b_end, reason, status, decision_note, decided_at, is_demo)
  values (ga, gb, a1, a1 + 1, b1, b1 + 1, 'مناسبة عائلية لأغلب أفراد المجموعة A (تجريبي)', 'approved', 'موافق، التبديل متوازن', now(), true);

  -- pending swap C <-> D
  d := current_date + 1;
  while not (app.group_shift(gc, d) <> 'O' and app.group_shift(gd, d) = 'O' and app.group_shift(gc, d + 1) = app.group_shift(gc, d) and app.group_shift(gd, d + 1) = 'O') loop d := d + 1; end loop;
  insert into shift_swaps(group_a_id, group_b_id, a_start, a_end, reason, is_demo)
  values (gc, gd, d, d + 1, 'دورة تدريبية لعدد من أفراد المجموعة C (تجريبي)', true);

  -- annual leave today for two members of today's day group, one of the night group
  insert into leave_requests(employee_id, leave_type_id, start_date, end_date, status, decision_reason, decided_at, notes, is_demo)
  select x.id, (select id from leave_types where code = 'ANNUAL'), current_date - 2, current_date + 5, 'approved', 'معتمد (تجريبي)', now(), 'إجازة سنوية (تجريبي)', true
  from (select id from employees where is_demo and group_id = today_d order by employee_number limit 2) x;
  insert into leave_requests(employee_id, leave_type_id, start_date, end_date, status, decision_reason, decided_at, is_demo)
  select x.id, (select id from leave_types where code = 'ANNUAL'), current_date, current_date + 3, 'approved', 'معتمد (تجريبي)', now(), true
  from (select id from employees where is_demo and group_id = today_n order by employee_number limit 1) x;

  -- coverage: approved overtime today (off-duty member covers a day-shift absentee), pending one, approved day compensation
  insert into coverage_requests(work_date, shift_kind, absent_employee_id, covering_employee_id, method, hours, reason, status, decided_at, is_demo)
  select current_date, 'D', (select id from employees where is_demo and group_id = today_d order by employee_number limit 1),
         (select id from employees where is_demo and group_id not in (today_d, today_n) order by employee_number limit 1),
         'overtime', 12, 'تغطية إجازة سنوية (تجريبي)', 'approved', now(), true;
  insert into coverage_requests(work_date, shift_kind, absent_employee_id, covering_employee_id, method, comp_days, reason, status, decided_at, is_demo)
  select current_date, 'N', (select id from employees where is_demo and group_id = today_n order by employee_number limit 1),
         (select id from employees where is_demo and group_id not in (today_d, today_n) order by employee_number offset 1 limit 1),
         'day_compensation', 1, 'تغطية إجازة (تجريبي)', 'approved', now(), true;
  insert into coverage_requests(work_date, shift_kind, covering_employee_id, method, hours, reason, is_demo)
  select current_date + 3, 'N', (select id from employees where is_demo and group_id not in (today_d, today_n) order by employee_number offset 2 limit 1),
         'overtime', 12, 'نقص في الوردية الليلية (تجريبي)', true;

  -- overtime log this month: breakdowns, pipe bursts, emergencies
  for i in 1..9 loop
    insert into overtime_entries(employee_id, work_date, hours, cause, site_id, description, reference_no, status, decided_at, is_demo)
    values (e[1 + (i * 5) % array_length(e, 1)], greatest(date_trunc('month', current_date)::date, current_date - i * 2), (array[4, 6, 8, 3, 5, 10, 6, 4, 7])[i],
            (array['pipe_burst','breakdown','pipe_burst','breakdown','emergency','pipe_burst','planned_work','breakdown','pipe_burst'])[i]::overtime_cause,
            (select primary_site_id from employees where id = e[1 + (i * 5) % array_length(e, 1)]),
            (array['انكسار خط رئيسي وإصلاحه','عطل مضخة رقم 2','تسرب في خط التغذية','عطل صمام تحكم','انقطاع كهرباء طارئ','انكسار خط فرعي','صيانة مجدولة لخزان','عطل حساس ضغط','انكسار وصلة'])[i] || ' (تجريبي)',
            'DEMO-' || (4100 + i), case when i = 9 then 'pending' else 'approved' end::rotation_status, case when i = 9 then null else now() end, true);
  end loop;

  -- transfers: approved temporary, pending permanent
  insert into group_transfers(employee_id, to_group_id, kind, start_date, end_date, reason, status, decided_at, is_demo)
  select e[5], (select id from shift_groups where id <> (select group_id from employees where id = e[5]) order by code limit 1),
         'temporary', current_date - 1, current_date + 10, 'دعم مجموعة بها نقص (تجريبي)', 'approved', now(), true;
  insert into group_transfers(employee_id, to_group_id, kind, start_date, reason, is_demo)
  select e[9], (select id from shift_groups where id <> (select group_id from employees where id = e[9]) order by code desc limit 1),
         'permanent', current_date + 14, 'طلب الموظف لظروف السكن (تجريبي)', true;

  -- leave balances for the current year (varied, some above the 10-day carry-over cap)
  insert into leave_balances(employee_id, year, entitlement, carried_over, adjustment, notes)
  select id, extract(year from current_date)::int, case when rn % 4 = 0 then 33 else 30 end, (rn * 3) % 11,
         -(12 + (rn * 7) % 25), 'رصيد تجريبي'
  from (select id, row_number() over (order by employee_number) rn from employees where is_demo) x
  on conflict (employee_id, year) do nothing;
end $$;
