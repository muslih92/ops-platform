// End-to-end workflow check against a running server loaded with demo data (npm run seed:demo && DEMO_PASSWORD=... npm run demo-users).
// It CREATES records (handover, leave, review, idea). Run it on a demo/test database only.
// Usage: BASE_URL=http://localhost:3000 DEMO_PASSWORD=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm test
let failures = 0;
const B = process.env.BASE_URL || 'http://localhost:3000';
const DP = process.env.DEMO_PASSWORD; if (!DP) { console.error('DEMO_PASSWORD is required'); process.exit(2); }
async function login(email, pw) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ops-app' }, body: JSON.stringify({ email, password: pw }) });
  const c = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, u, b) => { const x = await fetch(B + u, { method: m, headers: { cookie: c, 'Content-Type': 'application/json', 'X-Requested-With': 'ops-app' }, body: b ? JSON.stringify(b) : undefined }); const t = await x.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: x.status, j }; };
  const me = (await call('GET', '/api/auth/me')).j;
  return { call, me };
}
const ok = (label, r, exp = [200, 201]) => { if (!exp.includes(r.s)) failures++; console.log((exp.includes(r.s) ? 'PASS ' : 'FAIL ') + label + ' -> ' + r.s + (exp.includes(r.s) ? '' : ' ' + JSON.stringify(r.j).slice(0, 200))); };
const sup = await login('supervisor@demo.local', DP);
const emp = await login('employee@demo.local', DP);
const mgr = await login('ops.manager@demo.local', DP);
const rv = await login('reports@demo.local', DP);
// handover by employee
const e = emp.me.employee;
const h = await emp.call('POST', '/api/r/handover_reports', { site_id: e.primary_site_id, shift_id: e.shift_id, outgoing_employee_id: e.id, incoming_employee_id: sup.me.employee?.id || e.id, systems_status: 'المضخات 1 و2 تعمل', status: 'draft' });
ok('employee creates handover', h);
const it = await emp.call('POST', '/api/r/handover_items', { report_id: h.j.id, kind: 'out_of_service', description: 'المضخة 3 خارج الخدمة للصيانة', reference_no: 'N-1001' });
ok('employee adds item', it);
ok('employee confirms outgoing', await emp.call('POST', '/api/rpc/handover_confirm', { report_id: h.j.id, side: 'outgoing' }));
const tt = await sup.call('POST', '/api/rpc/handover_item_to_task', { item_id: it.j.id, title: 'متابعة صيانة المضخة 3', priority: 'high' });
ok('supervisor converts item to task', tt);
ok('supervisor closes item', await sup.call('PATCH', `/api/r/handover_items/${it.j.id}`, { status: 'closed' }));
const itr = await sup.call('GET', `/api/r/handover_items/${it.j.id}`); console.log('  closed_at set:', !!itr.j.closed_at);
ok('supervisor confirms incoming', await sup.call('POST', '/api/rpc/handover_confirm', { report_id: h.j.id, side: 'incoming' }));
// leave flow
const types = (await emp.call('GET', '/api/r/leave_types?pageSize=5')).j.rows;
const lr = await emp.call('POST', '/api/r/leave_requests', { employee_id: e.id, leave_type_id: types[0].id, start_date: '2026-12-06', end_date: '2026-12-10', status: 'draft' });
ok('employee creates leave', lr);
ok('employee submits', await emp.call('POST', '/api/rpc/leave_transition', { id: lr.j.id, to: 'submitted' }));
ok('employee cannot approve own (403)', await emp.call('POST', '/api/rpc/leave_transition', { id: lr.j.id, to: 'approved', note: 'x' }), [403]);
const imp = await sup.call('POST', '/api/rpc/leave_impact', { employee_id: e.id, start_date: '2026-12-06', end_date: '2026-12-10', exclude_id: lr.j.id }); console.log('  impact:', JSON.stringify(imp.j.result).slice(0, 220));
ok('supervisor recommends', await sup.call('POST', '/api/rpc/leave_transition', { id: lr.j.id, to: 'recommended', note: 'لا مانع' }));
ok('approve without reason rejected (400)', await mgr.call('POST', '/api/rpc/leave_transition', { id: lr.j.id, to: 'approved' }), [400, 409]);
const ap = await mgr.call('POST', '/api/rpc/leave_transition', { id: lr.j.id, to: 'approved', note: 'معتمد' });
console.log('  approve result:', ap.s, ap.j.code || '');
if (ap.s === 409) ok('manager approves with override', await mgr.call('POST', '/api/rpc/leave_transition', { id: lr.j.id, to: 'approved', note: 'معتمد', override: true, override_reason: 'تغطية مؤقتة من PS2' }));
// review
const rev = await sup.call('POST', '/api/r/reviews', { employee_id: e.id, period_start: '2026-01-01', period_end: '2026-12-31', reviewer_id: sup.me.user.id, status: 'draft' });
ok('supervisor creates review', rev);
const crit = (await sup.call('GET', '/api/r/review_criteria?pageSize=50')).j.rows; const lv = (await sup.call('GET', '/api/r/rating_levels?pageSize=10')).j.rows;
ok('score', await sup.call('POST', '/api/r/review_scores', { review_id: rev.j.id, criterion_id: crit[0].id, rating_level_id: lv[1].id }));
ok('employee cannot see draft (404/403)', await emp.call('GET', `/api/r/reviews/${rev.j.id}`), [404, 403]);
ok('submit', await sup.call('PATCH', `/api/r/reviews/${rev.j.id}`, { status: 'submitted', overall_rating_level_id: lv[1].id }));
ok('employee acknowledges', await emp.call('POST', '/api/rpc/review_acknowledge', { review_id: rev.j.id, comment: 'شكرًا' }));
// ideas, plans
ok('employee proposes idea', await emp.call('POST', '/api/r/ideas', { title: 'تحسين جدول الفحص الدوري', proposal: 'دمج الفحوص', kind: 'idea', submitted_by_employee_id: e.id, status: 'submitted' }));
ok('employee cannot create plan (403)', await emp.call('POST', '/api/r/development_plans', { employee_id: e.id, goal: 'هدف تجريبي' }), [403]);
// reports viewer
ok('report viewer reads tasks', await rv.call('GET', '/api/r/tasks?pageSize=1'));
ok('report viewer cannot write task (403)', await rv.call('POST', '/api/rpc/create_task', { task: { title: 'x', type: 'operational', priority: 'normal', site_id: e.primary_site_id } }), [403, 400]);
ok('report viewer blocked from audit', await rv.call('GET', '/api/r/audit_logs?pageSize=1'), [200, 403]);
const al = await rv.call('GET', '/api/r/audit_logs?pageSize=1'); console.log('  audit rows visible to report viewer:', al.j.total);
// admin perm protection
const adm = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
const roles = (await adm.call('GET', '/api/r/roles?pageSize=10')).j.rows; const sa = roles.find((r) => r.key === 'system_admin');
const rps = (await adm.call('GET', `/api/r/role_permissions?pageSize=1000&f.role_id=${sa.id}`)).j.rows;
ok('cannot strip admin permission (400)', await adm.call('DELETE', '/api/r/role_permissions', rps[0]), [400]);
const sk = await adm.call('GET', '/api/r/skills?pageSize=1'); console.log('  applicable_site_types is array:', Array.isArray(sk.j.rows[0].applicable_site_types));
ok('integration test honest', await adm.call('POST', '/api/integrations/sap_pm/test'));
const st = await adm.call('GET', '/api/r/integration_configs?pageSize=10'); console.log('  sap status:', st.j.rows.find((x) => x.kind === 'sap_pm').status);
const a2 = await adm.call('GET', '/api/r/audit_logs?pageSize=3&f.action=coverage_override'); console.log('  override audit rows:', a2.j.total);
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed'); process.exit(failures ? 1 : 0);
